'use strict';
/*
 * Vibe Chat のスモークテスト
 *  1. OT の transform / compose がランダム操作で収束することを確認
 *  2. 一時ディレクトリでサーバーを起動し、2 クライアントでチャット・スレッド・
 *     ステータス・フロー・ファイル共有・ドキュメント同時編集を確認
 */
const assert = require('assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { TextOperation, fromDiff } = require('../public/ot.js');

// ───────── 1. OT ─────────
function randomOp(str) {
  const op = new TextOperation();
  let i = 0;
  while (i < str.length) {
    const n = 1 + Math.floor(Math.random() * Math.min(5, str.length - i));
    const r = Math.random();
    if (r < 0.2) op.insert(['あ', 'b', '漢字', '\n', 'xyz'][Math.floor(Math.random() * 5)]);
    else if (r < 0.4) op.delete(n);
    else op.retain(n);
    i += r < 0.2 ? 0 : n;
  }
  if (Math.random() < 0.4) op.insert('末尾');
  return op;
}

for (let k = 0; k < 2000; k++) {
  const s = 'Hello 世界\nこんにちは markdown'.slice(0, Math.floor(Math.random() * 25));
  const a = randomOp(s);
  const b = randomOp(s);
  const [a1, b1] = TextOperation.transform(a, b);
  assert.strictEqual(b1.apply(a.apply(s)), a1.apply(b.apply(s)), 'transform convergence');
  const c = randomOp(a.apply(s));
  assert.strictEqual(TextOperation.compose(a, c).apply(s), c.apply(a.apply(s)), 'compose');
  const t = a.apply(s);
  assert.strictEqual(fromDiff(s, t).apply(s), t, 'fromDiff');
}
console.log('✓ OT: transform / compose / fromDiff (2000 random cases)');

// ───────── 2. サーバー ─────────
const PORT = 3900 + Math.floor(Math.random() * 90);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-test-'));
const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', VIBE_DATA_DIR: dataDir },
  stdio: ['ignore', 'pipe', 'inherit'],
});

function client(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    const inbox = [];
    const waiters = [];
    ws.on('message', (d) => {
      const msg = JSON.parse(d);
      const i = waiters.findIndex((w) => w.pred(msg));
      if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
      else inbox.push(msg);
      if (c.onAny) c.onAny(msg);
    });
    const c = {
      ws,
      send: (m) => ws.send(JSON.stringify(m)),
      wait(pred, ms = 3000) {
        const i = inbox.findIndex(pred);
        if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
        return new Promise((res, rej) => {
          const t = setTimeout(() => rej(new Error(`${name}: timeout waiting`)), ms);
          waiters.push({ pred, resolve: (m) => (clearTimeout(t), res(m)) });
        });
      },
    };
    ws.on('open', async () => {
      c.send({ type: 'hello', name });
      const first = await c.wait((m) => m.type === 'init' || m.type === 'error');
      if (first.type === 'error') {
        ws.close();
        return reject(new Error(first.message));
      }
      c.init = first;
      c.me = c.init.me;
      resolve(c);
    });
    ws.on('error', reject);
  });
}

