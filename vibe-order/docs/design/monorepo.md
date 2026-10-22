# Design Doc: vibe-order モノレポ雛形

- Status: Draft（実装前）
- 最終更新: 2026-10-21
- 関連: [ADR 0001](../adr/0001-monorepo-scaffold.md)、[実装計画](../plans/plan_monorepo_20261021062319.md)

## Context and Scope

vibe-order の開発基盤として、npm workspaces のモノレポ雛形を作る。
Day2 で起きた問題（品質のばらつき、秘密情報の混入、テストなし）を、ツールで機械的に防ぐことが目的である。
範囲は次のとおり。

- `vibe-order/` 配下の 3 パッケージ（shared / backend / frontend）
- ルートの設定ファイルと npm scripts
- コミット前フック
- リポジトリルートの GitHub Actions ワークフロー

注文機能などのアプリ実装は範囲外とする。

## Goals and Non-Goals

### Goals

- `vibe-order/` で次の 3 コマンドが全パッケージに対して成功する
  - `npm run check`（Format / Lint）
  - `npm run test`
  - `npm run build`
- 各パッケージに最小のサンプルコードとテストが 1 つずつあり、カバレッジが 80% 以上ある
- コミット前に gitleaks、Biome、テストが実行され、どれかが失敗するとコミットできない
- push と pull request で CI が check / test / build と gitleaks による履歴全体のスキャンを実行し、成功する
- 追加するライブラリはすべて MIT / Apache-2.0 / BSD で、`npm audit` で脆弱性が 0 件

### Non-Goals

- 注文機能などのアプリ実装、DB、API クライアントの共通化
- CI での E2E 実行（E2E はローカルでの最終チェックとする）
- ブランチ保護の設定（ハンズオン手順でユーザーが行う）
- デプロイ

## Design

### ディレクトリ構成

```
.github/workflows/vibe-order-ci.yml
.devcontainer/devcontainer.json      postCreateCommand から install-gitleaks.sh を呼ぶ
.devcontainer/install-gitleaks.sh    devcontainer と CI で共用する
vibe-order/
├── package.json  biome.json  tsconfig.base.json  vitest.config.ts  .gitignore
├── .husky/pre-commit
├── docs/ (memo.md, ref/, plans/, adr/, design/)
└── packages/
    ├── shared/    Zod スキーマと型 → tsc で dist/ に出力
    ├── backend/   Hono + @hono/node-server（:3000）
    └── frontend/  React + Vite + Tailwind v4（:5173）、Playwright
```

### パッケージ間の依存

```
shared ──▶ backend
   └─────▶ frontend
```

- shared は `exports` で `dist/index.js` と `dist/index.d.ts` を公開する
- backend と frontend は `@vibe-order/shared` として import する
- `workspaces` の配列は shared → backend → frontend の順にする。これで `npm run build --workspaces` が依存順に実行される

### サンプルの内容

| パッケージ | コード | テスト |
|---|---|---|
| shared | `HealthResponseSchema = z.object({ status: z.literal('ok') })` とその型 | 正しい値が通り、誤った値が弾かれる |
| backend | `GET /health` が `{ status: 'ok' }` を返す（`app.ts` と起動処理の `index.ts` を分ける） | `app.request('/health')` の結果が 200 で、本文がスキーマに合う |
| frontend | Tailwind のクラスを使った `App` コンポーネント | `renderToString(<App />)` の出力に見出しが含まれる。E2E では見出しが表示される |

### npm scripts（ルート）

| script | 内容 |
|---|---|
| `check` | `biome check .` |
| `check:fix` | `biome check --write .` |
| `test` | shared をビルドしてから `vitest --run` |
| `coverage` | shared をビルドしてから `vitest --run --coverage` |
| `build` | `npm run build --workspaces` |
| `test:e2e` | frontend の Playwright を実行 |
| `prepare` | `cd .. && husky vibe-order/.husky` |

