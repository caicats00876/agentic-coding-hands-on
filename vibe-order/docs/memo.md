# 変更メモ

CLAUDE.md の Policy に従い、コメントアウト、処理の削除、ライブラリの変更を記録する。

## 2026-10-21 モノレポ雛形で導入するライブラリ（Iteration 0 で確認）

確認方法:

- 版とライセンス: `npm view <pkg> version license`
- 公開日: `npm view <pkg> time --json`
- gitleaks: `gh release view -R gitleaks/gitleaks`

採用版の決め方（**2026-10-21 合意**）:

- 公開から 7 日以上たった版の中で最新のものを、`^` を付けずに固定する
- 公開直後の版は、サプライチェーン攻撃（乗っ取られたパッケージの公開など）が見つかる前に取り込んでしまうおそれがあるため
- 確認日時は 2026-10-21 06:2x UTC。7 日前の基準は 2026-10-14 06:2x UTC

| パッケージ | 置き場所 | npm の latest（公開日） | 採用予定の版 | ライセンス | 用途 |
|---|---|---|---|---|---|
| typescript | root | 7.0.2（07-08） | 7.0.2 | Apache-2.0 | 型チェックとビルド |
| @biomejs/biome | root | 2.5.15（09-30） | 2.5.15 | MIT OR Apache-2.0 | Formatter / Linter |
| vitest | root | 5.0.5（10-15） | **5.0.4**（10-12） | MIT | テスト |
| @vitest/coverage-v8 | root | 5.0.5（10-15） | **5.0.4**（10-12） | MIT | カバレッジ |
| husky | root | 9.1.7（2024-11-18） | 9.1.7 | MIT | Git フック |
| lint-staged | root | 17.6.0（09-26） | 17.6.0 | MIT | stage したファイルだけ Lint する |
| @types/node | root | 26.6.5（10-09） | **24.19.2**（10-09） | MIT | Node の型（実行環境の Node 24 に合わせて 24 系にした） |
| zod | shared | 4.6.7（10-12） | 4.6.7 | MIT | スキーマと型 |
| hono | backend | 4.13.13（10-04） | 4.13.13 | MIT | Web フレームワーク |
| @hono/node-server | backend | 2.1.5（10-13） | 2.1.5 | MIT | Hono を Node.js で動かす |
| react | frontend | 19.3.1（10-14 16:47） | **19.3.0**（09-09） | MIT | UI |
| react-dom | frontend | 19.3.1（10-14 16:49） | **19.3.0**（09-09） | MIT | UI |
| @types/react | frontend | 19.3.0（09-09） | 19.3.0 | MIT | 型 |
| @types/react-dom | frontend | 19.3.0（09-09） | 19.3.0 | MIT | 型 |
| vite | frontend | 8.3.5（**10-21 当日**） | **8.3.4**（10-08） | MIT | ビルドと開発サーバー |
| @vitejs/plugin-react | frontend | 6.1.2（10-05） | 6.1.2 | MIT | Vite の React 対応 |
| tailwindcss | frontend | 4.3.3（07-16） | 4.3.3 | MIT | CSS |
| @tailwindcss/vite | frontend | 4.3.3（07-16） | 4.3.3 | MIT | Vite の Tailwind 対応 |
| @playwright/test | frontend | 1.64.1（10-14 11:58） | **1.64.0**（10-07） | Apache-2.0 | E2E |
| gitleaks（バイナリ） | Codespaces、CI | v8.30.1（2026-03-21） | 8.30.1 | MIT | 秘密情報の検出（linux_x64 / linux_arm64 / checksums.txt あり） |

- 太字は、latest が公開から 7 日未満だったため一つ前の版にしたもの
- 公開日の年は、書いていなければ 2026 年
- 互換性: peerDependencies を確認した。vitest 5 は vite 6〜8 と @types/node 24 以上、@vitejs/plugin-react 6 は vite 8、@tailwindcss/vite は vite 5〜8、@hono/node-server 2 は hono 4 を要求しており、いずれも上の採用予定の版で満たせる
- 注意: TypeScript 7、Vitest 5、Vite 8、@hono/node-server 2 は、計画を立てた時点の想定より新しいメジャー版。設定の書き方は推測せず、`docs/ref/` の llms.txt や公式ドキュメントで確かめてから書く

## 2026-10-21 docs/ref/ に llms.txt を配置

各ライブラリの公式ドメインで `https://<domain>/llms.txt` を取得した。

| ファイル | 取得元 |
|---|---|
| hono.llms.txt | https://hono.dev/llms.txt |
| zod.llms.txt | https://zod.dev/llms.txt |
| vitest.llms.txt | https://vitest.dev/llms.txt |
| vite.llms.txt | https://vite.dev/llms.txt |
| react.llms.txt | https://react.dev/llms.txt |

- biomejs.dev、tailwindcss.com、playwright.dev、typicode.github.io/husky、www.typescriptlang.org は 404 だった。これらは公式ドキュメントを直接参照する
- llms.txt は目次で、中身は各ページ（.md）へのリンクになっている。詳しい内容が必要になったら、リンク先のページを取得する
