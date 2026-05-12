## 開発スタイル

- 既存コードベースの尊重
    - 重複実装の禁止。実装前に既存コードをチェックし、重複がないかを確認
- ライブラリ導入
    - 標準ライブラリや既存ライブラリで実装できるものは、原則導入しない
    - 新規にライブラリを導入する場合、ライセンスはMIT、Apache2.0、BSDのみとする。
- コード変更は関係がある箇所のみ。
    - リファクタリングが必要な箇所については、実装は行わず指摘のみに留める。
- Git Commitは明示的な依頼がある場合のみ
- Debugは1観点ごとに実施する。他の観点を試す前に必ず正確に元の状態に戻す。

## E2Eテスト

- すべてのFrontend/Backendコードの作成・改修・削除時に、主要なユーザーフローをPlaywrightでE2E検証する。
- E2Eはすべてのunit testが完了した後の最終チェックとする。
- E2Eテスト実行前に以下を順に実施する
    - `/doc`のOpenAPI JSONを生成
    - openapi-typescriptで型を更新
    - openapi-fetchクライアントの再生成

- サーバー・フロントを起動して`npx playwright test`を実行
- テストデータは毎回リセット可能にし、他テストと状態を共有しない。
- 失敗時はスクリーンショット・動画を自動保存。
- CIではplaywright test --reporter=list,htmlを必須とする。

## フロントエンド/バックエンド連携

サーバーとクライアントが別チームでも、スキーマ共有と型安全性を確保しながらの開発を目的とし、フロントエンドとバックエンドは以下の方式で連携する。

1. `@hono/zod-openapi`からImportしたZodを使って、バリデーション付きスキーマを定義する。
2. `@hono/zod-openapi`を使って以下のステップでルータを作成する。
    - `createRoute()`でルーティング情報を定義する。
    - `RouteHandler()`でハンドラを定義する。
    - `OpenAPIHono()`でルーティング情報とハンドラを紐づける。
3. エントリポイントとして以下を設定する。
   - 2.で作成したルータをエントリポイントにマウントする。
   - `/doc`でOpenAPIのJSONをホスティングする。
   - `@hono/swagger-ui`ミドルウェアで`/ui`に Swagger UIをホスティングする。
4. バックエンドを起動し、次のコマンドでクライアント型を生成する。
   - npx openapi-typescript https://localhost:3000/doc -o .shared/client/src/generated/types.ts
5. 生成した型情報を利用して`openapi-fetch`でAPIクライアントを`shared/client/src/`に作成する。
