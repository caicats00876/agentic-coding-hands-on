# 1. npm workspaces によるモノレポ雛形の構成

## Status

Accepted（2026-10-21）

起票した時点では gitleaks の扱いが 2 点未決だった。実装前の同じ日に合意したので、この ADR に直接反映した（Decision の 9 を参照）。

## Context

- Day2 の Vibe Coding では、品質のばらつき、秘密情報の混入、テストがないといった問題が起きた。ルールを書くだけでなく、仕組みで防ぐ必要がある
- vibe-order は frontend と backend で同じスキーマと型を使う。そのため 1 つのリポジトリで共有したい
- プロジェクトルール（CLAUDE.md）の制約
  - KISS
  - 依存は最小限にし、標準機能で代替できるならそれを使う
  - ライセンスは MIT / Apache-2.0 / BSD に限る
  - カバレッジは 80% 以上
  - E2E はユニットテストがすべて成功した後の最終チェックとする
- 実行環境は GitHub Codespaces（Node.js 24）
- git のルートはリポジトリルートで、`vibe-order/` はそのサブディレクトリにある

## Decision

1. **npm workspaces** で `packages/shared`、`packages/backend`、`packages/frontend` を管理する。`workspaces` にはこの順番で明記し、ビルド順を固定する
2. **shared** は Zod でスキーマと型を定義し、`tsc` で `dist/` に出力する。`exports` で公開する。ルートの `test` は shared をビルドしてから実行する
3. **Biome** の設定はルートに 1 つだけ置き、`biome check .` で全パッケージをチェックする
4. **Vitest** はルートの `vitest.config.ts` で `test.projects: ['packages/*']` を指定する
   - カバレッジは v8 で取得する
   - 閾値は lines / functions / branches / statements すべて 80%
5. **backend** は Hono と `@hono/node-server` で作る。開発時は `tsx` を使わず、Node 24 の型除去機能で `.ts` を直接実行する
6. **frontend** は React、Vite、Tailwind CSS v4（`@tailwindcss/vite`）で作る
   - ユニットテストは `react-dom/server` の `renderToString` で書き、Testing Library と jsdom は導入しない
   - E2E は Playwright で書き、`npm run test:e2e` に分ける
7. **コミット前フック**は Husky v9 で設定する（`prepare: "cd .. && husky vibe-order/.husky"`）。処理の順番は次のとおり
   1. gitleaks が無ければコミットを失敗させる
   2. `gitleaks git --pre-commit --staged`
   3. lint-staged（Biome）
   4. `npm run test`
8. **CI** は GitHub Actions で実行する
   - ワークフローはリポジトリルートの `.github/workflows/` に置き、`working-directory: vibe-order` とする
   - push と pull_request で check / test / build を実行する
   - `permissions: contents: read` とする
9. **gitleaks の導入と CI での実行**
   - インストールは `.devcontainer/install-gitleaks.sh` に一本化する
     - 版を固定し、公式の checksums.txt で SHA-256 を検証する
     - devcontainer の `postCreateCommand` と CI の両方から呼び出す
   - CI では `gitleaks-action` を使わない。バイナリを直接実行し、`fetch-depth: 0` で取得したリポジトリの履歴全体をスキャンする

## Consequences

- 良い点
  - `npm run check` / `test` / `build` の 3 つのコマンドで全パッケージを検証できる。CI、フック、ローカルで同じコマンドを使う
  - Biome、Vitest、TypeScript の設定がそれぞれ 1 か所にまとまる
  - 依存が少ないので、ライセンスの確認と `npm audit` の対応が楽になる
  - 秘密情報や Lint エラーのあるコードが、コミットの時点で止まる
- 悪い点・注意点
  - shared を変更したら、ビルドしないと backend と frontend に反映されない
  - Node の型除去機能を使うため、backend では enum など型除去できない構文を使えない（`erasableSyntaxOnly`）。import には `.ts` 拡張子が必要になる
  - `renderToString` では操作（クリックなど）を伴うテストは書けない。必要になったら Testing Library の導入を検討する
  - gitleaks は npm 外のバイナリなので、版を上げるときは `install-gitleaks.sh` の版の指定を手で更新する必要がある
  - pre-commit は `--no-verify` で回避できるが、その場合も CI で検出される
  - 既存の Codespace では、Rebuild するかスクリプトを手動で実行するまで gitleaks が入らない
  - 履歴全体をスキャンするので、過去のコミットに秘密情報があれば CI が失敗し続ける。その場合は鍵の無効化と履歴の扱いを別途判断する
