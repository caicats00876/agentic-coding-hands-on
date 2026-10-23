# frontend 設計

- 関連: [システム設計](../../../docs/design/system-design.md)（全体の決まり、決定事項、セキュリティ）、[shared 設計](../../shared/docs/design.md)（スキーマ、REST API、WebSocket メッセージ）、[backend 設計](../../backend/docs/design.md)
- 実装タスク: [実装計画](../../../docs/plans/plan_mvp_20261023062925.md) の F1〜F9

API とメッセージの形は [shared 設計](../../shared/docs/design.md) に従う。この文書には、画面と、クライアントの仕組みだけを書く。

## 1. ディレクトリ構成

```
packages/frontend/src/
  App.tsx                  pathname で CustomerPage / KitchenPage / NotFound に分ける
  api/client.ts            fetch のラッパー。応答を shared のスキーマで検証する
  ws/reconnectingSocket.ts 再接続付きの WebSocket（WebSocket の生成とタイマーを注入できる）
  state/cart.ts            カートの reducer（純粋関数）
  state/orders.ts          注文一覧の reducer。WebSocket のイベントを反映する（純粋関数）
  customer/  CustomerPage.tsx MenuList.tsx Cart.tsx OrderProgress.tsx SessionSummary.tsx SessionEnded.tsx
  kitchen/   KitchenPage.tsx StaffKeyForm.tsx OrderBoard.tsx OrderCard.tsx SessionList.tsx SeatUrlList.tsx
```

## 2. 画面の切り替えと配信

| パス | 画面 | 使う人 |
|---|---|---|
| `/s/:seatToken` | 客の画面 | 客（QR の URL） |
| `/kitchen` | キッチン画面 | スタッフ |
| それ以外 | NotFound | - |

- ルーターのライブラリは使わず、`location.pathname` で分ける。テストのため、`App` は pathname を props で受け取れるようにする
- `vite.config.ts` の `server.proxy` と `preview.proxy` で、`/api` と `/ws`（`ws: true`）を backend に送る

## 3. クライアントの仕組み

### API クライアント（`api/client.ts`）

- 応答は shared のスキーマで検証する。合わなければ例外にする
- エラー応答は `code` を持つ `ApiError` にする
- 客の画面では `X-Session-Token`、キッチン画面では `X-Staff-Key` を付ける

### 再接続付きの WebSocket（`ws/reconnectingSocket.ts`）

- つながったら、最初に `auth` を送る
- 切れたら 1 秒、2 秒、4 秒…と間隔を延ばして再接続する（最大 30 秒）。つながったら間隔を 1 秒に戻す
- 再接続したら `onReconnect` を呼び、REST で一覧を取り直して、切れていた間の変更を補う
- 再接続するかどうかは、shared 設計の close code の表に従う（`4001` では再接続しない）
- `ServerMessageSchema` に合わないメッセージは捨てる

### 状態（`state/`）

- `cart.ts`: 追加、数量の変更（1〜10 に収める）、削除、合計
- `orders.ts`: `order.created` で足し、`order.updated` で同じ `id` を置き換え、`gift.received` で gifts に足す

## 4. 客の画面

| 部品 | 表示 |
|---|---|
| `MenuList` | カテゴリごとに分けて表示する。売切れの品には「売切れ」を表示し、追加ボタンを disabled にする |
| `Cart` | 品目、数量、合計。「注文する」で `POST /api/session/orders` を呼ぶ |
| `OrderProgress` | 注文ごとに 受付 / 調理中 / 提供済 の 3 段階を出し、今の段階を強調する。提供済になったら、自分の席に届いたときは「お待たせしました」、他の席に届いたとき（`delivery.isGacha`）は「残念…他の席に届きました」を表示する。received のときだけキャンセルボタンを出す |
| おすそ分け | `gifts` に「おすそ分けが届きました」を表示する |
| `SessionSummary` | 席の番号と合計（shared の `sessionTotal`） |
| `SessionEnded` | 410 か `session.closed` を受けたら「ご来店ありがとうございました」に切り替え、注文の操作を出さない |

- 画面を開いたら `POST /api/seats/:seatToken/session` で来店に入り、`sessionToken` を localStorage に置く

## 5. キッチン画面

| 部品 | 表示 |
|---|---|
| `StaffKeyForm` | 入力したキーを sessionStorage に置く。401 を受けたら消して、入力画面に戻す |
| `OrderBoard` / `OrderCard` | received と cooking の列に分け、古い順に並べる。カードには席の番号、品目、数量、経過時間、次へ進めるボタン（「調理開始」「提供済にする」）を出す。served か cancelled になったら列から外す |
| ガチャの表示 | 提供済にしたとき別の席に届いたら、「→ 席 X へお届け」を表示する |
| `SessionList` | 席、合計、未完了の数。未完了が 1 以上なら「会計済」ボタンを disabled にする |
| `SeatUrlList` | 席ごとの URL（`location.origin + /s/ + token`）を、新しいタブで開くリンク（`target="_blank" rel="noopener noreferrer"`）にする（研修での使い方は [システム設計](../../../docs/design/system-design.md) の決定事項「研修での確認」） |

## 6. テスト

- ユニットテストは、雛形と同じく `renderToString` と純粋関数で書く。クリックなどの操作は E2E で確かめる
- E2E（Playwright、Chromium のみ）は、ユニットテストがすべて通ってからの最終チェックにする。保護を外さずにテストする方法とシナリオは、[実装計画](../../../docs/plans/plan_mvp_20261023062925.md) の F9 にある
