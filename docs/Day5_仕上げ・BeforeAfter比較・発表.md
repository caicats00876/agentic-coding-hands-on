# Day5 仕上げ、Before/After 比較、発表

Vibe Order を仕上げ、E2E テストと CI で守られた状態にします。
そのうえで、Day2 と同じ種類の変更依頼を Vibe Order に行い、**Vibe Coding と Agentic Coding の違いを数字で比較**します。最後に5日間を振り返って AI チューターに発表し、自己評価をします。

## 今日のゴール

*   Vibe Order を Codespaces 上で起動し、ブラウザから操作できるようにする
*   主要なユーザーフローを E2E テストで守り、CI で実行する
*   同じ種類の変更依頼で Before（Vibe Chat）と After（Vibe Order）を比較し、振り返り発表をする
*   ルーブリックに沿って自己評価をする

## 進め方の目安

| 目安時間 | 内容 | 形式 |
| :--- | :--- | :--- |
| 15分 | 前日の振り返り | AI チューター |
| 30分 | frontend の仕上げと、Codespaces での起動 | ハンズオン |
| 45分 | E2E テストを作り、CI に組み込む | ハンズオン |
| 90分 | **変更依頼で Before/After を比較する**（比較シートの完成まで） | ハンズオン |
| 30分 | 振り返り発表の準備 | 個人 |
| 15分 | **振り返り発表**（発表10分＋質疑5分） | AI チューター |
| 30分 | ミニ講義：本番リリースに向けて、実務への持ち帰り | AI チューター |
| 30分 | 自己評価と最終日報 | 個人＋AI チューター |

## 書籍の該当箇所

*   PART7 Agentic Coding - リリース
    *   本研修では AWS へのデプロイの代わりに、Codespaces での起動と GitHub Actions による CI を行います
    *   E2E テストの計画とデバッグ（書籍 PART7 後半）

## ハンズオン

### 1. Codespaces で起動して公開する

1.  frontend の実装を完了させ、Day4 と同じ手順で Pull Request をマージします。
2.  backend と frontend を起動し、VS Code の **PORTS** タブで該当のポートを開きます。
3.  ポートの公開範囲（Visibility）が **Private** になっていることを確認します。
    *   **Public にはしません。**この研修では自分だけが操作するので、Private のままで十分です。
4.  席の画面とキッチン画面を別タブで開き、注文から提供までの流れを通しで確認します。

### 2. E2E テストを作り、CI に組み込む

1.  新しい会話を始め、**Plan モード**で [e2e-planning.prompt.txt](../hands-on/day5/prompts/e2e-planning.prompt.txt) を送信します。
2.  計画をレビューし、承認して実装させます。
3.  E2E テストが失敗して AI が解決できないときは、ターミナルの出力を [e2e-debug.prompt.txt](../hands-on/day5/prompts/e2e-debug.prompt.txt) に貼り付けて依頼します。
4.  CI のワークフローを、参考例 [vibe-order-ci-e2e.yml](../hands-on/day5/templates/vibe-order-ci-e2e.yml) と比べます。足りない観点があれば追加させます。
5.  Pull Request で CI が成功することを確認してマージします。

### 3. 変更依頼で Before/After を比較する

Day2 で Vibe Chat に出したのと同じ種類の依頼（項目追加、表示の変更、文字数制限、既存機能の仕様変更）を、Vibe Order に出します。

1.  ブランチを作り、新しい会話を **Plan モード**で始めます。
2.  [change-request-agentic.prompt.txt](../hands-on/day5/prompts/change-request-agentic.prompt.txt) を送信します。
3.  計画をレビューします。特に**期待値が変わる既存テスト**が挙げられているかを確認します。
4.  承認して実装させ、`/selfcheck` と CI で確認してマージします。
5.  Day2 と同じ観点で [比較シート](worksheets/VibeVsAgentic比較シート.md) の「Vibe Order（Day5 変更）」列を埋めます。

```bash
cd vibe-order
npm run check
npx vitest --run --coverage
npm audit
npm outdated
```

> [!NOTE]
> Agentic Coding でも、最初の実装時間は Vibe Coding より長くかかります。比較するのは「速さ」だけではありません。
> **変更したときに壊れたことにすぐ気づけるか、安心して変更できるか**に注目してください。

### 4. 振り返り発表

[発表テンプレート](worksheets/発表テンプレート.md) に沿って準備し、AI チューターに向けて発表します。AI チューターが聞き手になり、質疑を行います。

*   比較シートの数字をもとに、Before/After の違いをまとめます
*   デモは、Vibe Order の注文からキッチン画面への反映までを画面で見せます
*   「AI に任せてよいこと」と「人がやるべきこと」を、自分の言葉で示します
*   数字だけでなく、**自分の役割がどう変わったか**を語ります

### 5. 自己評価

[自己評価シート](worksheets/自己評価シート.md) に沿って、AI チューターと一緒に5つの観点を振り返り、根拠とあわせて記入します。

## ミニ講義：本番リリースに向けて

書籍 PART7 で扱っている、研修では省略した内容を紹介します。

*   **クラウドへのデプロイ**：書籍では AWS CDK でインフラをコード化し、GitHub Actions から OIDC で安全にデプロイしています
*   **MCP サーバー**：AWS の公式ドキュメントなど、外部の最新情報を AI に参照させる仕組みです
*   **商用リリースの前に**：セキュリティレビュー、性能試験、監視、運用手順など、AI 任せにできない判断があります
*   **実務への持ち帰り**：自分のチームのプロジェクトで、まず何を整えるか（CLAUDE.md、テスト、CI、権限設定）

## チェックポイント

*   [ ] Vibe Order を Codespaces 上で起動し、注文からキッチンへの反映まで確認した
*   [ ] E2E テストが CI で実行され、成功している
*   [ ] 変更依頼を完了し、比較シートの全列を埋めた
*   [ ] AI チューターに振り返り発表をした
*   [ ] 自己評価シートを記入した
*   [ ] Codespace を停止した

## 振り返り（最終日報）

*   5日間で、AI への指示の出し方はどう変わりましたか
*   明日から自分の業務で AI を使うとき、最初に整える仕組みは何ですか
