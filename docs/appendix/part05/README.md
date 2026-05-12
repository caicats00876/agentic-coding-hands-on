# PART5: Agentic Coding – 開発基盤構築

`PART5: Agentic Coding – 開発基盤構築` の Cline Rules / Workflows / ignore 設定と環境構築用プロンプト。

## Prompts

- [prompts/monorepo-bootstrap.prompt.txt](prompts/monorepo-bootstrap.prompt.txt): npm workspaces の雛形構築プロンプト
- [prompts/monorepo-security-hardening.prompt.txt](prompts/monorepo-security-hardening.prompt.txt): モノレポ環境のセキュリティ強化プロンプト

## Commands

- [commands/relogin.sh](commands/relogin.sh): AWS SSO 再ログイン用スクリプト

## Examples

- [examples/bedrock-iam-policy.json](examples/bedrock-iam-policy.json): Amazon Bedrock 利用に絞った IAM ポリシー例

## Templates

- [templates/.clineignore](templates/.clineignore): Cline の除外設定
- [templates/.clinerules/common.md](templates/.clinerules/common.md): 共通 Cline Rule
- [templates/.clinerules/workflows/save-implementation-plan.md](templates/.clinerules/workflows/save-implementation-plan.md): 実装計画保存 Workflow
- [templates/.clinerules/workflows/selfcheck.md](templates/.clinerules/workflows/selfcheck.md): セルフチェック Workflow
