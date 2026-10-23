# shared 設計: スキーマ、REST API、WebSocket メッセージ

- 関連: [システム設計](../../../docs/design/system-design.md)（全体の決まり）、[backend 設計](../../backend/docs/design.md)、[frontend 設計](../../frontend/docs/design.md)
- 実装タスク: [実装計画](../../../docs/plans/plan_mvp_20261023062925.md) の S1〜S4

backend と frontend の間の契約を、この文書と `packages/shared/src/` にだけ書く。
スキーマ、API、WebSocket メッセージの形を変えるときは、先にこの文書を直す。

## 1. ファイル構成

```
packages/shared/src/
  errors.ts      エラー応答
  menu.ts        メニュー
  order.ts       注文と状態
  orderRules.ts  状態遷移と合計金額（純粋関数）
  session.ts     来店、席
  ws.ts          WebSocket メッセージ
  index.ts       すべてを export する
```

## 2. 値の表し方

- 金額は円の整数
- 時刻は ISO 8601 の UTC 文字列
- 注文の状態: `received`（受付）、`cooking`（調理中）、`served`（提供済）、`cancelled`（キャンセル済）

## 3. スキーマ

| ファイル | 中身 |
|---|---|
| `errors.ts` | `ErrorResponseSchema = { error: { code, message } }`。`code` は `VALIDATION_ERROR` / `UNAUTHORIZED` / `NOT_FOUND` / `SESSION_ENDED` / `MENU_SOLD_OUT` / `INVALID_TRANSITION` / `UNFINISHED_ORDERS` |
| `menu.ts` | `MenuItemSchema { id, name, price, description, category, soldOut }` |
| `order.ts` | `OrderStatusSchema`、`OrderItemInputSchema { menuId: int>0, quantity: int 1..10 }`、`CreateOrderRequestSchema { items: 1..20 件、menuId の重複なし }`、`OrderItemSchema { menuId, name, unitPrice, quantity }`、`OrderSchema { id, sessionId, seatLabel, status, items, total, delivery: null \| { seatLabel, isGacha }, createdAt, updatedAt }`、`UpdateOrderStatusRequestSchema { status: 'cooking' \| 'served' }` |
| `session.ts` | `JoinSessionResponseSchema { sessionToken, seatLabel }`、`CustomerSessionSchema { seatLabel, startedAt, total, orders: Order[], gifts: Order[] }`、`StaffSessionSchema { id, seatLabel, startedAt, total, unfinishedCount }`、`SeatSchema { label, token }` |
| `ws.ts` | `ClientMessageSchema`、`ServerMessageSchema`（`type` で判別する discriminatedUnion。6 章を参照） |

- `Order.delivery` は提供済になるまで `null`。提供済になったら届け先を `{ seatLabel, isGacha }` で表す。自分の席に届いたら `isGacha` は false
- 届いた側の `gifts` では、注文した席の番号を出さない（`seatLabel` は空にする）

## 4. 業務ルール（`orderRules.ts`）

```
received ──▶ cooking ──▶ served
    │
    └──▶ cancelled（客の操作。received のときだけ）
```

| 関数 | 決まり |
|---|---|
| `canTransition(from, to)` | received→cooking と cooking→served だけが true |
| `nextStatus(status)` | received→cooking、cooking→served。それ以外は null |
| `canCancel(status)` | received のときだけ true |
| `orderTotal(items)` | Σ unitPrice × quantity |
| `sessionTotal(orders)` | cancelled 以外の注文の total の合計。ガチャで他の席に届いた注文も含める |

## 5. REST API

### 共通

- 入力（path、query、body）は、この文書のスキーマで検証する。失敗したら `400 VALIDATION_ERROR`
- エラーの本文は `ErrorResponseSchema` の形にする
- 客の認証: ヘッダー `X-Session-Token`。知らないトークンなら `401 UNAUTHORIZED`、終わったセッションなら `410 SESSION_ENDED`
- スタッフの認証: ヘッダー `X-Staff-Key`。違えば `401 UNAUTHORIZED`
- 他のセッションの注文は「存在しない」として `404 NOT_FOUND` を返す（存在するかどうかを漏らさない）

### 客向け

| メソッド / パス | 認証 | 入力 | 成功 | 主なエラー |
|---|---|---|---|---|
| `GET /api/menu` | なし | - | 200 `MenuItem[]`（並び順はメニューの表示順） | - |
| `POST /api/seats/:seatToken/session` | 席トークン | - | 利用中のセッションに入ったら 200、新しく作ったら 201。本文は `JoinSessionResponse` | 404 席が無い |
| `GET /api/session` | Session | - | 200 `CustomerSession` | 401 / 410 |
| `POST /api/session/orders` | Session | `CreateOrderRequest` | 201 `Order`（status = received） | 400、404 メニューが無い、409 `MENU_SOLD_OUT`（注文は 1 件も作らない）、410 |
| `POST /api/session/orders/:orderId/cancel` | Session | - | 200 `Order`（cancelled） | 404、409 `INVALID_TRANSITION`（received 以外）、410 |

### スタッフ向け（すべて `X-Staff-Key` が必要）

| メソッド / パス | 入力 | 成功 | 主なエラー |
|---|---|---|---|
| `GET /api/staff/orders` | query `status`（カンマ区切り、既定 `received,cooking`） | 200 `Order[]`（古い順） | 400 |
| `PATCH /api/staff/orders/:orderId/status` | `UpdateOrderStatusRequest` | 200 `Order`。`served` にしたとき `delivery` が決まる | 404、409 `INVALID_TRANSITION` |
| `GET /api/staff/sessions` | - | 200 `StaffSession[]`（利用中のみ、席の番号順） | - |
| `POST /api/staff/sessions/:sessionId/close` | - | 200 `StaffSession`（会計済） | 404、409 `UNFINISHED_ORDERS`（received / cooking が残っている） |
| `GET /api/staff/seats` | - | 200 `Seat[]`（席の番号順） | - |

## 6. WebSocket メッセージ（`GET /ws`、パスは 1 本）

ブラウザの WebSocket はヘッダーを付けられず、URL のトークンはログに残りやすい。そのため**接続後の最初のメッセージで認証**する。

### クライアント → サーバー（`ClientMessageSchema`）

| type | 中身 | 意味 |
|---|---|---|
| `auth` | `{ role: 'customer', sessionToken }` または `{ role: 'staff', staffKey }` | 認証。成功したら、スタッフは全体のイベントを、客は自分の来店のイベントを受け取る |

### サーバー → クライアント（`ServerMessageSchema`）

| type | 宛先 | 中身 | 発生するとき |
|---|---|---|---|
| `auth.ok` | 本人 | `{ role }` | 認証に成功した |
| `order.created` | スタッフ | `{ order }` | 客が注文した |
| `order.updated` | スタッフ、注文した来店 | `{ order }` | 状態の変更（キャンセルを含む） |
| `gift.received` | 届いた先の来店 | `{ order }` | ガチャで別の席に届いた |
| `session.started` | スタッフ | `{ session: StaffSession }` | 新しい来店 |
| `session.closed` | スタッフ、その来店 | `{ sessionId }` | 会計済 |

### 接続の決まり

| close code | 意味 | クライアントの再接続 |
|---|---|---|
| `4000` | 5 秒以内に `auth` が来なかった | する |
| `4001` | 認証に失敗した（会計済の来店を含む） | しない |
| `4002` | 形式が不正なメッセージを受けた | する |

- 会計済になったら、サーバーはその来店の接続に `session.closed` を送ってから切る
- イベントには注文の全体（`Order`）を載せる。クライアントは同じ `id` の注文を置き換えればよい
