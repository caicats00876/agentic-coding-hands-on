# vibe-order システム設計（MVP）

- Status: Accepted（2026-10-23）
- 関連: [要求仕様](../requirements.md)、[実装計画](../plans/plan_mvp_20261023062925.md)、[ADR 0002](../adr/0002-mvp-architecture.md)

## Context

`vibe-order/docs/requirements.md` の要求仕様をもとに、Day3 で作ったモノレポ雛形（shared / backend / frontend、`GET /health` のみ）の上に、リアルタイム オーダー管理システムの MVP を作る。
`packages/shared` で契約（Zod スキーマと純粋関数）を先に固め、そのあと `packages/backend` と `packages/frontend` を別々に並行して実装できるようにする。
注文ガチャは MVP に含める。実装タスクと受け入れ条件は[実装計画](../plans/plan_mvp_20261023062925.md)の「5. 実装タスク」にある。

## ドキュメントの構成

同じ内容は 1 か所にだけ書き、ほかの文書からはリンクで参照する。

| 文書 | 書くこと |
|---|---|
| この文書 | 全体像、決定事項、技術選定、環境変数、セキュリティ、将来の拡張 |
| [shared 設計](../../packages/shared/docs/design.md) | スキーマ、業務ルール（状態遷移、合計金額）、REST API、WebSocket メッセージ |
| [backend 設計](../../packages/backend/docs/design.md) | ディレクトリ構成、層の分け方、テーブル定義、認証・ガチャ・Hub の実装、テスト |
| [frontend 設計](../../packages/frontend/docs/design.md) | ディレクトリ構成、画面、API クライアント、再接続、状態の管理、テスト |

## 1. 決定事項

### 合意済みの決定事項（2026-10-23）

| 論点 | 決定 |
|---|---|
| 注文の単位 | 1 注文 = 複数の品目。状態とキャンセルは注文ごとに扱う |
| キッチン画面 | 1 画面で 受付 → 調理中 → 提供済 のすべてを操作する。状態は要求仕様どおり 3 つ（＋キャンセル済） |
| 席の識別 | 客がケータイで QR を読む。QR の URL には推測できない**席トークン**を入れる |
| 来店の区切り | 席ごとの**来店セッション**。QR を読んだとき、その席に有効なセッションが無ければ作る。同じ席の複数のケータイは同じセッションを共有する。キッチン画面の「会計済（退席）」でセッションを終える。終わったセッションでは注文できない |
| 画面の保護 | 客は席トークン → セッショントークンで操作する。スタッフ用の API と WebSocket には環境変数 `STAFF_KEY` が必要 |
| 注文ガチャ | **MVP に入れる**。「提供済」にするときにサーバーが抽選し、当たれば利用中の別の席に届ける。結果は注文した客の進捗画面と、届いた席の画面に出す。代金は注文した席の会計に残す |
| 即時 | リロードしなくても画面が更新されること |
| 席の数 | `SEAT_COUNT`（既定 20）で変えられる。非機能要件（20 席の同時接続）は 20 で検証する |
| 研修での確認 | 客の画面も PC のブラウザで動けば十分とする。QR の URL をブラウザで直接開いて確かめる。Codespaces のポートは Private なので、ケータイからの接続は確かめない。E2E も PC の Chromium だけで行う |

### 技術選定（新しい依存は `ws` と `@types/ws` だけ）

| 用途 | 採用 | 理由 |
|---|---|---|
| SQLite | **Node 24 標準の `node:sqlite`（`DatabaseSync`）** | 標準機能で足りる（依存を増やさない）。`node -e "require('node:sqlite')"` で警告なしに読み込めることを確認済み。使い方は Node 公式ドキュメントで確かめてから書く |
| WebSocket（サーバー） | `@hono/node-server` 2.1.5 の `upgradeWebSocket` ＋ **`ws`（MIT）と `@types/ws`** | `node_modules/@hono/node-server/README.md` の「WebSocket」節に「install `ws` (and `@types/ws`) ... provide a `WebSocketServer`」とある。追加するのはこの 2 つだけ。版は 7 日ルールで決め、memo.md に記録する |
| WebSocket（クライアント、テスト） | ブラウザと Node 24 標準の `WebSocket` | 依存を増やさない |
| 画面の切り替え | `location.pathname` で分ける（ルーターのライブラリは入れない） | 画面は 2 つだけなので KISS |
| QR 画像 | MVP では作らない。スタッフ画面に席ごとの URL を表示し、QR は外部のツールで作る | QR の生成には依存が必要になるため。画面での生成は将来の拡張 |

## 2. 全体アーキテクチャ

