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

## 2026-10-22 frontend のライブラリを追加（Iteration 4）

Iteration 0 で決めた採用版を、`--save-exact` で `packages/frontend` に追加した。

- dependencies: react 19.3.0、react-dom 19.3.0
- devDependencies: @types/react 19.3.0、@types/react-dom 19.3.0、vite 8.3.4、@vitejs/plugin-react 6.1.2、tailwindcss 4.3.3、@tailwindcss/vite 4.3.3
- 追加後の `npm audit` は脆弱性 0 件

## 2026-10-22 E2E 用のライブラリを追加（Iteration 5）

- devDependencies（frontend）: @playwright/test 1.64.0（Apache-2.0、Iteration 0 で決めた採用版）
- ブラウザは `npx playwright install --with-deps chromium` で Chromium だけを入れた（OS のパッケージも apt で入る）
- Vitest の既定の include（`**/*.{test,spec}.?(c|m)[jt]s?(x)`）が `e2e/*.spec.ts` も拾うため、frontend の `vite.config.ts` で `e2e/**` を除外した

## 2026-10-23 カバレッジを設定（Iteration 6）

- devDependencies（root）: @vitest/coverage-v8 5.0.4（MIT、Iteration 0 で決めた採用版）。追加後の `npm audit` は脆弱性 0 件
- 設定はルートの `vitest.config.ts` に書いた。projects 構成では `coverage` はルートの設定だけが効く（https://vitest.dev/guide/projects.md 「`coverage`: coverage is done for the whole process」）
- `coverage.include` を `packages/*/src/**/*.{ts,tsx}` にした。既定ではテストで import されたファイルしか集計されず、テストの無いファイルが見えないため
- 閾値: lines / functions / branches / statements すべて 80%
- 対象から外したファイル（起動処理だけで、ユニットテストの対象にしない）
  - `packages/backend/src/index.ts`（`serve()` でポート 3000 を開くだけ。動作は `curl localhost:3000/health` で確認済み）
  - `packages/frontend/src/main.tsx`（`createRoot` で描画するだけ。動作は E2E で確認する）
- テストファイル（`*.test.{ts,tsx}`）も対象外にした

## 2026-10-23 コミット前フックと gitleaks を設定（Iteration 7）

- devDependencies（root）: husky 9.1.7（MIT）、lint-staged 17.6.0（MIT）。Iteration 0 で決めた採用版。追加後の `npm audit` は脆弱性 0 件
- gitleaks 8.30.1（MIT、Go 製の単体バイナリ）を `.devcontainer/install-gitleaks.sh` で導入する。版はこのスクリプトだけで管理し、公式の checksums.txt で sha256 を検証してから `/usr/local/bin` に置く
- `.devcontainer/devcontainer.json` の `postCreateCommand` をオブジェクト形式に変え、既存の Claude 設定の処理（`claude`）を残したまま `gitleaks` を追加した
- Husky はサブディレクトリ構成のため `prepare` を `cd .. && husky vibe-order/.husky` にした（https://typicode.github.io/husky/how-to.html 「Project not in Git root directory」）
- `.husky/pre-commit` の処理順と、計画からの変更点
  - gitleaks は `cd vibe-order` の**前**に、リポジトリのルートで実行する（計画では cd の後だった）。`vibe-order/` の外に stage されたファイルも検査するため
  - 先頭に `set -e` を入れた。Husky は `sh -e` で実行するが、`sh vibe-order/.husky/pre-commit` で直接実行したときに、gitleaks が検出してもテストまで進んで exit 0 になったため
- lint-staged の Biome には `--files-ignore-unknown=true` を付けた。Biome が扱えない種類のファイル（.md など）を stage したときにエラーにしないため

## 2026-10-23 GitHub Actions CI を追加（Iteration 8）

- `.github/workflows/vibe-order-ci.yml`（リポジトリのルート）を追加した
- 使う action: `actions/checkout@v7`（最新 v7.0.1、2026-07-20）、`actions/setup-node@v7`（最新 v7.1.0、2026-10-08）。`gh release view` で確認した実装時点の最新メジャー版
- job `check-test-build`: `npm ci` → `npm run check` → `npm run test` → `npm run build`（`working-directory: vibe-order`、`HUSKY: 0`）
- job `gitleaks`: `fetch-depth: 0` で履歴全体を取得し、`.devcontainer/install-gitleaks.sh` で入れた gitleaks で `gitleaks git --redact --verbose` を実行する。`gitleaks-action` は使わない
- 計画に加えたもの: `actions/checkout` に `persist-credentials: false` を付けた。checkout 後に git の認証情報を残す必要がないため
