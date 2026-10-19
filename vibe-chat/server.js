'use strict';
/*
 * Vibe Chat サーバー
 *  - HTTP: 静的ファイル配信 / ファイルアップロード / アップロード済みファイル配信
 *  - WebSocket(/ws): チャット・ステータス・フロー・共同編集ドキュメントのリアルタイム同期
 *  - 状態はメモリに持ち、data/state.json に定期保存する
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { TextOperation } = require('./public/ot.js');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.VIBE_DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const MAX_UPLOAD = 50 * 1024 * 1024; // 50MB
const MAX_TEXT = 8000;
const MAX_DOC = 200000;
const HISTORY_PER_CONV = 300; // 接続時に送る会話ごとのメッセージ数

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const VENDOR = {
  '/vendor/marked.js': path.join(__dirname, 'node_modules/marked/lib/marked.umd.js'),
  '/vendor/purify.js': path.join(__dirname, 'node_modules/dompurify/dist/purify.min.js'),
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

const COLORS = ['#7c5cff', '#ff5c8a', '#00c2a8', '#ffb020', '#3fa7ff', '#ff7a45', '#a259ff', '#2ecc71', '#e84393', '#00b8d9'];

const id = (n = 10) => crypto.randomBytes(n).toString('base64url').slice(0, n);
const now = () => Date.now();
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

// ───────────────────────── 状態 ─────────────────────────

let state = {
  users: {}, // id -> { id, name, color, status, flow, lastSeen }
  channels: {}, // id -> { id, name, topic, createdBy, createdAt }
  messages: [], // { id, convId, userId, text, ts, parentId, files, docId, reactions, system }
  docs: {}, // id -> { id, title, text, rev, convId, createdBy, createdAt, updatedAt }
  files: {}, // id -> { id, name, size, mime, path, userId, ts }
};

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    state = { ...state, ...raw };
    console.log(`[vibe] state loaded: ${state.messages.length} messages, ${Object.keys(state.docs).length} docs`);
  } catch {
    // 初回起動
  }
  if (!Object.keys(state.channels).length) {
    for (const [name, topic] of [
      ['general', 'チーム全体のアナウンスと雑談'],
      ['random', '気軽になんでも'],
      ['dev', '開発・技術の話題'],
    ]) {
      const cid = id(8);
      state.channels[cid] = { id: cid, name, topic, createdBy: null, createdAt: now() };
    }
  }
}
loadState();

let saveTimer = null;
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const tmp = STATE_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(state), (err) => {
      if (err) return console.error('[vibe] save failed', err);
      fs.rename(tmp, STATE_FILE, () => {});
    });
  }, 1000);
}

// 実行時のみの状態
const docRuntime = new Map(); // docId -> { history: TextOperation[], historyBase, subscribers: Set<ws>, cursors: Map }
const clients = new Set(); // ws (ws.userId を持つ)

function runtimeFor(docId) {
  let rt = docRuntime.get(docId);
  if (!rt) {
    rt = { history: [], historyBase: state.docs[docId].rev, subscribers: new Set() };
    docRuntime.set(docId, rt);
  }
  return rt;
}

// ───────────────────────── ヘルパー ─────────────────────────

const isDm = (convId) => convId.startsWith('d:');
const dmId = (a, b) => 'd:' + [a, b].sort().join(':');

function convExists(convId) {
  if (typeof convId !== 'string') return false;
  if (convId.startsWith('c:')) return !!state.channels[convId.slice(2)];
  if (isDm(convId)) {
    const [, a, b] = convId.split(':');
    return !!state.users[a] && !!state.users[b] && dmId(a, b) === convId;
  }
  return false;
}

function canSee(userId, convId) {
  if (convId.startsWith('c:')) return true;
  if (isDm(convId)) return convId.split(':').slice(1).includes(userId);
  return false;
}

function isOnline(userId) {
  for (const ws of clients) if (ws.userId === userId) return true;
  return false;
}

function isAway(userId) {
  let any = false;
  for (const ws of clients) {
    if (ws.userId !== userId) continue;
    if (!ws.away) return false;
    any = true;
  }
  return any;
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    color: u.color,
    status: u.status || null,
    flow: u.flow || null,
    lastSeen: u.lastSeen || null,
    presence: isOnline(u.id) ? (isAway(u.id) ? 'away' : 'online') : 'offline',
  };
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(msg, filter = () => true) {
  const data = JSON.stringify(msg);
  for (const ws of clients) if (ws.userId && ws.readyState === 1 && filter(ws)) ws.send(data);
}

function toConv(convId, msg, except) {
  broadcast(msg, (ws) => ws !== except && canSee(ws.userId, convId));
}

function broadcastUser(userId) {
  const u = state.users[userId];
  if (u) broadcast({ type: 'user:update', user: publicUser(u) });
}

function docMeta(d) {
  const rt = docRuntime.get(d.id);
  const editors = rt ? [...new Set([...rt.subscribers].map((w) => w.userId))] : [];
  return {
    id: d.id,
    title: d.title,
    convId: d.convId,
    createdBy: d.createdBy,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    length: d.text.length,
    editors,
  };
}

function broadcastDocMeta(docId) {
  const d = state.docs[docId];
  if (d) toConv(d.convId, { type: 'doc:meta', doc: docMeta(d) });
}

function threadStats(parentId) {
  const replies = state.messages.filter((m) => m.parentId === parentId);
  return {
    replyCount: replies.length,
    lastReplyTs: replies.length ? replies[replies.length - 1].ts : null,
    replyUsers: [...new Set(replies.map((r) => r.userId))].slice(-5),
  };
}

function decorate(m) {
  return m.parentId ? m : { ...m, ...threadStats(m.id) };
}

function addMessage(m) {
  state.messages.push(m);
  saveSoon();
  toConv(m.convId, { type: 'message:new', message: decorate(m) });
  if (m.parentId) {
    const parent = state.messages.find((x) => x.id === m.parentId);
    if (parent) toConv(m.convId, { type: 'message:update', message: decorate(parent) });
  }
}

function sanitizeFiles(files, userId) {
  if (!Array.isArray(files)) return [];
  return files
    .slice(0, 10)
    .map((f) => state.files[f && f.id])
    .filter((f) => f && f.userId === userId)
    .map((f) => ({ id: f.id, name: f.name, size: f.size, mime: f.mime }));
}

const FLOW_MODES = new Set(['focus', 'brainstorm', 'writing', 'review', 'meeting', 'break', 'custom']);

// ───────────────────────── WebSocket ハンドラ ─────────────────────────

const handlers = {
  hello(ws, msg) {
    const name = str(msg.name, 24).trim();
    if (!name) return send(ws, { type: 'error', message: '名前を入力してください' });
    let user = Object.values(state.users).find((u) => u.name.toLowerCase() === name.toLowerCase());
    if (!user) {
      const uid = id(8);
      user = {
        id: uid,
        name,
        color: COLORS[Object.keys(state.users).length % COLORS.length],
        status: null,
        flow: null,
        lastSeen: now(),
      };
      state.users[uid] = user;
      saveSoon();
    }
    ws.userId = user.id;
    ws.away = false;

    // 会話ごとに直近 HISTORY_PER_CONV 件(+ そのスレッド返信)を送る
    const byConv = new Map();
    for (const m of state.messages) {
      if (m.parentId || !canSee(user.id, m.convId)) continue;
      if (!byConv.has(m.convId)) byConv.set(m.convId, []);
      byConv.get(m.convId).push(m);
    }
    const roots = new Set();
    for (const list of byConv.values()) for (const m of list.slice(-HISTORY_PER_CONV)) roots.add(m.id);
    const messages = state.messages.filter((m) => roots.has(m.parentId || m.id)).map(decorate);

    send(ws, {
      type: 'init',
      me: user.id,
      users: Object.values(state.users).map(publicUser),
      channels: Object.values(state.channels),
      messages,
      docs: Object.values(state.docs)
        .filter((d) => canSee(user.id, d.convId))
        .map(docMeta),
    });
    broadcastUser(user.id);
  },

  presence(ws, msg) {
    ws.away = !!msg.away;
    broadcastUser(ws.userId);
  },

  'status:set'(ws, msg) {
    const u = state.users[ws.userId];
    const text = str(msg.text, 80).trim();
    const emoji = str(msg.emoji, 8);
    const expiresAt = Number.isFinite(msg.expiresAt) ? msg.expiresAt : null;
    u.status = text || emoji ? { text, emoji, expiresAt } : null;
    saveSoon();
    broadcastUser(u.id);
  },

  'flow:set'(ws, msg) {
    const u = state.users[ws.userId];
    if (!FLOW_MODES.has(msg.mode)) return;
    u.flow = {
      mode: msg.mode,
      topic: str(msg.topic, 80).trim(),
      label: str(msg.label, 40).trim(),
      startedAt: now(),
      until: Number.isFinite(msg.until) && msg.until > now() ? msg.until : null,
    };
    saveSoon();
    broadcastUser(u.id);
  },

  'flow:clear'(ws) {
    const u = state.users[ws.userId];
    u.flow = null;
    saveSoon();
    broadcastUser(u.id);
  },

  'channel:create'(ws, msg) {
    const name = str(msg.name, 32)
      .trim()
      .toLowerCase()
      .replace(/^#/, '')
      .replace(/\s+/g, '-');
    if (!name) return send(ws, { type: 'error', message: 'チャンネル名を入力してください' });
    if (Object.values(state.channels).some((c) => c.name === name)) {
      return send(ws, { type: 'error', message: `#${name} は既に存在します` });
    }
    const cid = id(8);
    const ch = { id: cid, name, topic: str(msg.topic, 120).trim(), createdBy: ws.userId, createdAt: now() };
    state.channels[cid] = ch;
    saveSoon();
    broadcast({ type: 'channel:new', channel: ch });
    send(ws, { type: 'channel:created', channelId: cid });
  },

  'message:send'(ws, msg) {
    const convId = msg.convId;
    if (!convExists(convId) || !canSee(ws.userId, convId)) return;
    const text = str(msg.text, MAX_TEXT);
    const files = sanitizeFiles(msg.files, ws.userId);
    if (!text.trim() && !files.length) return;
    let parentId = null;
    if (msg.parentId) {
      const parent = state.messages.find((m) => m.id === msg.parentId && m.convId === convId && !m.parentId);
      if (!parent) return;
      parentId = parent.id;
    }
    addMessage({
      id: id(12),
      convId,
      userId: ws.userId,
      text,
      ts: now(),
      parentId,
      files,
      reactions: {},
      clientId: str(msg.clientId, 40),
    });
  },

  'message:delete'(ws, msg) {
    const m = state.messages.find((x) => x.id === msg.id);
    if (!m || m.userId !== ws.userId || m.deleted) return;
    m.deleted = true;
    m.text = '';
    m.files = [];
    saveSoon();
    toConv(m.convId, { type: 'message:update', message: decorate(m) });
  },

  'reaction:toggle'(ws, msg) {
    const m = state.messages.find((x) => x.id === msg.id);
    const emoji = str(msg.emoji, 8);
    if (!m || !emoji || m.deleted || !canSee(ws.userId, m.convId)) return;
    m.reactions = m.reactions || {};
    const list = m.reactions[emoji] || [];
    const i = list.indexOf(ws.userId);
    if (i >= 0) list.splice(i, 1);
    else list.push(ws.userId);
    if (list.length) m.reactions[emoji] = list;
    else delete m.reactions[emoji];
    saveSoon();
    toConv(m.convId, { type: 'message:update', message: decorate(m) });
  },

  typing(ws, msg) {
    if (!convExists(msg.convId) || !canSee(ws.userId, msg.convId)) return;
    toConv(msg.convId, { type: 'typing', convId: msg.convId, parentId: msg.parentId || null, userId: ws.userId }, ws);
  },

  // ライブ・ファイル共有: アップロード進捗を会話の参加者にリアルタイム配信
  'upload:progress'(ws, msg) {
    if (!convExists(msg.convId) || !canSee(ws.userId, msg.convId)) return;
    toConv(
      msg.convId,
      {
        type: 'upload:progress',
        convId: msg.convId,
        parentId: msg.parentId || null,
        userId: ws.userId,
        tempId: str(msg.tempId, 40),
        name: str(msg.name, 200),
        size: Number(msg.size) || 0,
        pct: Math.max(0, Math.min(100, Number(msg.pct) || 0)),
        state: ['uploading', 'done', 'error'].includes(msg.state) ? msg.state : 'uploading',
      },
      ws
    );
  },

  // ───── 共同編集ドキュメント ─────
  'doc:create'(ws, msg) {
    const convId = msg.convId;
    if (!convExists(convId) || !canSee(ws.userId, convId)) return;
    const title = str(msg.title, 80).trim() || '無題のドキュメント';
    const did = id(10);
    const t = now();
    state.docs[did] = {
      id: did,
      title,
      text: `# ${title}\n\n`,
      rev: 0,
      convId,
      createdBy: ws.userId,
      createdAt: t,
      updatedAt: t,
    };
    toConv(convId, { type: 'doc:meta', doc: docMeta(state.docs[did]) });
    addMessage({
      id: id(12),
      convId,
      userId: ws.userId,
      text: '',
      ts: t,
      parentId: null,
      files: [],
      docId: did,
      reactions: {},
    });
    send(ws, { type: 'doc:created', docId: did });
  },

  'doc:join'(ws, msg) {
    const d = state.docs[msg.docId];
    if (!d || !canSee(ws.userId, d.convId)) return send(ws, { type: 'error', message: 'ドキュメントが見つかりません' });
    const rt = runtimeFor(d.id);
    rt.subscribers.add(ws);
    ws.docs.add(d.id);
    send(ws, { type: 'doc:state', docId: d.id, doc: docMeta(d), text: d.text, rev: d.rev });
    broadcastDocMeta(d.id);
  },

  'doc:leave'(ws, msg) {
    leaveDoc(ws, msg.docId);
  },

  'doc:op'(ws, msg) {
    const d = state.docs[msg.docId];
    const rt = d && docRuntime.get(d.id);
    if (!d || !rt || !rt.subscribers.has(ws)) return;
    const rev = msg.rev;
    if (!Number.isInteger(rev) || rev < rt.historyBase || rev > d.rev) {
      return send(ws, { type: 'doc:resync', docId: d.id, text: d.text, rev: d.rev });
    }
    let op;
    try {
      op = TextOperation.fromJSON(msg.op);
      // クライアントが知らない(並行して適用された)操作に対して変換する
      for (const concurrent of rt.history.slice(rev - rt.historyBase)) {
        op = TextOperation.transform(op, concurrent)[0];
      }
      const next = op.apply(d.text);
      if (next.length > MAX_DOC) throw new Error('document too large');
      d.text = next;
    } catch (e) {
      console.warn('[vibe] doc op rejected:', e.message);
      return send(ws, { type: 'doc:resync', docId: d.id, text: d.text, rev: d.rev });
    }
    rt.history.push(op);
    if (rt.history.length > 2000) {
      rt.history.splice(0, 1000);
      rt.historyBase += 1000;
    }
    d.rev++;
    d.updatedAt = now();
    saveSoon();
    send(ws, { type: 'doc:ack', docId: d.id, rev: d.rev });
    const data = JSON.stringify({ type: 'doc:op', docId: d.id, op: op.toJSON(), rev: d.rev, userId: ws.userId });
    for (const sub of rt.subscribers) if (sub !== ws && sub.readyState === 1) sub.send(data);
  },

  'doc:cursor'(ws, msg) {
    const rt = docRuntime.get(msg.docId);
    if (!rt || !rt.subscribers.has(ws)) return;
    const data = JSON.stringify({
      type: 'doc:cursor',
      docId: msg.docId,
      userId: ws.userId,
      sid: ws.sid,
      pos: Number(msg.pos) || 0,
      end: Number(msg.end) || 0,
    });
    for (const sub of rt.subscribers) if (sub !== ws && sub.readyState === 1) sub.send(data);
  },

  'doc:rename'(ws, msg) {
    const d = state.docs[msg.docId];
    if (!d || !canSee(ws.userId, d.convId)) return;
    const title = str(msg.title, 80).trim();
    if (!title) return;
    d.title = title;
    d.updatedAt = now();
    saveSoon();
    broadcastDocMeta(d.id);
  },
};

function leaveDoc(ws, docId) {
  const rt = docRuntime.get(docId);
  ws.docs.delete(docId);
  if (!rt || !rt.subscribers.delete(ws)) return;
  const data = JSON.stringify({ type: 'doc:cursor-leave', docId, sid: ws.sid });
  for (const sub of rt.subscribers) if (sub.readyState === 1) sub.send(data);
  broadcastDocMeta(docId);
}

// ステータス・フローの有効期限切れを掃除
setInterval(() => {
  const t = now();
  for (const u of Object.values(state.users)) {
    let changed = false;
    if (u.flow && u.flow.until && u.flow.until <= t) {
      u.flow = null;
      changed = true;
    }
    if (u.status && u.status.expiresAt && u.status.expiresAt <= t) {
      u.status = null;
      changed = true;
    }
    if (changed) {
      saveSoon();
      broadcastUser(u.id);
    }
  }
}, 5000).unref();

// ───────────────────────── HTTP ─────────────────────────

function serveFile(res, filePath, headers = {}) {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not Found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
      ...headers,
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function handleUpload(req, res) {
  let name;
  try {
    name = decodeURIComponent(req.headers['x-file-name'] || '').replace(/[\\/\0]/g, '_').slice(0, 200);
  } catch {
    name = '';
  }
  name = name || 'file';
  const userId = req.headers['x-user-id'];
  if (!state.users[userId]) return json(res, 401, { error: 'unknown user' });
  const declared = Number(req.headers['content-length']);
  if (declared > MAX_UPLOAD) return json(res, 413, { error: 'ファイルサイズは 50MB までです' });

  const fid = id(16);
  const dest = path.join(UPLOAD_DIR, fid);
  const out = fs.createWriteStream(dest);
  let size = 0;
  let aborted = false;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_UPLOAD && !aborted) {
      aborted = true;
      out.destroy();
      fs.unlink(dest, () => {});
      json(res, 413, { error: 'ファイルサイズは 50MB までです' });
      req.destroy();
    }
  });
  req.pipe(out);
  out.on('finish', () => {
    if (aborted) return;
    const mime = str(req.headers['content-type'], 100) || 'application/octet-stream';
    const f = { id: fid, name, size, mime, path: fid, userId, ts: now() };
    state.files[fid] = f;
    saveSoon();
    json(res, 200, { id: fid, name, size, mime });
  });
  out.on('error', () => {
    if (!aborted) json(res, 500, { error: 'upload failed' });
  });
}

// ブラウザ上で直接表示しても安全な MIME のみ inline で返す
const INLINE_SAFE = /^(image\/(png|jpe?g|gif|webp|avif|bmp)|video\/|audio\/|application\/pdf|text\/plain|text\/markdown|text\/csv|application\/json)/;

function serveUpload(req, res, fid) {
  const f = state.files[fid];
  if (!f) {
    res.writeHead(404);
    return res.end();
  }
  const filePath = path.join(UPLOAD_DIR, f.path);
  fs.stat(filePath, (err, st) => {
    if (err) {
      res.writeHead(404);
      return res.end();
    }
    const inline = INLINE_SAFE.test(f.mime);
    const type = inline ? f.mime : 'application/octet-stream';
    const disposition = `${inline && !req.url.includes('download=1') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`;
    const headers = {
      'Content-Type': type,
      'Content-Disposition': disposition,
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=86400',
    };
    // PDF はブラウザ内蔵ビューアが動くよう CSP を付けない(それ以外はスクリプト実行を禁止)
    if (f.mime !== 'application/pdf') headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; media-src 'self'; img-src 'self'";
    // 動画・音声のシーク用に Range リクエストに対応
    const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (range) {
      const start = range[1] ? Number(range[1]) : st.size - Number(range[2]);
      const end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      if (start >= 0 && start <= end) {
        res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
        return fs.createReadStream(filePath, { start, end }).pipe(res);
      }
    }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (req.method === 'POST' && p === '/api/upload') return handleUpload(req, res);
  if (req.method === 'GET' && p === '/api/health') return json(res, 200, { ok: true, clients: clients.size });
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }
  if (p.startsWith('/files/')) return serveUpload(req, res, p.slice(7));
  if (VENDOR[p]) return serveFile(res, VENDOR[p]);

  let rel;
  try {
    rel = p === '/' ? 'index.html' : decodeURIComponent(p).replace(/^\/+/, '');
  } catch {
    res.writeHead(400);
    return res.end();
  }
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  serveFile(res, filePath);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 * 1024 });

wss.on('connection', (ws) => {
  ws.sid = id(8);
  ws.docs = new Set();
  ws.isAlive = true;
  clients.add(ws);

  ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string' || !Object.hasOwn(handlers, msg.type)) return;
    if (msg.type !== 'hello' && !ws.userId) return;
    try {
      handlers[msg.type](ws, msg);
    } catch (e) {
      console.error('[vibe] handler error', msg.type, e);
    }
  });
  ws.on('close', () => {
    clients.delete(ws);
    for (const docId of [...ws.docs]) leaveDoc(ws, docId);
    if (ws.userId) {
      const u = state.users[ws.userId];
      if (u) {
        u.lastSeen = now();
        saveSoon();
      }
      broadcastUser(ws.userId);
    }
  });
});

// 切れた接続を検出する heartbeat
setInterval(() => {
  for (const ws of clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000).unref();

server.listen(PORT, HOST, () => {
  const cs = process.env.CODESPACE_NAME;
  const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  console.log(`\n  🌊 Vibe Chat is running on http://localhost:${PORT}`);
  if (cs && domain) console.log(`  🔗 Codespaces: https://${cs}-${PORT}.${domain}`);
  console.log('');
});

function shutdown() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch (e) {
    console.error('[vibe] final save failed:', e.message);
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { server };