```
 客の画面 (/s/:seatToken)              キッチン画面 (/kitchen)
        │  REST + WS                          │  REST + WS (X-Staff-Key)
        ▼                                     ▼
 ┌──────────── frontend: Vite dev / preview（:5173）────────────┐
 │  React SPA     proxy: /api → :3000、/ws → :3000（ws: true）     │
 └───────────────────────────────┬──────────────────────────────┘
                                 ▼
 ┌──────────── backend: Hono + @hono/node-server（:3000）────────┐
 │  routes ─▶ services ─▶ db（node:sqlite）                       │
 │                └─ publish ─▶ ws/hub ─▶ WebSocket の接続          │
 └────────────────────────────────────────────────────────────────┘

 shared（契約）: Zod スキーマ、型、純粋関数 ─┬─▶ backend
                                          └─▶ frontend
```

- 実装の順番: shared を先に作る。そのあと backend と frontend は並行して作れる。frontend は backend ができるまで、API と WebSocket をテスト用の偽物に差し替えて進める
- 同じオリジンで配信する（Vite の proxy）。そのため CORS の設定は要らない。Codespaces で転送するポートは 5173 だけにする
- 即時反映: 変更は WebSocket で配信し、クライアントは受け取った注文で画面の状態を置き換える。WebSocket が再接続したら REST で一覧を取り直し、切断中に取りこぼした変更を補う

## 3. 環境変数

backend の `config.ts` で Zod で検証する。`.env.example` だけをコミットする。

| 変数 | 既定 | 検証 | 用途 |
|---|---|---|---|
| `PORT` | 3000 | 整数 | backend のポート |
| `DB_PATH` | `data/vibe-order.db` | 文字列 | SQLite のファイル。E2E では起動前に消す一時ファイルにする |
| `STAFF_KEY` | **なし（必須）** | 16 文字以上。無ければ起動しない | スタッフの認証 |
| `SEAT_COUNT` | 20 | 1〜10000 の整数 | 席の数 |
| `GACHA_RATE` | 0.1 | 0〜1 | 注文ガチャが当たる確率。E2E では 0 か 1 にして結果を固定する |

## 4. セキュリティ上の判断と残るリスク

- Codespaces のポートの公開範囲は Private か Organization にする
- 秘密情報は `STAFF_KEY` だけ。`.env` はコミットせず、`.env.example`（値は空）だけを置く
- API の入力はすべて shared の Zod スキーマで検証する
- SQL はすべてプレースホルダ付きの prepared statement で書く（文字列の連結はしない）
- React の既定のエスケープに任せ、`dangerouslySetInnerHTML` は使わない
- WebSocket の認証は URL ではなく、接続後の最初のメッセージで行う（トークンをログに残さない）
- テスト用に認証を外すフラグは作らない
- **残るリスク（MVP では受け入れる）**
  - 席の QR の URL を持ち帰った人は、その席の次の来店に入れる。対策は将来の拡張（スタッフが来店を開始する、来店ごとの PIN など）
  - `STAFF_KEY` は全スタッフで共有する固定のキー。拡張のスタッフ認証（JWT）で置き換える
  - 回数の制限（rate limit）は無い。Codespaces のポートを Private / Organization にすることが前提

## 5. 将来の拡張（MVP の範囲外）

| 拡張 | 設計の方向性 |
|---|---|
| 席の状態管理（空席 / 着席 / 注文中 / 調理中 / 提供済 / 会計待ち） | 着席・会計待ちは sessions に列を足し、注文中〜提供済はセッション内の注文の状態から計算する。`seat.updated` イベントを追加する |
| 再注文 | 過去の注文の items をカートにコピーする（frontend だけで実現できる） |
| メニューの CRUD 画面、おすすめフラグ、売切れの切り替え | `menu` に `recommended` 列を足し、`/api/staff/menu` の CRUD を作る。`menu.updated` を全員に配信する |
| スタッフ認証（固定ユーザー + JWT）とスタッフの状態 | `staff` テーブルを作り、`STAFF_KEY` の middleware を JWT の検証に置き換える。WebSocket の auth も JWT にする |
| 注文オプション（大盛り、辛さ） | `menu_options` テーブルと `order_items.options`（JSON）を足し、単価に加算する |
| 調理担当と配膳担当で画面を分ける | 状態に「調理完了」を足し、キッチン画面と配膳画面に分ける |
| QR 画像の生成 | ライブラリを入れて（ライセンスを確認する）、`SeatUrlList` に QR を表示する |
| 来店の乗っ取り対策 | スタッフが来店を開始する方式、または来店ごとの PIN |
