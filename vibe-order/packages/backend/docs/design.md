# backend 設計

- 関連: [システム設計](../../../docs/design/system-design.md)（全体の決まり、環境変数、セキュリティ）、[shared 設計](../../shared/docs/design.md)（スキーマ、REST API、WebSocket メッセージ）、[frontend 設計](../../frontend/docs/design.md)
- 実装タスク: [実装計画](../../../docs/plans/plan_mvp_20261023062925.md) の B1〜B14

API とメッセージの形は [shared 設計](../../shared/docs/design.md) に従う。この文書には、それをどう実装するかだけを書く。

## 1. ディレクトリ構成

```
packages/backend/src/
  app.ts               createApp(deps)。/health、/api/*、/ws をまとめる
  index.ts             config を読み、DB を開き、serve({ fetch, websocket: { server: wss } })
  config.ts            環境変数を Zod で検証する
  db/database.ts       openDatabase(path)、migrate()、seed()
  db/schema.sql        2 章の DDL
  db/seed.ts           メニュー 10 品、席 SEAT_COUNT 個
  services/menu.ts  services/sessions.ts  services/orders.ts  services/gacha.ts
  routes/customer.ts  routes/staff.ts  routes/errors.ts（共通のエラー応答）
  middleware/staffAuth.ts
  ws/hub.ts  ws/handler.ts
```

## 2. 層の分け方

```
routes（入力の検証、HTTP への変換） ─▶ services（業務処理） ─▶ db（node:sqlite）
                                         └─ publish ─▶ ws/hub ─▶ ws/handler ─▶ 接続
```

- `createApp({ db, hub, config, random, now })` で依存を受け取る。テストでは `:memory:` の DB、偽の乱数、固定した時刻を渡す
- `index.ts` は起動処理だけにする（カバレッジの対象外のまま）
- 書き込みはすべて services を通す。services は DB を更新してから Hub に publish する
- routes は検証と HTTP への変換だけを行い、業務の判断は shared の `orderRules.ts` と services に任せる
- WebSocket は `@hono/node-server` の `upgradeWebSocket` を使い、`ws` の `WebSocketServer({ noServer: true })` を `serve()` に渡す

## 3. データベース（node:sqlite）

- テーブルはすべて `STRICT` にする。起動時に `PRAGMA foreign_keys = ON` と `PRAGMA journal_mode = WAL` を実行する
- SQL の書き方は [システム設計](../../../docs/design/system-design.md) の「4. セキュリティ」に従う
- 状態の値と、金額・時刻の表し方は [shared 設計](../../shared/docs/design.md) の「2. 値の表し方」と同じにする

```sql
CREATE TABLE IF NOT EXISTS menu (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  price       INTEGER NOT NULL CHECK (price >= 0),
  description TEXT    NOT NULL DEFAULT '',
  category    TEXT    NOT NULL,              -- 例: main / side / drink / dessert
  sold_out    INTEGER NOT NULL DEFAULT 0 CHECK (sold_out IN (0, 1)),
  sort_order  INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE IF NOT EXISTS seats (
  id     INTEGER PRIMARY KEY,
  label  TEXT NOT NULL UNIQUE,               -- 例: "1" 〜 "20"
  token  TEXT NOT NULL UNIQUE                -- QR の URL に入れる。crypto.randomBytes(16) を base64url にしたもの
) STRICT;

CREATE TABLE IF NOT EXISTS sessions (        -- 来店単位
  id          INTEGER PRIMARY KEY,
  seat_id     INTEGER NOT NULL REFERENCES seats(id),
  token       TEXT    NOT NULL UNIQUE,       -- 同じ席の端末で共有する。randomBytes(16) の base64url
  started_at  TEXT    NOT NULL,
  ended_at    TEXT                           -- NULL なら利用中
) STRICT;
-- 1 つの席で利用中のセッションは 1 つだけ
CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_active_per_seat
  ON sessions(seat_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS orders (
  id                    INTEGER PRIMARY KEY,
  session_id            INTEGER NOT NULL REFERENCES sessions(id),  -- 注文した来店（会計先）
  status                TEXT    NOT NULL DEFAULT 'received'
                        CHECK (status IN ('received','cooking','served','cancelled')),
  delivered_session_id  INTEGER REFERENCES sessions(id),           -- 提供済にしたとき決まる。ガチャが当たれば別の来店
  created_at            TEXT    NOT NULL,
  updated_at            TEXT    NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS orders_session ON orders(session_id);
CREATE INDEX IF NOT EXISTS orders_status  ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  id          INTEGER PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id),
  menu_id     INTEGER NOT NULL REFERENCES menu(id),
  name        TEXT    NOT NULL,              -- 注文した時点の名前と価格を残す（会計がぶれないように）
  unit_price  INTEGER NOT NULL CHECK (unit_price >= 0),
  quantity    INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10)
) STRICT;
```

- 初期データ: `migrate()` のあとに、`menu` が空なら 10 品を入れる（うち 1 品は `sold_out = 1`）。`seats` の数が `SEAT_COUNT` より少なければ、足りない分を作る。何度実行しても結果が変わらない
- 注文の作成は、売切れの確認と orders / order_items の挿入を 1 つのトランザクションで行う
- `data/` は `.gitignore` に追加する

## 4. 認証の実装

- スタッフ: `middleware/staffAuth.ts` で `X-Staff-Key` と `STAFF_KEY` を `crypto.timingSafeEqual` で比べる。長さが違うときも、先に長さで分岐して例外にしない
- 客: `X-Session-Token` で `sessions` を引く。見つからなければ 401、`ended_at` があれば 410
- WebSocket: 接続したら 5 秒のタイマーを始め、最初の `auth` で上と同じ確認をする。タイマーは注入できるようにして、テストでは短くする

## 5. 注文ガチャ（`services/gacha.ts`）

- `cooking → served` にするとき、`random() < GACHA_RATE` で、かつ自分以外に利用中のセッションがあれば、その中から `random()` で 1 つ選んで `delivered_session_id` にする。そうでなければ自分のセッションにする
- 別のセッションに届いたら、届いた先に `gift.received` を publish する

## 6. Hub（`ws/hub.ts`）

- チャンネルは `staff` と `session:<id>` の 2 種類にする。shared のメッセージ表の「宛先」を、このチャンネルに対応させる
- `subscribe(channel, socket)` / `unsubscribe` / `publish(channel, message)`。送信に失敗した接続は購読から外す
- 会計済にしたら、`session:<id>` の接続に `session.closed` を送ってから閉じる

## 7. テスト

- ユニットと API のテスト: `:memory:` の DB で `app.request()` を呼ぶ。毎回 DB を作り直し、テストどうしで状態を共有しない
- WebSocket の結合テスト: `serve` をポート 0 で起動し、Node 24 標準の `WebSocket` で接続する
- 非機能: 20 席ぶんの客の接続とスタッフの接続をつないだ状態で、イベントが 1 秒以内に届くこと、REST が 1 秒以内に応答することを確かめる
