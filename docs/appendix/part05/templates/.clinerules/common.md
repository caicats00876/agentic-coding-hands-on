## Policy

- セキュリティを最優先とし、低下の恐れがあれば作業を止め合意を得る
- KISS原則に従う
- 各タスクの分割単位は最長30分
- 以下の変更時は必ず`doc/memo`に記録
  - コメントアウト
  - 処理削除
  - ライブラリ変更
- 依存パッケージは極力増やさず、追加時は標準機能で代替可能かを検討

## Doc

- `implementation_plan.md`を用いて実装した場合、以下を行う。
  - ファイルの内容と実装を比較し、差分があれば`implementation_plan.md`を最新化する。
  - コマンド`/save-implementation-plan.md`での事後作業を推奨する。

## Tips

- 実行コマンドはCI/CD用を使用
- CLIはPagerを使わない

## Test

- Kent Beck準拠のTDDを順守
  - 処理変更の度に`npm run test`を実行し、常に成功させる
  - Formatter/Linterも常に通す

## Taskの完了条件
- 常にデグレードがないことを確認する
- Format/Lint/Testが一貫して成功している
- テストカバレッジは80%以上を必達、100%を目指す
  - カバレッジ取得コマンド: `npx vitest --run --coverage`