/** テスト用の OT クライアント(ブラウザの DocEditor と同じ状態機械) */
function docClient(c, docId, text, rev) {
  const d = { text, rev, outstanding: null, buffer: null };
  const sendOp = (op) => c.send({ type: 'doc:op', docId, rev: d.rev, op: op.toJSON() });
  d.local = (op) => {
    d.text = op.apply(d.text);
    if (d.outstanding) d.buffer = d.buffer ? TextOperation.compose(d.buffer, op) : op;
    else sendOp((d.outstanding = op));
  };
  c.onAny = (m) => {
    if (m.docId !== docId) return;
    if (m.type === 'doc:ack') {
      d.rev++;
      d.outstanding = d.buffer;
      d.buffer = null;
      if (d.outstanding) sendOp(d.outstanding);
    } else if (m.type === 'doc:op') {
      d.rev++;
      let op = TextOperation.fromJSON(m.op);
      if (d.outstanding) {
        [d.outstanding, op] = TextOperation.transform(d.outstanding, op);
        if (d.buffer) [d.buffer, op] = TextOperation.transform(d.buffer, op);
      }
      d.text = op.apply(d.text);
    } else if (m.type === 'doc:resync') {
      throw new Error('unexpected resync');
    }
  };
  return d;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await new Promise((r) => server.stdout.on('data', (d) => String(d).includes('running') && r()));
  const alice = await client('alice');
  const bob = await client('bob');
  const general = alice.init.channels.find((c) => c.name === 'general');
  const conv = 'c:' + general.id;
  assert.ok(general, 'default channel');

  // プレゼンス
  const pres = await alice.wait((m) => m.type === 'user:update' && m.user.name === 'bob');
  assert.strictEqual(pres.user.presence, 'online');
  console.log('✓ presence: bob がオンラインとして配信される');

  // チャンネルメッセージ
  alice.send({ type: 'message:send', convId: conv, text: 'こんにちは @bob' });
  const got = await bob.wait((m) => m.type === 'message:new');
  assert.strictEqual(got.message.text, 'こんにちは @bob');
  console.log('✓ チャンネルにリアルタイム配信');

  // スレッド
  bob.send({ type: 'message:send', convId: conv, parentId: got.message.id, text: 'スレッド返信' });
  const reply = await alice.wait((m) => m.type === 'message:new' && m.message.parentId === got.message.id);
  const parentUpd = await alice.wait((m) => m.type === 'message:update' && m.message.id === got.message.id);
  assert.strictEqual(reply.message.text, 'スレッド返信');
  assert.strictEqual(parentUpd.message.replyCount, 1);
  console.log('✓ スレッド返信と返信数の更新');

  // リアクション
  bob.send({ type: 'reaction:toggle', id: got.message.id, emoji: '🎉' });
  const re = await alice.wait((m) => m.type === 'message:update' && m.message.reactions?.['🎉']);
  assert.deepStrictEqual(re.message.reactions['🎉'], [bob.me]);
  console.log('✓ リアクション');

  // 編集: 本人だけが編集でき、editedAt が付く
  bob.send({ type: 'message:edit', id: got.message.id, text: '乗っ取り' });
  alice.send({ type: 'message:edit', id: got.message.id, text: 'こんにちは @bob（修正）' });
  const ed = await bob.wait((m) => m.type === 'message:update' && m.message.id === got.message.id && m.message.editedAt);
  assert.strictEqual(ed.message.text, 'こんにちは @bob（修正）');
  assert.strictEqual(ed.message.replyCount, 1, '編集後もスレッド情報を保つ');
  console.log('✓ メッセージ編集(他人のメッセージは編集できない)');

  // 削除: 本人だけが削除でき、本文が消える
  alice.send({ type: 'message:send', convId: conv, text: '消す予定' });
  const toDel = await bob.wait((m) => m.type === 'message:new' && m.message.text === '消す予定');
  bob.send({ type: 'message:delete', id: toDel.message.id });
  alice.send({ type: 'message:delete', id: toDel.message.id });
  const del = await bob.wait((m) => m.type === 'message:update' && m.message.id === toDel.message.id);
  assert.strictEqual(del.message.deleted, true);
  assert.strictEqual(del.message.text, '');
  alice.send({ type: 'message:edit', id: toDel.message.id, text: '復活' });
  await assert.rejects(bob.wait((m) => m.type === 'message:update' && m.message.id === toDel.message.id, 300));
  console.log('✓ メッセージ削除(削除済みは編集できない)');

  // ユーザー名は 20 文字まで(絵文字も 1 文字)
  for (const name of ['あ'.repeat(20), '🎉'.repeat(20)]) (await client(name)).ws.close();
  await assert.rejects(client('a'.repeat(21)), /20文字以内/);
  console.log('✓ ユーザー名は 20 文字まで');

  // DM: 第三者には届かない
  const carol = await client('carol');
  const dm = 'd:' + [alice.me, bob.me].sort().join(':');
  alice.send({ type: 'message:send', convId: dm, text: '内緒の話' });
  await bob.wait((m) => m.type === 'message:new' && m.message.convId === dm);
  await sleep(200);
  carol.send({ type: 'typing', convId: conv });
  await assert.rejects(carol.wait((m) => m.type === 'message:new' && m.message.convId === dm, 300));
  console.log('✓ DM は当事者だけに届く');

  // カスタムステータス & フロー
  bob.send({ type: 'status:set', emoji: '🚃', text: '移動中' });
  const st = await alice.wait((m) => m.type === 'user:update' && m.user.status?.text === '移動中');
  assert.strictEqual(st.user.status.emoji, '🚃');
  bob.send({ type: 'flow:set', mode: 'focus', topic: '設計書', until: Date.now() + 25 * 60000 });
  const fl = await alice.wait((m) => m.type === 'user:update' && m.user.flow?.mode === 'focus');
  assert.strictEqual(fl.user.flow.topic, '設計書');
  bob.send({ type: 'flow:set', mode: 'brainstorm', topic: '期限切れ', until: Date.now() + 300 });
  await alice.wait((m) => m.type === 'user:update' && m.user.flow?.topic === '期限切れ');
  await alice.wait((m) => m.type === 'user:update' && m.user.name === 'bob' && m.user.flow === null, 8000);
  console.log('✓ カスタムステータスとフロー(期限切れで自動解除)');

  // ライブ・ファイル共有
  alice.send({ type: 'upload:progress', convId: conv, tempId: 't1', name: 'a.txt', size: 5, pct: 40 });
  const prog = await bob.wait((m) => m.type === 'upload:progress');
  assert.strictEqual(prog.pct, 40);
  const up = await fetch(`http://127.0.0.1:${PORT}/api/upload`, {
    method: 'POST',
    headers: { 'X-File-Name': encodeURIComponent('メモ.md'), 'X-User-Id': alice.me, 'Content-Type': 'text/markdown' },
    body: '# hello',
  }).then((r) => r.json());
  assert.strictEqual(up.size, 7);
  alice.send({ type: 'message:send', convId: conv, files: [{ id: up.id }] });
  const fm = await bob.wait((m) => m.type === 'message:new' && m.message.files?.length);
  assert.strictEqual(fm.message.files[0].name, 'メモ.md');
  const body = await fetch(`http://127.0.0.1:${PORT}/files/${up.id}`).then((r) => r.text());
  assert.strictEqual(body, '# hello');
  const html = await fetch(`http://127.0.0.1:${PORT}/api/upload`, {
    method: 'POST',
    headers: { 'X-File-Name': 'x.html', 'X-User-Id': alice.me, 'Content-Type': 'text/html' },
    body: '<script>alert(1)</script>',
  }).then((r) => r.json());
  const hr = await fetch(`http://127.0.0.1:${PORT}/files/${html.id}`);
  assert.match(hr.headers.get('content-disposition'), /^attachment/);
  console.log('✓ ファイル共有(進捗配信 / アップロード / 配信 / HTML は添付扱い)');

  // 共同編集ドキュメント
  alice.send({ type: 'doc:create', convId: conv, title: '議事録' });
  const created = await alice.wait((m) => m.type === 'doc:created');
  await bob.wait((m) => m.type === 'message:new' && m.message.docId === created.docId);
  alice.send({ type: 'doc:join', docId: created.docId });
  bob.send({ type: 'doc:join', docId: created.docId });
  const sa = await alice.wait((m) => m.type === 'doc:state');
  const sb = await bob.wait((m) => m.type === 'doc:state');
  assert.strictEqual(sa.text, '# 議事録\n\n');
  const A = docClient(alice, created.docId, sa.text, sa.rev);
  const B = docClient(bob, created.docId, sb.text, sb.rev);

  // 両者がランダムに同時編集
  for (let i = 0; i < 150; i++) {
    for (const [d, label] of [[A, 'A'], [B, 'B']]) {
      if (Math.random() < 0.7) {
        const pos = Math.floor(Math.random() * (d.text.length + 1));
        const del = Math.random() < 0.3 ? Math.min(2, d.text.length - pos) : 0;
        const ins = Math.random() < 0.8 ? label + i : '';
        d.local(new TextOperation().retain(pos).delete(del).insert(ins).retain(d.text.length - pos - del));
      }
    }
    if (i % 10 === 0) await sleep(5);
  }
  for (let i = 0; i < 100 && (A.outstanding || B.outstanding); i++) await sleep(30);
  await sleep(200);
  assert.strictEqual(A.text, B.text, 'clients converge');
  bob.send({ type: 'doc:leave', docId: created.docId });
  const carolInit = await client('carol');
  const meta = carolInit.init.docs.find((x) => x.id === created.docId);
  assert.strictEqual(meta.length, A.text.length, 'server converges');
  console.log(`✓ ドキュメント同時編集が収束 (${A.text.length} 文字, rev ${A.rev})`);

  for (const c of [alice, bob, carol, carolInit]) c.ws.close();
}

main()
  .then(() => {
    console.log('\nall tests passed 🎉');
    server.on('exit', () => fs.rmSync(dataDir, { recursive: true, force: true }));
    server.kill();
  })
  .catch((e) => {
    console.error(e);
    server.kill();
    process.exit(1);
  });