### TypeScript

- 共通設定は `tsconfig.base.json` に置き、strict を有効にする
- backend の tsconfig には次を追加する
  - `module: nodenext`
  - `erasableSyntaxOnly`
  - `rewriteRelativeImportExtensions`
- この設定で、開発時は `node --watch src/index.ts` で直接実行し、本番用は `tsc` で `.js` に変換する

### テストとカバレッジ

- ルートの `vitest.config.ts` で `projects: ['packages/*']` を指定する。frontend では `e2e/` をテスト対象から外す
- カバレッジは v8 で取得し、閾値はすべて 80% とする。起動処理だけのファイル（`backend/src/index.ts`、`frontend/src/main.tsx`）は対象外にし、memo.md に記録する
- E2E は Playwright（Chromium のみ）で書く。`webServer` で `vite preview` を起動し、`npm run test` には含めない

### コミット前フック

1. `gitleaks` が無ければメッセージを出して失敗させる
2. `gitleaks git --pre-commit --staged --redact`
3. `npx lint-staged` で、stage したファイルに `biome check --write --no-errors-on-unmatched` を実行する
4. `npm run test`

### CI（`.github/workflows/vibe-order-ci.yml`）

- トリガーは `push` と `pull_request`。権限は `permissions: contents: read`
- `defaults.run.working-directory: vibe-order`。`HUSKY: 0` で CI ではフックを無効にする
- setup-node は Node 24 を使い、npm のキャッシュ（`vibe-order/package-lock.json`）を有効にする
- job は 2 つ
  - `check-test-build`: `npm ci` → `check` → `test` → `build`
  - `gitleaks`
    - `fetch-depth: 0` で履歴全体を取得する
    - `install-gitleaks.sh` でインストールし、`gitleaks git --redact --verbose` を実行する
    - リポジトリ全体が対象なので、この job だけは working-directory をリポジトリルートにする

### gitleaks のインストール（`.devcontainer/install-gitleaks.sh`）

1. 版を固定する（`GITLEAKS_VERSION`）
2. `uname -m` で x64 か arm64 かを判定する
3. 公式リリースから tar.gz と checksums.txt を取得する
4. `sha256sum -c` で検証し、失敗したら終了する
5. `/usr/local/bin` に配置する

devcontainer では、`postCreateCommand` をオブジェクト形式にして、既存の Claude 設定の処理と並べて呼び出す。

## Alternatives Considered

| 候補 | 採用しなかった理由 |
|---|---|
| パッケージごとに Biome と Vitest の設定を置く | 設定が重複する。ルートの 1 か所にまとめたほうがシンプルで、カバレッジも 1 つのレポートにまとまる |
| backend の開発実行に `tsx` を使う | Node 24 の型除去機能で代わりになるので、依存を増やさない |
| shared を TS ソースのまま公開する（ビルドしない） | backend の `tsc` の rootDir やシンボリックリンクの解決が複雑になる。dist で公開する方法が素直 |
| frontend のテストに Testing Library と jsdom を使う | 雛形の段階では `renderToString` で十分。操作を伴うテストが必要になったら再検討する |
| `npm run test` に E2E を含める | CLAUDE.md の「E2E は最終チェック」に反し、実行も遅くなる |
| gitleaks が無いときはフックでスキップする | 黙って検査が抜けるので、安全性が下がる |
| CI に `gitleaks/gitleaks-action` を使う | 組織アカウントではライセンスキーが必要になる。バイナリを直接実行すれば、devcontainer と同じスクリプトと版を使える |
| CI では push された差分だけをスキャンする | `before..sha` の範囲指定は、初回の push や force push で扱いが複雑になる。履歴は小さいので全体をスキャンする |
| gitleaks を pre-commit だけで実行する | `--no-verify` で回避できてしまう |
| Turborepo / Nx / pnpm を使う | 3 パッケージなら npm workspaces で足りる（KISS、依存最小化） |
