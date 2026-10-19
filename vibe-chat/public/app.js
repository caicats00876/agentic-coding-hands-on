/* Vibe Chat クライアント */
(() => {
  'use strict';

  const { TextOperation, fromDiff } = window.OT;

  // ───────────────────────── 定数 ─────────────────────────

  const FLOWS = {
    focus: { icon: '🎯', name: '集中モード', desc: '通知オフで深く集中', color: 'var(--flow-focus)', ph: '何に集中する？（任意）', text: (t) => (t ? `集中モード：${t}` : '集中モード（通知オフ）') },
    brainstorm: { icon: '💡', name: 'ブレスト中', desc: 'アイデア歓迎・飛び入りOK', color: 'var(--flow-brainstorm)', ph: 'テーマ（例: 新機能のネーミング）', text: (t) => (t ? `${t}についてブレスト中` : 'ブレスト中') },
    writing: { icon: '📝', name: '資料作成中', desc: '何を作っているかを共有', color: 'var(--flow-writing)', ph: '資料名（例: 四半期レポート）', text: (t) => (t ? `${t}を作成中` : '資料作成中') },
    review: { icon: '👀', name: 'レビュー中', desc: 'PR・資料のレビュー', color: 'var(--flow-review)', ph: '対象（例: PR #42）', text: (t) => (t ? `${t}をレビュー中` : 'レビュー中') },
    meeting: { icon: '🗣', name: '会議中', desc: 'すぐには返信できません', color: 'var(--flow-meeting)', ph: '会議名（例: 定例）', text: (t) => (t ? `${t}で会議中` : '会議中') },
    break: { icon: '☕', name: '休憩中', desc: 'ひと息ついています', color: 'var(--flow-break)', ph: 'ひとこと（任意）', text: (t) => (t ? `休憩中：${t}` : '休憩中') },
    custom: { icon: '✨', name: 'カスタム', desc: '自由に活動を共有', color: 'var(--flow-custom)', ph: 'いま何してる？', text: (t) => t || 'カスタムフロー' },
  };
  const DURATIONS = [
    ['25分', 25],
    ['50分', 50],
    ['90分', 90],
    ['2時間', 120],
    ['未定', 0],
  ];
  const STATUS_EMOJIS = ['💬', '🗓', '🚃', '🏠', '🏢', '🤒', '🌴', '🍙', '🎧', '🔥', '🚀', '🤔', '😴', '🎉', '📚', '🛠'];
  const STATUS_SUGGEST = [
    ['🗓', '会議中', 60],
    ['🚃', '移動中', 30],
    ['🏠', 'リモートワーク中', 'today'],
    ['🤒', '体調不良', 'today'],
    ['🌴', '休暇中', null],
  ];
  const REACTIONS = ['👍', '❤️', '😂', '🎉', '🙏', '👀', '🔥', '✅'];
  const TEXT_EXT = new Set('txt md markdown js mjs cjs ts tsx jsx json py rb go rs java kt c h cpp cs php sh bash zsh yml yaml toml ini env csv tsv log html css scss sql xml svg vue svelte dockerfile gitignore'.split(' '));

  // ───────────────────────── 状態 ─────────────────────────

  const S = {
    name: load('vibe.name'),
    me: null,
    users: new Map(),
    channels: new Map(),
    messages: new Map(),
    docs: new Map(),
    current: load('vibe.conv'),
    unread: new Map(), // convId -> { n, mention }
    typing: new Map(), // key -> Map(userId -> timeoutId)
    uploads: new Map(), // tempId -> { convId, parentId, userId, name, size, pct, state }
    drafts: new Map(),
    panel: null, // { type: 'thread', msgId } | { type: 'doc', docId }
    editor: null,
    manualAway: false,
    away: false,
    lastActivity: Date.now(),
    missed: [], // 集中モード中に届いた通知対象メッセージ
    prevFocus: false,
    stickMain: true,
    stickThread: true,
  };

  function load(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  }
  function save(k, v) {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  }

  // ───────────────────────── ユーティリティ ─────────────────────────

  const $ = (sel, root = document) => root.querySelector(sel);

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value' || typeof v === 'boolean') el[k] = v;
        else el.setAttribute(k, v);
      }
    }
    const add = (c) => {
      if (c == null || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else el.append(c instanceof Node ? c : String(c));
    };
    kids.forEach(add);
    return el;
  }

  /** replaceChildren は null を文字列 "null" として描画するため、空要素を除いてから差し替える */
  function fill(el, ...kids) {
    el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pad = (n) => String(n).padStart(2, '0');
  const fmtTime = (ts) => {
    const d = new Date(ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
  function fmtDay(ts) {
    const d = new Date(ts);
    const today = new Date();
    if (sameDay(ts, today)) return '今日';
    if (sameDay(ts, today.getTime() - 864e5)) return '昨日';
    return `${d.getMonth() + 1}月${d.getDate()}日（${'日月火水木金土'[d.getDay()]}）`;
  }
  function fmtSize(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }
  function fmtRemain(until) {
    const m = Math.max(0, Math.round((until - Date.now()) / 60000));
    return m >= 60 ? `残り${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ''}` : `残り${m}分`;
  }
  function fmtAgo(ts) {
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'たった今';
    if (m < 60) return `${m}分前`;
    if (m < 60 * 24) return `${Math.floor(m / 60)}時間前`;
    return `${Math.floor(m / 60 / 24)}日前`;
  }
  const uid = () => Math.random().toString(36).slice(2, 10);
  const me = () => S.users.get(S.me);
  const userName = (id) => (S.users.get(id) || { name: '不明' }).name;
  const dmId = (a, b) => 'd:' + [a, b].sort().join(':');
  const dmPartner = (convId) => convId.split(':').slice(1).find((x) => x !== S.me) || S.me;
  const isDm = (convId) => !!convId && convId.startsWith('d:');

  function convName(convId) {
    if (!convId) return '';
    if (isDm(convId)) return userName(dmPartner(convId));
    const ch = S.channels.get(convId.slice(2));
    return ch ? '#' + ch.name : '#?';
  }

  function presenceOf(u) {
    if (!u) return 'offline';
    if (u.presence !== 'offline' && u.flow && u.flow.mode === 'focus') return 'focus';
    return u.presence;
  }
  const PRESENCE_LABEL = { online: 'オンライン', away: '離席中', focus: '集中モード（通知オフ）', offline: 'オフライン' };

  function flowText(flow) {
    const f = FLOWS[flow.mode] || FLOWS.custom;
    return `${f.icon} ${f.text(flow.topic)}`;
  }

  // ───────────────────────── Markdown ─────────────────────────

  marked.use({ gfm: true, breaks: true });
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  const mdCache = new Map();
  function mdHtml(text) {
    let html = mdCache.get(text);
    if (html == null) {
      html = DOMPurify.sanitize(marked.parse(text));
      if (mdCache.size > 2000) mdCache.clear();
      mdCache.set(text, html);
    }
    return html;
  }
  function renderMd(text, cls = 'md') {
    const el = h('div', { class: cls, html: mdHtml(text) });
    highlightMentions(el);
    return el;
  }
  function highlightMentions(root) {
    if (!root.textContent.includes('@')) return;
    const names = new Map([...S.users.values()].map((u) => [u.name.toLowerCase(), u]));
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest('code,pre,a') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    while (walker.nextNode()) if (walker.currentNode.nodeValue.includes('@')) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const parts = node.nodeValue.split(/(@[^\s@、。,.!?！？]+)/);
      if (parts.length === 1) continue;
      const frag = document.createDocumentFragment();
      for (const p of parts) {
        const key = p.slice(1).toLowerCase();
        if (p.startsWith('@') && (names.has(key) || key === 'here')) {
          const isMe = key === 'here' || names.get(key)?.id === S.me;
          frag.append(h('span', { class: 'mention-tag' + (isMe ? ' me' : '') }, p));
        } else frag.append(p);
      }
      node.replaceWith(frag);
    }
  }
  function mentionsMe(text) {
    const u = me();
    if (!u || !text) return false;
    const t = text.toLowerCase();
    return t.includes('@' + u.name.toLowerCase()) || t.includes('@here');
  }

  // ───────────────────────── WebSocket ─────────────────────────

  let ws = null;
  let retry = 0;
  let initialized = false;

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    setConn('connecting');
    ws.onopen = () => {
      retry = 0;
      setConn('ok');
      send({ type: 'hello', name: S.name });
    };
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      try {
        handle(msg);
      } catch (err) {
        console.error('handle error', msg.type, err);
      }
    };
    ws.onclose = () => {
      setConn('bad');
      const delay = Math.min(1000 * 2 ** retry++, 10000);
      setTimeout(connect, delay);
    };
  }

  function send(msg) {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  function setConn(st) {
    const el = $('#conn');
    el.className = 'conn ' + (st === 'ok' ? 'ok' : st === 'bad' ? 'bad' : '');
    el.title = st === 'ok' ? '接続中' : '再接続中…';
  }

  // ───────────────────────── 受信処理 ─────────────────────────

  function handle(msg) {
    switch (msg.type) {
      case 'init': {
        S.me = msg.me;
        S.users = new Map(msg.users.map((u) => [u.id, u]));
        S.channels = new Map(msg.channels.map((c) => [c.id, c]));
        S.messages = new Map(msg.messages.map((m) => [m.id, m]));
        S.docs = new Map(msg.docs.map((d) => [d.id, d]));
        S.prevFocus = me().flow?.mode === 'focus';
        if (!S.current || !convExists(S.current)) {
          const general = [...S.channels.values()].find((c) => c.name === 'general') || [...S.channels.values()][0];
          S.current = 'c:' + general.id;
        }
        if (!initialized) {
          initialized = true;
          $('#login').classList.add('hidden');
          $('#app').classList.remove('hidden');
          setupMainComposer();
        }
        if (S.panel?.type === 'doc') send({ type: 'doc:join', docId: S.panel.docId });
        if (S.away || S.manualAway) send({ type: 'presence', away: true });
        switchConv(S.current, true);
        break;
      }
      case 'error':
        toast({ title: 'エラー', body: msg.message, error: true });
        if (!initialized) showLogin();
        break;
      case 'user:update': {
        const prev = S.users.get(msg.user.id);
        S.users.set(msg.user.id, msg.user);
        if (msg.user.id === S.me) onMyUpdate(prev, msg.user);
        invalidate('sidebar', 'header', 'messages', 'thread', 'composer');
        break;
      }
      case 'channel:new':
        S.channels.set(msg.channel.id, msg.channel);
        invalidate('sidebar');
        break;
      case 'channel:created':
        switchConv('c:' + msg.channelId);
        break;
      case 'message:new':
        onNewMessage(msg.message);
        break;
      case 'message:update':
        S.messages.set(msg.message.id, msg.message);
        invalidate('messages', 'thread');
        break;
      case 'typing':
        onTyping(msg);
        break;
      case 'upload:progress':
        onUploadProgress(msg);
        break;
      case 'doc:meta':
        S.docs.set(msg.doc.id, msg.doc);
        invalidate('sidebar', 'messages', 'thread');
        if (S.editor && S.editor.docId === msg.doc.id) S.editor.setMeta(msg.doc);
        break;
      case 'doc:created':
        openDoc(msg.docId);
        break;
      case 'doc:state':
      case 'doc:ack':
      case 'doc:op':
      case 'doc:resync':
      case 'doc:cursor':
      case 'doc:cursor-leave':
        if (S.editor && S.editor.docId === msg.docId) S.editor.onMessage(msg);
        break;
    }
  }

  function convExists(convId) {
    if (convId.startsWith('c:')) return S.channels.has(convId.slice(2));
    if (isDm(convId)) return convId.split(':').slice(1).every((id) => S.users.has(id)) && convId.includes(S.me);
    return false;
  }

  function onMyUpdate(prev, u) {
    const wasFocus = S.prevFocus;
    const isFocus = u.flow?.mode === 'focus';
    S.prevFocus = isFocus;
    if (wasFocus && !isFocus) {
      const missed = S.missed.splice(0);
      if (missed.length) {
        const last = missed[missed.length - 1];
        toast({
          title: 'おかえりなさい！🎯',
          body: `集中モード中に ${missed.length} 件のメッセージが届いていました（最新: ${userName(last.userId)} さん${isDm(last.convId) ? 'からの DM' : ` · ${convName(last.convId)}`}）`,
          user: S.users.get(last.userId),
          timeout: 12000,
          onClick: () => jumpTo(last),
        });
      } else {
        toast({ title: '集中モード終了 🎯', body: 'おつかれさまでした！新着の通知はありません。' });
      }
    }
    if (!prev?.flow && u.flow) {
      const f = FLOWS[u.flow.mode] || FLOWS.custom;
      toast({ title: `${f.icon} フローを開始しました`, body: f.text(u.flow.topic) + (u.flow.mode === 'focus' ? ' — 通知をオフにしました' : '') });
    }
  }

  function onNewMessage(m) {
    S.messages.set(m.id, m);
    clearTyping(m.convId, m.parentId, m.userId);
    const mine = m.userId === S.me;
    const visibleMain = !m.parentId && S.current === m.convId && !document.hidden;
    const visibleThread = m.parentId && S.panel?.type === 'thread' && S.panel.msgId === m.parentId && !document.hidden;

    if (mine) {
      if (!m.parentId && S.current === m.convId) S.stickMain = true;
      if (m.parentId) S.stickThread = true;
    } else {
      if (!m.parentId && !visibleMain) {
        const u = S.unread.get(m.convId) || { n: 0, mention: false };
        u.n++;
        u.mention = u.mention || mentionsMe(m.text) || isDm(m.convId);
        S.unread.set(m.convId, u);
      }
      const parent = m.parentId && S.messages.get(m.parentId);
      const threadForMe =
        parent && (parent.userId === S.me || [...S.messages.values()].some((x) => x.parentId === parent.id && x.userId === S.me));
      const important = isDm(m.convId) || mentionsMe(m.text) || threadForMe;
      if (important && !(visibleMain || visibleThread)) notify(m);
    }
    invalidate('sidebar', 'messages', 'thread', 'title');
  }

  function notify(m) {
    const u = S.users.get(m.userId);
    if (me()?.flow?.mode === 'focus') {
      S.missed.push(m);
      return; // 集中モード中は通知しない
    }
    // DM の会話名は相手(=送信者)の名前なので、送信者名と重複しないよう「DM」と表示する
    const base = isDm(m.convId) ? 'DM' : convName(m.convId);
    const where = m.parentId ? `${base} のスレッド` : base;
    const body = m.text ? m.text.slice(0, 120) : m.files?.length ? `📎 ${m.files.map((f) => f.name).join(', ')}` : m.docId ? '📝 ドキュメントを作成しました' : '';
    toast({ title: `${u?.name || '?'} · ${where}`, body, user: u, onClick: () => jumpTo(m) });
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(`${u?.name} (${where})`, { body, icon: '/favicon.svg', tag: m.convId });
      n.onclick = () => {
        window.focus();
        jumpTo(m);
        n.close();
      };
    }
  }

  function jumpTo(m) {
    switchConv(m.convId);
    if (m.parentId) openThread(m.parentId);
    else {
      requestAnimationFrame(() => {
        const el = document.querySelector(`#messages [data-id="${m.id}"]`);
        if (el) {
          el.scrollIntoView({ block: 'center' });
          el.classList.add('flash');
        }
      });
    }
  }

  // タイピング表示
  const typingKey = (convId, parentId) => `${convId}|${parentId || ''}`;
  function onTyping({ convId, parentId, userId }) {
    const key = typingKey(convId, parentId);
    if (!S.typing.has(key)) S.typing.set(key, new Map());
    const map = S.typing.get(key);
    clearTimeout(map.get(userId));
    map.set(
      userId,
      setTimeout(() => {
        map.delete(userId);
        invalidate('composer');
      }, 3500)
    );
    invalidate('composer');
  }
  function clearTyping(convId, parentId, userId) {
    const map = S.typing.get(typingKey(convId, parentId));
    if (map && map.has(userId)) {
      clearTimeout(map.get(userId));
      map.delete(userId);
      invalidate('composer');
    }
  }

  // ───────────────────────── 描画スケジューラ ─────────────────────────

  const dirty = new Set();
  let raf = 0;
  function invalidate(...parts) {
    parts.forEach((p) => dirty.add(p));
    if (!raf) raf = requestAnimationFrame(flush);
  }
  function flush() {
    raf = 0;
    if (!S.me) return;
    const d = new Set(dirty);
    dirty.clear();
    if (d.has('sidebar')) renderSidebar();
    if (d.has('header')) renderHeader();
    if (d.has('messages')) renderMain();
    if (d.has('thread') && S.panel?.type === 'thread') renderThread();
    if (d.has('uploads')) renderUploads();
    if (d.has('composer')) composers.forEach((c) => c.refresh());
    if (d.has('title')) {
      const total = [...S.unread.values()].reduce((a, u) => a + u.n, 0);
      document.title = total ? `(${total}) Vibe Chat` : 'Vibe Chat';
    }
  }

  // ───────────────────────── 共通パーツ ─────────────────────────

  function avatar(u, size = '', withDot = true) {
    u = u || { name: '?', color: '#555' };
    return h(
      'div',
      { class: `avatar ${size}`, style: `background:${u.color}`, title: u.name },
      [...u.name][0].toUpperCase(),
      withDot && u.presence ? h('span', { class: `dot ${presenceOf(u)}` }) : null
    );
  }

  function flowChip(flow, short = false) {
    const f = FLOWS[flow.mode] || FLOWS.custom;
    return h(
      'span',
      { class: 'flow-chip', style: `--c:${f.color}`, title: f.text(flow.topic) },
      h('span', { class: 'pulse' }),
      short ? `${f.icon} ${f.name}` : `${f.icon} ${f.text(flow.topic)}`
    );
  }

  function statusEmoji(u) {
    return u?.status?.emoji ? h('span', { title: u.status.text || '' }, u.status.emoji) : null;
  }

  function toast({ title, body, user, error, onClick, timeout = 6000 }) {
    const el = h(
      'div',
      { class: 'toast' + (error ? ' error' : '') },
      user ? avatar(user, '', false) : null,
      h('div', { style: 'min-width:0' }, h('div', { class: 't-title' }, title), body ? h('div', { class: 't-body' }, body) : null)
    );
    el.onclick = () => {
      onClick && onClick();
      el.remove();
    };
    $('#toasts').append(el);
    setTimeout(() => el.remove(), timeout);
  }

  function modal(content, cls = '') {
    const box = h('div', { class: 'modal ' + cls }, content);
    const bg = h('div', { class: 'modal-backdrop' }, box);
    const close = () => {
      bg.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => e.key === 'Escape' && close();
    bg.addEventListener('mousedown', (e) => e.target === bg && close());
    document.addEventListener('keydown', onKey);
    $('#modal-root').append(bg);
    return { close, box };
  }

  function promptModal({ title, desc, placeholder, value = '', ok = 'OK', extra }) {
    return new Promise((resolve) => {
      const input = h('input', { class: 'input', placeholder, value, maxlength: 80 });
      const extraInput = extra ? h('input', { class: 'input', placeholder: extra.placeholder, maxlength: 120 }) : null;
      const done = (v) => {
        m.close();
        resolve(v);
      };
      const submit = (e) => {
        e.preventDefault();
        done(extra ? { value: input.value, extra: extraInput.value } : input.value);
      };
      const m = modal(
        h(
          'form',
          { onsubmit: submit },
          h('h2', null, title),
          desc ? h('p', { class: 'desc' }, desc) : null,
          input,
          extraInput ? h('div', { style: 'margin-top:8px' }, extraInput) : null,
          h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => done(null) }, 'キャンセル'), h('button', { class: 'btn primary', type: 'submit' }, ok))
        )
      );
      setTimeout(() => input.focus(), 30);
    });
  }

  // ───────────────────────── サイドバー ─────────────────────────

  function renderSidebar() {
    const u = me();
    // 自分カード
    const card = $('#me-card');
    card.replaceChildren(
      avatar(u, 'lg'),
      h(
        'div',
        { class: 'me-info' },
        h('div', { class: 'me-name' }, u.name, ' ', statusEmoji(u)),
        h('div', { class: 'me-sub' }, u.flow ? flowText(u.flow) : u.status?.text ? u.status.text : `${PRESENCE_LABEL[presenceOf(u)]} · ステータスを設定`)
      )
    );

    renderFlowBoard();

    // チャンネル
    const chList = [...S.channels.values()].sort((a, b) => a.name.localeCompare(b.name));
    $('#channel-list').replaceChildren(
      ...chList.map((c) => convItem('c:' + c.id, h('span', { class: 'hash' }, '#'), c.name))
    );

    // DM
    const order = { online: 0, focus: 1, away: 2, offline: 3 };
    const others = [...S.users.values()]
      .filter((x) => x.id !== S.me)
      .sort((a, b) => order[presenceOf(a)] - order[presenceOf(b)] || a.name.localeCompare(b.name));
    $('#dm-list').replaceChildren(
      ...(others.length
        ? others.map((x) =>
            convItem(dmId(S.me, x.id), avatar(x, 'sm'), [x.name, ' ', statusEmoji(x), x.flow ? h('span', { class: 'sub' }, ' ' + (FLOWS[x.flow.mode] || FLOWS.custom).icon) : null])
          )
        : [h('div', { class: 'flow-empty' }, '別のブラウザやシークレットウィンドウで別名ログインすると、ここに表示されます')])
    );

    // ドキュメント
    const docs = [...S.docs.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12);
    $('#doc-list').replaceChildren(
      ...(docs.length
        ? docs.map((d) =>
            h(
              'button',
              { class: 'conv-item' + (S.panel?.type === 'doc' && S.panel.docId === d.id ? ' active' : ''), onclick: () => openDoc(d.id) },
              h('span', { class: 'hash' }, '📝'),
              h('span', { class: 'label' }, d.title),
              d.editors.length ? h('span', { class: 'live-tag', title: '編集中' }, d.editors.length) : null
            )
          )
        : [h('div', { class: 'flow-empty' }, 'チャットで /doc と入力すると作成できます')])
    );
  }

  function convItem(convId, icon, label) {
    const un = S.unread.get(convId);
    return h(
      'button',
      {
        class: 'conv-item' + (S.current === convId ? ' active' : '') + (un?.n ? ' unread' : ''),
        onclick: () => {
          switchConv(convId);
          $('#app').classList.remove('show-sidebar');
        },
      },
      icon,
      h('span', { class: 'label' }, label),
      un?.n && (un.mention || isDm(convId)) ? h('span', { class: 'badge' }, un.n) : null
    );
  }

  function renderFlowBoard() {
    const active = [...S.users.values()]
      .filter((u) => u.flow && u.presence !== 'offline')
      .sort((a, b) => (a.id === S.me ? -1 : b.id === S.me ? 1 : b.flow.startedAt - a.flow.startedAt));
    const board = $('#flow-board');
    if (!active.length) {
      board.replaceChildren(h('div', { class: 'flow-empty' }, 'いまフロー中のメンバーはいません。自分のカードから共有してみよう'));
      return;
    }
    board.replaceChildren(...active.map(flowCard));
  }

  function flowCard(u) {
    const fl = u.flow;
    const f = FLOWS[fl.mode] || FLOWS.custom;
    const mine = u.id === S.me;
    const total = fl.until ? fl.until - fl.startedAt : 0;
    const pct = total ? Math.min(100, ((Date.now() - fl.startedAt) / total) * 100) : 0;
    const actions = [];
    if (mine) {
      actions.push(h('button', { class: 'btn small', onclick: () => send({ type: 'flow:clear' }) }, '終了'));
      if (fl.until) actions.push(h('button', { class: 'btn small ghost', onclick: () => extendFlow(15) }, '+15分'));
    } else if (fl.mode === 'brainstorm') {
      actions.push(h('button', { class: 'btn small', onclick: () => openDmWith(u.id, `「${fl.topic || 'ブレスト'}」に参加させてください！🙌 `) }, '🙌 参加する'));
    } else if (fl.mode === 'writing' || fl.mode === 'review') {
      actions.push(h('button', { class: 'btn small ghost', onclick: () => openDmWith(u.id, `「${fl.topic || '作業'}」について、手伝えることがあれば声かけてください！ `) }, '💬 声をかける'));
    }
    return h(
      'div',
      { class: 'flow-card', style: `--c:${f.color}` },
      avatar(u, 'sm'),
      h(
        'div',
        { class: 'flow-text' },
        h('div', { class: 'flow-who' }, mine ? `${u.name}（あなた）` : u.name),
        h('div', { class: 'flow-what' }, `${f.icon} ${f.text(fl.topic)}`),
        h(
          'div',
          { class: 'flow-time' },
          fl.mode === 'focus' ? '🔕 通知オフ ·' : null,
          fl.until ? `${fmtRemain(fl.until)}（〜${fmtTime(fl.until)}）` : `${fmtAgo(fl.startedAt)}から`
        ),
        fl.until ? h('div', { class: 'flow-progress' }, h('i', { style: `width:${pct}%` })) : null,
        actions.length ? h('div', { class: 'flow-actions' }, actions) : null
      )
    );
  }

  function extendFlow(min) {
    const fl = me().flow;
    if (!fl) return;
    send({ type: 'flow:set', mode: fl.mode, topic: fl.topic, until: Math.max(fl.until || Date.now(), Date.now()) + min * 60000 });
  }

  function openDmWith(userId, prefill) {
    switchConv(dmId(S.me, userId));
    if (prefill) {
      const ta = mainComposer.textarea;
      ta.value = prefill;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
      mainComposer.autosize();
    }
  }

  // ───────────────────────── 会話の切り替え ─────────────────────────

  function switchConv(convId, force) {
    if (!convExists(convId)) return;
    if (mainComposer && S.current !== convId) {
      S.drafts.set(S.current, mainComposer.textarea.value);
      mainComposer.textarea.value = S.drafts.get(convId) || '';
      mainComposer.autosize();
    }
    const changed = S.current !== convId || force;
    S.current = convId;
    save('vibe.conv', convId);
    S.unread.delete(convId);
    if (changed) S.stickMain = true;
    invalidate('sidebar', 'header', 'messages', 'uploads', 'composer', 'title');
    if (mainComposer && window.matchMedia('(min-width: 601px)').matches) setTimeout(() => mainComposer.textarea.focus(), 0);
  }

  function renderHeader() {
    const cid = S.current;
    const name = $('#conv-name');
    const topic = $('#conv-topic');
    const actions = $('#conv-actions');
    const banner = $('#conv-banner');
    const menuBtn = h('button', { class: 'icon-btn mobile-only', onclick: () => $('#app').classList.toggle('show-sidebar') }, '☰');
    const docBtn = h('button', { class: 'btn small', onclick: () => createDocPrompt(cid), title: 'この会話で共同編集ドキュメントを作成' }, '📝 ドキュメント');

    if (isDm(cid)) {
      const u = S.users.get(dmPartner(cid));
      fill(name, menuBtn, avatar(u, 'sm'), u.name, ' ', statusEmoji(u));
      const bits = [PRESENCE_LABEL[presenceOf(u)]];
      if (u.status?.text) bits.push(`${u.status.emoji || ''} ${u.status.text}`);
      if (u.presence === 'offline' && u.lastSeen) bits.push(`最終オンライン ${fmtAgo(u.lastSeen)}`);
      topic.textContent = bits.join(' · ');
      actions.replaceChildren(docBtn);
      if (u.flow && u.id !== S.me) {
        const f = FLOWS[u.flow.mode] || FLOWS.custom;
        banner.setAttribute('style', `--c:${f.color}`);
        banner.replaceChildren(
          h('span', { class: 'pulse' }),
          h(
            'div',
            { style: 'flex:1' },
            h('b', null, `${u.name} さんは「${f.icon} ${f.text(u.flow.topic)}」`),
            u.flow.until ? ` · ${fmtRemain(u.flow.until)}（〜${fmtTime(u.flow.until)}）` : '',
            u.flow.mode === 'focus' ? h('div', { class: 'conv-topic' }, '通知はオフになっています。急ぎでなければ、集中が終わったあとに読んでもらえます。') : null
          )
        );
        banner.classList.remove('hidden');
      } else banner.classList.add('hidden');
    } else {
      const ch = S.channels.get(cid.slice(2));
      name.replaceChildren(menuBtn, h('span', { style: 'color:var(--dim)' }, '#'), ch.name);
      topic.textContent = ch.topic || 'トピックは未設定です';
      const online = [...S.users.values()].filter((u) => u.presence !== 'offline');
      const flowing = online.filter((u) => u.flow);
      fill(
        actions,
        flowing.length ? h('span', { class: 'conv-topic', title: flowing.map((u) => `${u.name}: ${flowText(u.flow)}`).join('\n') }, `🌊 ${flowing.length}人がフロー中`) : null,
        h('div', { class: 'avatar-stack', title: online.map((u) => u.name).join(', ') }, online.slice(0, 5).map((u) => avatar(u, 'sm'))),
        h('span', { class: 'conv-topic' }, `${online.length}人オンライン`),
        docBtn
      );
      banner.classList.add('hidden');
    }
  }

  // ───────────────────────── メッセージ描画 ─────────────────────────

  function mainMessages() {
    return [...S.messages.values()].filter((m) => m.convId === S.current && !m.parentId).sort((a, b) => a.ts - b.ts);
  }

  function renderMain() {
    const el = $('#messages');
    const list = mainMessages();
    const prevTop = el.scrollTop;
    const nodes = [];
    if (!list.length) {
      nodes.push(
        h(
          'div',
          { class: 'empty-conv' },
          h('div', { class: 'big' }, isDm(S.current) ? '👋' : '✨'),
          h('h3', null, `${convName(S.current)} へようこそ`),
          h('div', null, 'メッセージを送るか、ファイルをドラッグ＆ドロップして共有しましょう。'),
          h('div', null, h('code', null, '/doc タイトル'), ' で共同編集ドキュメント、', h('code', null, '/focus 25'), ' で集中モードを開始できます。')
        )
      );
    }
    let prev = null;
    for (const m of list) {
      if (!prev || !sameDay(prev.ts, m.ts)) nodes.push(h('div', { class: 'day-divider' }, fmtDay(m.ts)));
      nodes.push(messageEl(m, prev, { inThread: false }));
      prev = m;
    }
    el.replaceChildren(...nodes);
    if (S.stickMain) el.scrollTop = el.scrollHeight;
    else el.scrollTop = prevTop;
  }

  function isGrouped(m, prev) {
    return prev && prev.userId === m.userId && m.ts - prev.ts < 5 * 60000 && sameDay(prev.ts, m.ts) && !prev.docId && !m.docId && !prev.deleted;
  }

  function messageEl(m, prev, opts) {
    const u = S.users.get(m.userId);
    const grouped = isGrouped(m, prev);
    const mine = m.userId === S.me;
    const body = h('div', { class: 'msg-body' });
    if (!grouped) {
      body.append(
        h(
          'div',
          { class: 'msg-head' },
          h('span', { class: 'msg-author', style: `color:${u?.color}` }, u?.name || '不明'),
          statusEmoji(u),
          u?.flow ? flowChip(u.flow, true) : null,
          h('span', { class: 'msg-time', title: new Date(m.ts).toLocaleString() }, fmtTime(m.ts))
        )
      );
    }
    if (m.deleted) body.append(h('div', { class: 'msg-text deleted' }, 'このメッセージは削除されました'));
    else if (m.text) body.append(renderMd(m.text, 'msg-text md'));
    if (m.files?.length) body.append(filesEl(m));
    if (m.docId) body.append(docCard(m));
    const reactions = Object.entries(m.reactions || {});
    if (reactions.length) {
      body.append(
        h(
          'div',
          { class: 'reactions' },
          reactions.map(([emoji, users]) =>
            h(
              'button',
              { class: 'reaction' + (users.includes(S.me) ? ' mine' : ''), title: users.map(userName).join(', '), onclick: () => send({ type: 'reaction:toggle', id: m.id, emoji }) },
              emoji,
              h('span', null, users.length)
            )
          )
        )
      );
    }
    if (!opts.inThread && !m.parentId && m.replyCount) {
      body.append(
        h(
          'button',
          { class: 'thread-link', onclick: () => openThread(m.id) },
          h('span', { class: 'avatar-stack' }, (m.replyUsers || []).map((id) => avatar(S.users.get(id), 'sm', false))),
          `${m.replyCount}件の返信`,
          h('span', { class: 'sub' }, `最終返信 ${fmtAgo(m.lastReplyTs)}`)
        )
      );
    }

    const el = h(
      'div',
      { class: 'msg' + (grouped ? ' grouped' : '') + (!mine && mentionsMe(m.text) ? ' mention' : ''), 'data-id': m.id },
      h('div', { class: 'msg-gutter' }, grouped ? h('div', { class: 'hover-time' }, fmtTime(m.ts)) : avatar(u, 'lg')),
      body
    );
    if (!m.deleted) el.append(msgTools(m, el, opts));
    return el;
  }

  function msgTools(m, el, opts) {
    const tools = h('div', { class: 'msg-tools' });
    const picker = () => {
      const old = el.querySelector('.reaction-picker');
      if (old) {
        old.remove();
        tools.classList.remove('open');
        return;
      }
      tools.classList.add('open');
      const p = h(
        'div',
        { class: 'reaction-picker' },
        REACTIONS.map((e) =>
          h('button', {
            onclick: () => {
              send({ type: 'reaction:toggle', id: m.id, emoji: e });
              p.remove();
              tools.classList.remove('open');
            },
          }, e)
        )
      );
      el.append(p);
      el.addEventListener('mouseleave', () => {
        p.remove();
        tools.classList.remove('open');
      }, { once: true });
    };
    tools.append(h('button', { class: 'icon-btn', title: 'リアクション', onclick: picker }, '😊'));
    if (!opts.inThread && !m.parentId) tools.append(h('button', { class: 'icon-btn', title: 'スレッドで返信', onclick: () => openThread(m.id) }, '💬'));
    if (m.userId === S.me)
      tools.append(
        h('button', {
          class: 'icon-btn',
          title: '削除',
          onclick: () => confirm('このメッセージを削除しますか？') && send({ type: 'message:delete', id: m.id }),
        }, '🗑')
      );
    return tools;
  }

  // ───────────────────────── ファイル表示 ─────────────────────────

  function fileKind(f) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (/^image\/(png|jpe?g|gif|webp|avif|bmp)$/.test(f.mime)) return 'image';
    if (f.mime.startsWith('video/')) return 'video';
    if (f.mime.startsWith('audio/')) return 'audio';
    if (f.mime === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (ext === 'md' || ext === 'markdown' || f.mime === 'text/markdown') return 'markdown';
    if (f.mime.startsWith('text/') || f.mime === 'application/json' || TEXT_EXT.has(ext)) return 'text';
    return 'other';
  }
  const KIND_ICON = { image: '🖼', video: '🎬', audio: '🎵', pdf: '📕', markdown: '📝', text: '📄', other: '📦' };

  function onMediaLoad() {
    if (S.stickMain) $('#messages').scrollTop = $('#messages').scrollHeight;
    const t = $('#panel .messages');
    if (t && S.stickThread) t.scrollTop = t.scrollHeight;
  }

  function filesEl(m) {
    return h(
      'div',
      { class: 'files' },
      m.files.map((f) => {
        const url = `/files/${f.id}`;
        const kind = fileKind(f);
        if (kind === 'image')
          return h('div', { class: 'file-img', title: f.name, onclick: () => openPreview(f, m) }, h('img', { src: url, alt: f.name, loading: 'lazy', onload: onMediaLoad }));
        if (kind === 'video') return h('video', { class: 'file-media', src: url, controls: true, preload: 'metadata', onloadedmetadata: onMediaLoad });
        if (kind === 'audio') return h('div', null, fileCard(f, m), h('audio', { src: url, controls: true, preload: 'none', style: 'width:min(360px,100%);margin-top:4px' }));
        if (kind === 'text' || kind === 'markdown') {
          const snippet = h('div', { class: 'file-snippet' }, '…');
          loadSnippet(f).then((t) => (snippet.textContent = t));
          return h('button', { class: 'file-card file-text-card', onclick: () => openPreview(f, m) }, h('div', { class: 'row' }, fileIcon(f), fileMeta(f)), snippet);
        }
        return fileCard(f, m);
      })
    );
  }
  const fileIcon = (f) => h('div', { class: 'file-icon' }, KIND_ICON[fileKind(f)]);
  const fileMeta = (f) => h('div', { class: 'file-meta' }, h('div', { class: 'file-name' }, f.name), h('div', { class: 'file-sub' }, `${fmtSize(f.size)} · クリックでプレビュー`));
  function fileCard(f, m) {
    return h('button', { class: 'file-card', onclick: () => openPreview(f, m) }, fileIcon(f), fileMeta(f));
  }

  const snippetCache = new Map();
  function loadSnippet(f) {
    if (!snippetCache.has(f.id)) {
      snippetCache.set(
        f.id,
        fetch(`/files/${f.id}`, { headers: { Range: 'bytes=0-1500' } })
          .then((r) => r.text())
          .then((t) => t.split('\n').slice(0, 6).join('\n'))
          .catch(() => '(プレビューを読み込めませんでした)')
      );
    }
    return snippetCache.get(f.id);
  }

  async function openPreview(f, m) {
    const url = `/files/${f.id}`;
    const kind = fileKind(f);
    const bodyEl = h('div', { class: 'pv-body' }, h('div', { style: 'padding:40px;color:var(--muted)' }, '読み込み中…'));
    const u = S.users.get(m.userId);
    modal(
      [
        h(
          'div',
          { class: 'pv-head' },
          fileIcon(f),
          h('div', { class: 'file-meta' }, h('div', { class: 'file-name' }, f.name), h('div', { class: 'file-sub' }, `${fmtSize(f.size)} · ${u?.name || '?'} が ${fmtDay(m.ts)} ${fmtTime(m.ts)} に共有`)),
          h('a', { class: 'btn small', href: `${url}?download=1`, download: f.name }, '⬇ ダウンロード')
        ),
        bodyEl,
      ],
      'wide preview-modal'
    );
    if (kind === 'image') bodyEl.replaceChildren(h('img', { src: url, alt: f.name }));
    else if (kind === 'video') bodyEl.replaceChildren(h('video', { src: url, controls: true, autoplay: true }));
    else if (kind === 'audio') bodyEl.replaceChildren(h('audio', { src: url, controls: true, autoplay: true, style: 'margin:40px' }));
    else if (kind === 'pdf') bodyEl.replaceChildren(h('iframe', { src: url, title: f.name }));
    else if (kind === 'text' || kind === 'markdown') {
      const limit = 512 * 1024;
      const res = await fetch(url, f.size > limit ? { headers: { Range: `bytes=0-${limit}` } } : {});
      const text = await res.text();
      const note = f.size > limit ? '\n\n…（先頭 512KB のみ表示しています）' : '';
      bodyEl.replaceChildren(kind === 'markdown' ? renderMd(text + note) : h('pre', null, text + note));
    } else {
      bodyEl.replaceChildren(h('div', { style: 'padding:40px;text-align:center;color:var(--muted)' }, h('div', { style: 'font-size:48px' }, '📦'), 'この形式はプレビューできません。ダウンロードして開いてください。'));
    }
  }

  // ───────────────────────── ライブ・ファイル共有 ─────────────────────────

  function uploadFiles(fileList, convId, parentId) {
    const files = [...fileList].filter((f) => f.size >= 0);
    if (!files.length || !convId) return;
    const tooBig = files.filter((f) => f.size > 50 * 1024 * 1024);
    if (tooBig.length) toast({ title: 'アップロードできません', body: `${tooBig.map((f) => f.name).join(', ')}: 50MB を超えています`, error: true });
    const ok = files.filter((f) => f.size <= 50 * 1024 * 1024);
    if (!ok.length) return;
    Promise.all(ok.map((file) => uploadOne(file, convId, parentId))).then((results) => {
      const uploaded = results.filter(Boolean);
      if (uploaded.length) send({ type: 'message:send', convId, parentId, files: uploaded, text: '' });
    });
  }

  function uploadOne(file, convId, parentId) {
    return new Promise((resolve) => {
      const tempId = uid();
      const info = { tempId, convId, parentId: parentId || null, userId: S.me, name: file.name || 'clipboard.png', size: file.size, pct: 0, state: 'uploading' };
      S.uploads.set(tempId, info);
      invalidate('uploads');
      let lastSent = 0;
      const relay = (force) => {
        const t = Date.now();
        if (!force && t - lastSent < 150) return;
        lastSent = t;
        send({ type: 'upload:progress', ...info });
      };
      relay(true);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload');
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(info.name));
      xhr.setRequestHeader('X-User-Id', S.me);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        info.pct = Math.round((e.loaded / e.total) * 100);
        invalidate('uploads');
        relay();
      };
      const finish = (ok, res) => {
        info.state = ok ? 'done' : 'error';
        info.pct = ok ? 100 : info.pct;
        relay(true);
        S.uploads.delete(tempId);
        invalidate('uploads');
        resolve(ok ? res : null);
      };
      xhr.onload = () => {
        let res = null;
        try {
          res = JSON.parse(xhr.responseText);
        } catch {
          /* ignore */
        }
        if (xhr.status === 200 && res) finish(true, res);
        else {
          toast({ title: 'アップロード失敗', body: `${info.name}: ${res?.error || xhr.status}`, error: true });
          finish(false);
        }
      };
      xhr.onerror = () => {
        toast({ title: 'アップロード失敗', body: info.name, error: true });
        finish(false);
      };
      xhr.send(file);
    });
  }

  function onUploadProgress(msg) {
    if (msg.state === 'uploading') S.uploads.set(msg.tempId, { ...msg, at: Date.now() });
    else S.uploads.delete(msg.tempId);
    invalidate('uploads');
  }

  function renderUploads() {
    const render = (el, filter) => {
      if (!el) return;
      const list = [...S.uploads.values()].filter(filter);
      el.replaceChildren(
        ...list.map((u) => {
          const user = S.users.get(u.userId);
          return h(
            'div',
            { class: 'live-upload' },
            avatar(user, 'sm', false),
            h('span', null, u.userId === S.me ? 'あなたが共有中' : `${user?.name || '?'} が共有中`),
            h('span', { class: 'name' }, u.name),
            h('div', { class: 'bar' }, h('i', { style: `width:${u.pct}%` })),
            h('span', null, `${u.pct}% · ${fmtSize(u.size)}`)
          );
        })
      );
    };
    render($('#main-uploads'), (u) => u.convId === S.current && !u.parentId);
    if (S.panel?.type === 'thread') render($('#panel .live-uploads'), (u) => u.parentId === S.panel.msgId);
  }

  function setupDropZone(zone, overlay, target) {
    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    zone.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      overlay.classList.add('show');
    });
    zone.addEventListener('dragover', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    zone.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (!depth) overlay.classList.remove('show');
    });
    zone.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      depth = 0;
      overlay.classList.remove('show');
      const t = target();
      if (t) t(e.dataTransfer.files);
    });
  }

  // ───────────────────────── コンポーザー ─────────────────────────

  const composers = new Set();
  let mainComposer = null;

  function createComposer({ getConvId, parentId = null, placeholder }) {
    const textarea = h('textarea', { rows: 1, placeholder: placeholder(), maxlength: 8000 });
    const warning = h('div', { class: 'composer-warning hidden' });
    const typing = h('div', { class: 'typing' });
    const fileInput = h('input', { type: 'file', multiple: true, class: 'hidden' });
    const sendBtn = h('button', { class: 'send-btn', title: '送信 (Enter)', disabled: true }, '➤');
    let lastTyping = 0;

    const autosize = () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 220) + 'px';
      sendBtn.disabled = !textarea.value.trim();
    };
    const submit = () => {
      const text = textarea.value;
      if (!text.trim()) return;
      if (!runCommand(text, getConvId())) send({ type: 'message:send', convId: getConvId(), parentId, text });
      textarea.value = '';
      autosize();
      refreshWarning();
    };
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        submit();
      }
    });
    textarea.addEventListener('input', () => {
      autosize();
      refreshWarning();
      const t = Date.now();
      if (t - lastTyping > 2500 && textarea.value.trim() && !textarea.value.startsWith('/')) {
        lastTyping = t;
        send({ type: 'typing', convId: getConvId(), parentId });
      }
    });
    textarea.addEventListener('paste', (e) => {
      const files = e.clipboardData?.files;
      if (files && files.length) {
        e.preventDefault();
        uploadFiles(files, getConvId(), parentId);
      }
    });
    fileInput.addEventListener('change', () => {
      uploadFiles(fileInput.files, getConvId(), parentId);
      fileInput.value = '';
    });
    sendBtn.addEventListener('click', submit);

    function refreshWarning() {
      const convId = getConvId();
      const warn = [];
      const focusing = (u) => u && u.id !== S.me && u.flow?.mode === 'focus' && u.presence !== 'offline';
      if (isDm(convId)) {
        const u = S.users.get(dmPartner(convId));
        if (focusing(u)) warn.push(`🎯 ${u.name} さんは集中モード中です${u.flow.until ? `（〜${fmtTime(u.flow.until)}）` : ''}。通知は届きませんが、終了後に確認してもらえます。`);
      } else {
        const t = textarea.value.toLowerCase();
        for (const u of S.users.values()) {
          if (focusing(u) && t.includes('@' + u.name.toLowerCase())) warn.push(`🎯 @${u.name} さんは集中モード中なので、すぐには気づかないかもしれません。`);
        }
      }
      warning.classList.toggle('hidden', !warn.length);
      warning.textContent = warn.join(' ');
    }

    function refresh() {
      textarea.placeholder = placeholder();
      refreshWarning();
      const map = S.typing.get(typingKey(getConvId(), parentId));
      const names = map ? [...map.keys()].filter((id) => id !== S.me).map(userName) : [];
      typing.replaceChildren(
        names.length ? h('span', null, h('span', { class: 'dots' }, h('i'), h('i'), h('i')), ` ${names.join('、')} が入力中…`) : ''
      );
    }

    const el = h(
      'div',
      { class: 'composer-wrap' },
      warning,
      h(
        'div',
        { class: 'composer' },
        textarea,
        h(
          'div',
          { class: 'composer-bar' },
          h('button', { class: 'icon-btn', title: 'ファイルを添付（ドラッグ＆ドロップ・貼り付けも可）', onclick: () => fileInput.click() }, '📎'),
          parentId ? null : h('button', { class: 'icon-btn', title: '共同編集ドキュメントを作成', onclick: () => createDocPrompt(getConvId()) }, '📝'),
          h('button', { class: 'icon-btn', title: 'フローを設定', onclick: () => openStatusModal() }, '🌊'),
          h('span', { class: 'spacer' }),
          h('span', { class: 'hint' }, 'Enter で送信 · Shift+Enter で改行 · /doc /focus'),
          sendBtn,
          fileInput
        )
      ),
      typing
    );
    const c = { el, textarea, refresh, autosize, parentId };
    composers.add(c);
    return c;
  }

  function setupMainComposer() {
    mainComposer = createComposer({ getConvId: () => S.current, placeholder: () => `${convName(S.current)} へメッセージを送信` });
    $('#main-composer').replaceWith(mainComposer.el);
    mainComposer.textarea.value = S.drafts.get(S.current) || '';
    setupDropZone($('#main'), $('#drop-overlay'), () => (files) => uploadFiles(files, S.current, null));
    $('#messages').addEventListener('scroll', (e) => {
      const el = e.target;
      S.stickMain = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    });
  }

  // スラッシュコマンド
  function runCommand(text, convId) {
    const m = /^\/(\w+)\s*([\s\S]*)$/.exec(text.trim());
    if (!m) return false;
    const [, cmd, arg] = m;
    const flowCmd = { focus: 'focus', brainstorm: 'brainstorm', writing: 'writing', review: 'review', meeting: 'meeting', break: 'break' };
    if (cmd === 'doc') {
      send({ type: 'doc:create', convId, title: arg.trim() });
      return true;
    }
    if (flowCmd[cmd]) {
      const mm = /^(\d+)\s*(.*)$/.exec(arg.trim());
      const min = mm ? Number(mm[1]) : cmd === 'focus' ? 25 : 0;
      const topic = (mm ? mm[2] : arg).trim();
      send({ type: 'flow:set', mode: flowCmd[cmd], topic, until: min ? Date.now() + min * 60000 : null });
      return true;
    }
    if (cmd === 'done') {
      send({ type: 'flow:clear' });
      return true;
    }
    if (cmd === 'status') {
      send({ type: 'status:set', text: arg.trim(), emoji: arg.trim() ? '💬' : '' });
      return true;
    }
    if (cmd === 'help') {
      toast({ title: 'コマンド一覧', body: '/doc タイトル · /focus 25 テーマ · /brainstorm テーマ · /writing 資料名 · /review 対象 · /meeting · /break · /done · /status テキスト', timeout: 12000 });
      return true;
    }
    return false;
  }

  // ───────────────────────── 右パネル ─────────────────────────

  function closePanel() {
    if (S.panel?.type === 'doc' && S.editor) {
      send({ type: 'doc:leave', docId: S.editor.docId });
      S.editor.destroy();
      S.editor = null;
    }
    for (const c of composers) if (c !== mainComposer) composers.delete(c);
    S.panel = null;
    $('#panel').classList.add('hidden');
    $('#panel').classList.remove('wide');
    invalidate('sidebar');
  }

  function openThread(msgId) {
    const root = S.messages.get(msgId);
    if (!root) return;
    closePanel();
    S.panel = { type: 'thread', msgId };
    S.stickThread = true;
    const panel = $('#panel');
    panel.classList.remove('hidden');
    $('#panel-title').replaceChildren('スレッド', h('span', { class: 'sub' }, convName(root.convId)));
    $('#panel-tools').replaceChildren();
    const list = h('div', { class: 'messages' });
    list.addEventListener('scroll', () => (S.stickThread = list.scrollHeight - list.scrollTop - list.clientHeight < 60));
    const composer = createComposer({ getConvId: () => root.convId, parentId: msgId, placeholder: () => 'スレッドに返信…' });
    $('#panel-body').replaceChildren(list, h('div', { class: 'live-uploads' }), composer.el);
    $('#panel-drop-label').textContent = 'ドロップしてスレッドに共有';
    renderThread();
    composer.refresh();
    renderUploads();
    setTimeout(() => composer.textarea.focus(), 0);
  }

  function renderThread() {
    const list = $('#panel .messages');
    const root = S.messages.get(S.panel.msgId);
    if (!list || !root) return;
    const replies = [...S.messages.values()].filter((m) => m.parentId === root.id).sort((a, b) => a.ts - b.ts);
    const prevTop = list.scrollTop;
    let prev = null;
    const nodes = [h('div', { class: 'thread-root' }, messageEl(root, null, { inThread: true })), h('div', { class: 'thread-count' }, `${replies.length}件の返信`)];
    for (const m of replies) {
      nodes.push(messageEl(m, prev, { inThread: true }));
      prev = m;
    }
    list.replaceChildren(...nodes);
    list.scrollTop = S.stickThread ? list.scrollHeight : prevTop;
  }

  // ───────────────────────── ドキュメント ─────────────────────────

  async function createDocPrompt(convId) {
    const title = await promptModal({
      title: '📝 共同編集ドキュメントを作成',
      desc: `${convName(convId)} に投稿され、メンバー全員がリアルタイムで同時編集できます。`,
      placeholder: 'タイトル（例: 週次振り返り）',
      ok: '作成して開く',
    });
    if (title == null) return;
    send({ type: 'doc:create', convId, title });
  }

  function docCard(m) {
    const d = S.docs.get(m.docId);
    if (!d) return h('div', { class: 'doc-card' }, 'ドキュメントが見つかりません');
    return h(
      'div',
      { class: 'doc-card' },
      h(
        'div',
        { class: 'doc-head' },
        h('div', { class: 'doc-icon' }, '📝'),
        h('div', { style: 'min-width:0' }, h('div', { class: 'doc-title' }, d.title), h('div', { class: 'doc-sub' }, `共同編集ドキュメント · ${d.length}文字 · 更新 ${fmtAgo(d.updatedAt)}`))
      ),
      h(
        'div',
        { class: 'doc-foot' },
        d.editors.length
          ? h('span', { class: 'live-tag' }, h('span', { class: 'avatar-stack' }, d.editors.map((id) => avatar(S.users.get(id), 'sm', false))), `${d.editors.length}人が編集中`)
          : h('span', { class: 'doc-sub' }, `${userName(d.createdBy)} が作成`),
        h('button', { class: 'btn small primary', onclick: () => openDoc(d.id) }, '開いて編集')
      )
    );
  }

  function openDoc(docId) {
    if (S.panel?.type === 'doc' && S.panel.docId === docId) return;
    closePanel();
    S.panel = { type: 'doc', docId };
    const panel = $('#panel');
    panel.classList.remove('hidden');
    panel.classList.add('wide');
    S.editor = new DocEditor(docId);
    send({ type: 'doc:join', docId });
    invalidate('sidebar');
  }

  /**
   * 共同編集エディタ
   * クライアント側の OT 状態機械 (synchronized / awaiting / awaiting-with-buffer) を持ち、
   * サーバーと操作を送受信する。IME 変換中はリモート操作をキューに溜め、確定時にまとめて変換する。
   */
  class DocEditor {
    constructor(docId) {
      this.docId = docId;
      this.rev = 0;
      this.text = '';
      this.outstanding = null; // サーバーの ACK 待ちの操作
      this.buffer = null; // ACK 待ちの間に溜まったローカル操作
      this.pendingRemote = null; // IME 変換中に届いたリモート操作
      this.composing = false;
      this.cursors = new Map(); // sid -> { userId, pos }
      this.loaded = false;
      this.mode = load('vibe.docmode') || 'split';
      this.previewTimer = 0;
      this.cursorTimer = 0;
      this.build();
    }

    build() {
      const d = S.docs.get(this.docId);
      this.titleInput = h('input', { class: 'doc-title-input', value: d?.title || '', maxlength: 80 });
      this.titleInput.addEventListener('keydown', (e) => e.key === 'Enter' && this.titleInput.blur());
      this.titleInput.addEventListener('change', () => send({ type: 'doc:rename', docId: this.docId, title: this.titleInput.value }));
      this.editorsEl = h('div', { class: 'avatar-stack' });
      this.statusEl = h('span', { class: 'doc-status' });
      this.seg = h(
        'div',
        { class: 'seg' },
        [['edit', '編集'], ['split', '分割'], ['preview', 'プレビュー']].map(([k, label]) => h('button', { 'data-mode': k, onclick: () => this.setMode(k) }, label))
      );
      this.ta = h('textarea', { class: 'doc-textarea', spellcheck: 'false', placeholder: 'Markdown で書けます。みんなで同時に編集できます ✍️' });
      this.backdrop = h('div', { class: 'doc-backdrop' });
      this.preview = h('div', { class: 'doc-preview md' });
      this.panes = h('div', { class: 'doc-panes' }, h('div', { class: 'doc-edit-wrap' }, this.backdrop, this.ta), this.preview);
      const conv = d ? convName(d.convId) : '';

      $('#panel-title').replaceChildren('📝 共同編集ドキュメント', h('span', { class: 'sub' }, conv));
      $('#panel-tools').replaceChildren(
        h('button', { class: 'icon-btn', title: '幅を切り替え', onclick: () => $('#panel').classList.toggle('wide') }, '↔'),
        h('button', { class: 'icon-btn', title: 'Markdown をコピー', onclick: () => navigator.clipboard?.writeText(this.text).then(() => toast({ title: 'コピーしました' })) }, '⧉')
      );
      $('#panel-body').replaceChildren(
        h('div', { class: 'doc-editor' }, h('div', { class: 'doc-toolbar' }, this.titleInput, this.editorsEl, this.statusEl, this.seg), this.panes)
      );
      $('#panel-drop-label').textContent = 'ドロップしてドキュメントに挿入';

      this.ta.disabled = true;
      this.ta.addEventListener('input', () => {
        if (!this.composing) this.flushLocal();
      });
      this.ta.addEventListener('compositionstart', () => (this.composing = true));
      this.ta.addEventListener('compositionend', () => {
        this.composing = false;
        this.flushLocal();
      });
      this.ta.addEventListener('scroll', () => (this.backdrop.scrollTop = this.ta.scrollTop));
      this.ta.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          document.execCommand('insertText', false, '  ');
        }
      });
      for (const ev of ['keyup', 'click', 'select', 'focus']) this.ta.addEventListener(ev, () => this.sendCursor());
      this.setMode(this.mode);
      this.setMeta(d);
      this.renderStatus();
    }

    setMode(mode) {
      this.mode = mode;
      save('vibe.docmode', mode);
      this.panes.className = `doc-panes mode-${mode}`;
      this.seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    }

    setMeta(d) {
      if (!d) return;
      if (document.activeElement !== this.titleInput) this.titleInput.value = d.title;
      this.editorsEl.replaceChildren(...d.editors.map((id) => avatar(S.users.get(id), 'sm')));
      this.editorsEl.title = d.editors.map(userName).join(', ') + ' が編集中';
    }

    renderStatus() {
      const synced = !this.outstanding && !this.buffer;
      fill(
        this.statusEl,
        !this.loaded ? '読み込み中…' : synced ? h('span', { class: 'saved' }, '同期済み') : h('span', { class: 'syncing' }, '同期中…'),
        this.loaded ? h('span', null, ` · ${this.text.length}文字`) : null
      );
    }

    onMessage(msg) {
      switch (msg.type) {
        case 'doc:state':
        case 'doc:resync':
          if (msg.type === 'doc:resync') toast({ title: 'ドキュメントを再同期しました', body: '最新の内容を読み込み直しました' });
          if (msg.doc) S.docs.set(msg.doc.id, msg.doc);
          this.reset(msg.text, msg.rev);
          break;
        case 'doc:ack':
          this.onAck();
          break;
        case 'doc:op':
          this.onRemote(TextOperation.fromJSON(msg.op));
          break;
        case 'doc:cursor':
          this.cursors.set(msg.sid, { userId: msg.userId, pos: msg.pos });
          this.renderBackdrop();
          break;
        case 'doc:cursor-leave':
          this.cursors.delete(msg.sid);
          this.renderBackdrop();
          break;
      }
    }

    reset(text, rev) {
      this.text = text;
      this.rev = rev;
      this.outstanding = this.buffer = this.pendingRemote = null;
      this.cursors.clear();
      this.loaded = true;
      const { selectionStart: s, selectionEnd: e } = this.ta;
      this.ta.value = text;
      this.ta.disabled = false;
      if (document.activeElement === this.ta) this.ta.setSelectionRange(Math.min(s, text.length), Math.min(e, text.length));
      else if (!text.trim().split('\n').slice(1).join('').trim()) {
        this.ta.focus();
        this.ta.setSelectionRange(text.length, text.length);
      }
      this.renderAll();
    }

    // ── ローカル編集 ──
    flushLocal() {
      const value = this.ta.value;
      let op = fromDiff(this.text, value);
      if (this.pendingRemote) {
        // IME 変換中に届いたリモート操作と、変換中に入力したローカル操作を突き合わせる
        const remote = this.pendingRemote;
        this.pendingRemote = null;
        const [local2, remote2] = TextOperation.transform(op, remote);
        this.applyToTextarea(remote2, value);
        op = local2;
      } else {
        this.text = value;
      }
      if (op.isNoop()) return this.renderAll();
      for (const c of this.cursors.values()) c.pos = op.transformIndex(c.pos);
      this.applyLocal(op);
      this.renderAll();
      this.sendCursor();
    }

    applyLocal(op) {
      if (this.outstanding) this.buffer = this.buffer ? TextOperation.compose(this.buffer, op) : op;
      else {
        this.outstanding = op;
        this.sendOp(op);
      }
    }

    sendOp(op) {
      send({ type: 'doc:op', docId: this.docId, rev: this.rev, op: op.toJSON() });
    }

    onAck() {
      this.rev++;
      this.outstanding = this.buffer;
      this.buffer = null;
      if (this.outstanding) this.sendOp(this.outstanding);
      this.renderStatus();
    }

    // ── リモート編集 ──
    onRemote(op) {
      this.rev++;
      if (this.outstanding) {
        [this.outstanding, op] = TextOperation.transform(this.outstanding, op);
        if (this.buffer) [this.buffer, op] = TextOperation.transform(this.buffer, op);
      }
      for (const c of this.cursors.values()) c.pos = op.transformIndex(c.pos);
      if (this.composing) {
        this.pendingRemote = this.pendingRemote ? TextOperation.compose(this.pendingRemote, op) : op;
        return;
      }
      this.applyToTextarea(op, this.text);
      this.renderAll();
    }

    /** base(テキストエリアの現在値) に op を適用し、選択範囲とスクロール位置を保つ */
    applyToTextarea(op, base) {
      const ta = this.ta;
      const s = ta.selectionStart;
      const e = ta.selectionEnd;
      const top = ta.scrollTop;
      const next = op.apply(base);
      ta.value = next;
      this.text = next;
      ta.setSelectionRange(op.transformIndex(s), op.transformIndex(e));
      ta.scrollTop = top;
    }

    sendCursor() {
      clearTimeout(this.cursorTimer);
      this.cursorTimer = setTimeout(() => send({ type: 'doc:cursor', docId: this.docId, pos: this.ta.selectionStart, end: this.ta.selectionEnd }), 60);
    }

    // ── 描画 ──
    renderAll() {
      this.renderBackdrop();
      this.renderStatus();
      clearTimeout(this.previewTimer);
      this.previewTimer = setTimeout(() => {
        this.preview.replaceChildren(...renderMd(this.text || '*（空のドキュメント）*', 'md').childNodes);
      }, 120);
    }

    renderBackdrop() {
      const text = this.text;
      const marks = [...this.cursors.values()]
        .map((c) => ({ ...c, pos: Math.max(0, Math.min(text.length, c.pos)) }))
        .sort((a, b) => a.pos - b.pos);
      let html = '';
      let last = 0;
      for (const c of marks) {
        const u = S.users.get(c.userId);
        html += esc(text.slice(last, c.pos));
        html += `<span class="rcaret" style="--c:${esc(u?.color || '#888')}" data-name="${esc(u?.name || '?')}"></span>`;
        last = c.pos;
      }
      html += esc(text.slice(last)) + '\n ';
      this.backdrop.innerHTML = html;
      this.backdrop.scrollTop = this.ta.scrollTop;
    }

    // ドキュメントへのファイル挿入（アップロードしてリンクを差し込む）
    async insertFiles(files) {
      const d = S.docs.get(this.docId);
      if (!d) return;
      for (const file of files) {
        const res = await uploadOne(file, d.convId, null);
        if (!res) continue;
        const md = fileKind(res) === 'image' ? `![${res.name}](/files/${res.id})` : `[📎 ${res.name}](/files/${res.id})`;
        this.ta.focus();
        document.execCommand('insertText', false, `\n${md}\n`);
      }
    }

    destroy() {
      clearTimeout(this.previewTimer);
      clearTimeout(this.cursorTimer);
    }
  }

  // ───────────────────────── ステータス & フロー設定 ─────────────────────────

  function openStatusModal() {
    const u = me();
    let emoji = u.status?.emoji || '💬';
    let clearAfter = null;
    let flowMode = u.flow?.mode || null;
    let duration = 25;
    let flowDirty = false; // フロー欄を触ったときだけ保存する(既存フローのタイマーを壊さない)
    let away = S.manualAway;

    const emojiBtn = h('button', { class: 'emoji-btn', type: 'button' }, emoji);
    const emojiGrid = h(
      'div',
      { class: 'emoji-grid hidden' },
      STATUS_EMOJIS.map((e) =>
        h('button', {
          type: 'button',
          onclick: () => {
            emoji = e;
            emojiBtn.textContent = e;
            emojiGrid.classList.add('hidden');
          },
        }, e)
      )
    );
    emojiBtn.onclick = () => emojiGrid.classList.toggle('hidden');
    const statusInput = h('input', { class: 'input', placeholder: 'ステータスを入力（例: 午後は外出します）', value: u.status?.text || '', maxlength: 80 });

    const clearChips = h('div', { class: 'chips' });
    const clearOptions = [['なし', null], ['30分', 30], ['1時間', 60], ['4時間', 240], ['今日', 'today']];
    const renderClear = () =>
      clearChips.replaceChildren(
        h('span', { class: 'conv-topic', style: 'align-self:center' }, '自動クリア:'),
        ...clearOptions.map(([label, v]) => h('button', { type: 'button', class: 'chip-btn' + (clearAfter === v ? ' on' : ''), onclick: () => ((clearAfter = v), renderClear()) }, label))
      );
    renderClear();

    const suggest = h(
      'div',
      { class: 'status-suggest' },
      STATUS_SUGGEST.map(([e, t, c]) =>
        h('button', {
          type: 'button',
          onclick: () => {
            emoji = e;
            emojiBtn.textContent = e;
            statusInput.value = t;
            clearAfter = c;
            renderClear();
          },
        }, `${e}  ${t}`)
      )
    );

    // フロー
    const topicInput = h('input', { class: 'input', value: u.flow?.topic || '', maxlength: 80 });
    const presets = h('div', { class: 'presets' });
    const durChips = h('div', { class: 'chips' });
    const flowPreview = h('div', { style: 'margin-top:10px' });
    const renderFlow = () => {
      presets.replaceChildren(
        ...Object.entries(FLOWS).map(([k, f]) =>
          h(
            'button',
            { type: 'button', class: 'preset' + (flowMode === k ? ' on' : ''), style: `--c:${f.color}`, onclick: () => ((flowMode = flowMode === k ? null : k), (flowDirty = true), renderFlow()) },
            h('div', { class: 'p-title' }, `${f.icon} ${f.name}`),
            h('div', { class: 'p-desc' }, f.desc)
          )
        )
      );
      durChips.replaceChildren(
        h('span', { class: 'conv-topic', style: 'align-self:center' }, '時間:'),
        ...DURATIONS.map(([label, v]) => h('button', { type: 'button', class: 'chip-btn' + (duration === v ? ' on' : ''), onclick: () => ((duration = v), (flowDirty = true), renderFlow()) }, label))
      );
      topicInput.placeholder = flowMode ? FLOWS[flowMode].ph : 'まずフローを選んでください';
      topicInput.disabled = !flowMode;
      flowPreview.replaceChildren(
        flowMode
          ? h('div', { class: 'conv-topic' }, 'チームにはこう見えます → ', flowChip({ mode: flowMode, topic: topicInput.value.trim() }), flowMode === 'focus' ? ' 🔕 通知オフ' : '')
          : ''
      );
    };
    topicInput.addEventListener('input', () => {
      flowDirty = true;
      renderFlow();
    });
    renderFlow();

    const awayChips = h('div', { class: 'chips' });
    const renderAway = () =>
      awayChips.replaceChildren(
        h('button', { type: 'button', class: 'chip-btn' + (!away ? ' on' : ''), onclick: () => ((away = false), renderAway()) }, '🟢 自動（アクティブ）'),
        h('button', { type: 'button', class: 'chip-btn' + (away ? ' on' : ''), onclick: () => ((away = true), renderAway()) }, '🟡 離席中にする')
      );
    renderAway();

    const doSave = (e) => {
      e.preventDefault();
      const text = statusInput.value.trim();
      let expiresAt = null;
      if (clearAfter === 'today') {
        const d = new Date();
        d.setHours(23, 59, 59, 0);
        expiresAt = d.getTime();
      } else if (clearAfter) expiresAt = Date.now() + clearAfter * 60000;
      send({ type: 'status:set', text, emoji: text ? emoji : '', expiresAt });

      if (flowDirty) {
        if (flowMode) send({ type: 'flow:set', mode: flowMode, topic: topicInput.value.trim(), until: duration ? Date.now() + duration * 60000 : null });
        else if (u.flow) send({ type: 'flow:clear' });
      }

      if (away !== S.manualAway) {
        S.manualAway = away;
        updateAway(true);
      }
      m.close();
    };

    const m = modal(
      h(
        'form',
        { onsubmit: doSave },
        h('div', { class: 'row', style: 'margin-bottom:12px' }, avatar(u, 'lg'), h('div', null, h('h2', null, u.name), h('div', { class: 'conv-topic' }, PRESENCE_LABEL[presenceOf(u)]))),
        h('h3', null, '🌊 フロー — いま何に取り組んでる？'),
        h('p', { class: 'desc', style: 'margin-bottom:10px' }, '活動状況をチームと共有して、声をかけるタイミングや協力のきっかけをつくります。集中モード中は通知がオフになります。'),
        presets,
        h('label', { class: 'field' }, h('span', null, 'テーマ・詳細'), topicInput),
        h('div', { style: 'margin-top:10px' }, durChips),
        flowPreview,
        h('h3', null, '💬 カスタムステータス'),
        h('div', { class: 'row' }, emojiBtn, statusInput),
        emojiGrid,
        suggest,
        h('div', { style: 'margin-top:8px' }, clearChips),
        h('h3', null, 'プレゼンス'),
        awayChips,
        h(
          'div',
          { class: 'actions' },
          h('button', { type: 'button', class: 'btn ghost danger', style: 'margin-right:auto', onclick: logout }, 'ログアウト'),
          h('button', { type: 'button', class: 'btn', onclick: () => m.close() }, 'キャンセル'),
          h('button', { type: 'submit', class: 'btn primary' }, '保存')
        )
      )
    );
  }

  function logout() {
    save('vibe.name', null);
    location.reload();
  }

  // ───────────────────────── 離席検知 ─────────────────────────

  function updateAway(force) {
    const idle = Date.now() - S.lastActivity > 5 * 60000;
    const away = S.manualAway || idle;
    if (away !== S.away || force) {
      S.away = away;
      send({ type: 'presence', away });
    }
  }
  for (const ev of ['mousemove', 'keydown', 'mousedown', 'touchstart', 'focus']) {
    window.addEventListener(
      ev,
      () => {
        S.lastActivity = Date.now();
        if (S.away && !S.manualAway) updateAway();
      },
      { passive: true }
    );
  }
  setInterval(() => S.me && updateAway(), 20000);

  // 残り時間などの表示を定期更新し、途中で切断された他人のアップロード表示を掃除する
  setInterval(() => {
    if (!S.me) return;
    for (const [k, u] of S.uploads) if (u.userId !== S.me && Date.now() - u.at > 30000) S.uploads.delete(k);
    invalidate('sidebar', 'header', 'uploads');
  }, 15000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && S.me) {
      S.unread.delete(S.current);
      invalidate('sidebar', 'title');
    }
  });

  // ───────────────────────── 起動 ─────────────────────────

  setupDropZone($('#panel'), $('#panel-drop'), () => {
    if (S.panel?.type === 'thread') {
      const root = S.messages.get(S.panel.msgId);
      return root ? (files) => uploadFiles(files, root.convId, root.id) : null;
    }
    if (S.panel?.type === 'doc' && S.editor) {
      const editor = S.editor;
      return (files) => editor.insertFiles(files);
    }
    return null;
  });
  $('#me-card').addEventListener('click', openStatusModal);
  $('#panel-close').addEventListener('click', closePanel);
  $('#add-channel').addEventListener('click', async () => {
    const r = await promptModal({
      title: 'チャンネルを作成',
      placeholder: 'チャンネル名（例: design）',
      ok: '作成',
      extra: { placeholder: 'トピック（任意）' },
    });
    if (r && r.value.trim()) send({ type: 'channel:create', name: r.value, topic: r.extra });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && S.panel && !document.querySelector('.modal-backdrop')) closePanel();
  });
  // ページ全体へのドロップでファイルが開かれてしまうのを防ぐ
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  function showLogin() {
    $('#login').classList.remove('hidden');
    $('#login-name').value = S.name || '';
    $('#login-name').focus();
  }

  $('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#login-name').value.trim();
    if (!name) return;
    S.name = name;
    save('vibe.name', name);
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    if (ws && ws.readyState === 1) send({ type: 'hello', name });
    else if (!ws) connect();
  });

  if (S.name) connect();
  else showLogin();
})();
