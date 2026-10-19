# Agentic Coding 体験研修（5日間）

AI エージェントと一緒にシステムを作る「Agentic Coding」を、**手を動かして体験する**ための5日間の研修です。
教材のベースは [docs/ref/AgenticCoding.pdf](docs/ref/AgenticCoding.pdf) です。書籍の内容を網羅するのではなく、体験を通じて「AI にどう委ねればよいか」を身につけることを目的としています。

この研修は**自学自習**で進めます。人間の講師の代わりに **AI チューター**（Claude）が、手順の案内、ミニ講義、画面の確認、振り返りの聞き手を務めます。

> [!NOTE]
> AI は**社内で契約している Claude** を使います。
> *   **AI チューター**：自分の PC の Claude デスクトップアプリで動きます。Claude in Chrome を通して、Chrome の画面を確認しながら案内します。
> *   **開発の相手**：GitHub Codespaces の VS Code に入っている **Claude Code 拡張**のチャットパネルから指示を出します。
>
> 書籍は Cline と Amazon Bedrock を前提としていますが、本研修では Claude Code に読み替えます（[ClaudeCodeチートシート](docs/ClaudeCodeチートシート.md)）。

## 対象者

*   **新入社員**：プログラミングの基礎（変数、関数、Git の基本操作）を学んだ方
*   **AI 駆動開発の入門者**：Coding Agent をこれから業務で使い始める方

## 研修のストーリー

この研修は「便利さ → 失敗 → 解決 → 実感」の流れで進みます。座学は各日のミニ講義（30分程度）だけで、残りの時間は手を動かします。

```mermaid
flowchart LR
    A["Day1<br/>Vibe Coding の<br/>手軽さを体験"] --> B["Day2<br/>Vibe Coding の<br/>問題点に直面"]
    B --> C["Day3-4<br/>Agentic Coding で<br/>解決する"]
    C --> D["Day5<br/>同じ変更依頼で<br/>Before/After を比較"]
```

1.  **手軽さを体験する**：雑なプロンプトだけで、数時間でチャットアプリ「Vibe Chat」が完成します。
2.  **問題点に直面する**：Vibe Chat に機能を追加すると、壊れる、直らない、テストもない、という状況に陥ります。問題を自分で検証し、言語化します。
3.  **Agentic Coding で解決する**：要件の具体化、自動テスト、規約の自動化、ガードレールという「4つの作法」を整えます。そのうえで注文管理システム「Vibe Order」を AI と一緒に開発します。
4.  **効果を実感する**：Day2 と同じ種類の変更依頼を Vibe Order に行い、テストと CI が品質を守ってくれることを確かめます。

## 5日間の内容

| Day | テーマ | 主な体験 | 書籍 |
| :--- | :--- | :--- | :--- |
| [Day1](docs/Day1_環境構築とVibeCoding体験.md) | 環境構築と Vibe Coding 体験 | アカウントと Codespaces の準備、Vibe Chat を作る | PART1〜3 |
| [Day2](docs/Day2_VibeCodingの限界とAgenticCodingへの転換.md) | Vibe Coding の限界と転換 | 機能追加で壊れる体験、品質の検証、ガードレールの設定 | PART4 |
| [Day3](docs/Day3_開発基盤構築と要件の具体化.md) | 開発基盤構築と要件の具体化 | モノレポ、テスト、Lint、CI の整備、設計書の作成 | PART5〜6 |
| [Day4](docs/Day4_AgenticCodingで実装.md) | Agentic Coding で実装 | shared、backend、frontend を TDD とセルフチェックで実装 | PART6 |
| [Day5](docs/Day5_仕上げ・BeforeAfter比較・発表.md) | 仕上げ、Before/After 比較、振り返り | E2E テスト、Codespaces での公開、変更依頼の比較、振り返り発表、自己評価 | PART7（読み替え） |

1日分はおよそ7〜8時間です。自分のペースで進めてかまいません。区切りのよいところで中断すると、AI チューターが次回の再開位置を覚えています。

## 研修環境

| 項目 | 本研修での利用 |
| :--- | :--- |
| AI チューター | Claude デスクトップアプリ（このリポジトリの `tutor/` フォルダを開く） |
| ブラウザ | Google Chrome の作業用プロファイル ＋ Claude in Chrome 拡張 |
| Git リポジトリ | GitHub（このリポジトリを各自で fork） |
| 開発環境 | GitHub Codespaces（VS Code） |
| Coding Agent | Claude Code（VS Code 拡張、チャットパネル） |
| AI モデル | 社内契約の Claude |
| 実行環境 | Codespaces 上で起動し、ポート転送で公開 |
| CI | GitHub Actions |

*   アカウントの登録には、すべて**自社のメールアドレス**を使います（作業用の Google アカウント、GitHub アカウント）。手順は Day1 にあります。
*   Codespaces で貼り付けるにはクリップボードの許可が必要です。権限を変更できない他のブラウザ（Claude アプリの内蔵ブラウザなど）では進められないため、Chrome を使ってください。
*   画面が狭いと AI の出力とコードを並べて見られません。可能であれば外部モニターを使ってください。

> [!WARNING]
> **Codespaces の利用枠に注意してください。**個人アカウントの Codespaces には、毎月の無料の利用枠（コア時間）があります。この研修の Codespace は 4 コアのため、利用枠は約30時間分です。作業を終えるときや長い休憩のときは、https://github.com/codespaces で Codespace を**停止**してください。

## 受講の準備

### 事前に用意されているもの

管理者から配布されます（[管理者向け準備](docs/管理者向け準備.md)）。

*   社内契約の Claude アカウント（自社のメールアドレス）
*   Claude デスクトップアプリ
*   Google Chrome

### AI チューターを起動する

GitHub アカウントは研修の中で作ります。そのため、AI チューターは fork ではなく**このリポジトリ（元の研修リポジトリ）**を自分の PC に用意して起動します。

1.  このリポジトリを PC に用意します。どちらかの方法で行います。
    *   Git が使える場合：
        ```bash
        git clone https://github.com/caicats00876/agentic-coding-hands-on.git
        ```
    *   Git が使えない場合：このページの **Code → Download ZIP** でダウンロードし、展開します。リポジトリが見られない場合は、管理者から ZIP を受け取ってください。
2.  Claude デスクトップアプリを開き、社内契約の Claude アカウントでサインインします。
3.  **Code** タブで、手順 1 のフォルダの中の **`tutor`** フォルダを選んで、新しいセッションを始めます。
4.  「研修を始めて」と入力します。ここから先は AI チューターが案内します。

中断したあと再開するときも、同じ `tutor` フォルダでセッションを始め、「研修を再開して」と入力します。

## 進め方

1.  AI チューターの案内に沿って、各 Day のドキュメントを進めます。プロンプトや設定ファイルは [hands-on/](hands-on/) からコピーして使います。
2.  毎日の終わりに [日報](docs/worksheets/日報テンプレート.md) を書き、[Vibe vs Agentic 比較シート](docs/worksheets/VibeVsAgentic比較シート.md) を更新します。
3.  最終日に [振り返り発表](docs/worksheets/発表テンプレート.md) と [自己評価](docs/worksheets/自己評価シート.md) を行います。
4.  作成したコードやドキュメントは、自分の fork にコミットして残します。

## リポジトリ構成

```
.devcontainer/          Codespaces の設定（Node.js と Claude Code 拡張）
docs/
  Day1〜Day5_*.md       各日の研修ドキュメント
  ClaudeCodeチートシート.md
  管理者向け準備.md
  slides/               研修説明用の HTML スライド
  worksheets/           比較シート、日報、振り返り発表、自己評価
  ref/AgenticCoding.pdf ベース教材
hands-on/
  day1〜day5/           コピペ用のプロンプトと設定テンプレート
tutor/
  CLAUDE.md             AI チューターへの指示
  guide/                AI チューター用の日ごとのガイド、トラブル対応、評価
```

研修中に作成するアプリは、次のディレクトリに置きます。

*   `vibe-chat/`：Day1〜2 の Vibe Coding で作るアプリ
*   `vibe-order/`：Day3〜5 の Agentic Coding で作るアプリ

## スライド

研修の説明用スライドは [docs/slides/agentic-coding-training.html](docs/slides/agentic-coding-training.html) です。AI チューターがオリエンテーションで開きます。自分でブラウザで開くこともできます。

*   `→` / `Space` / クリックで次へ、`←` で前へ
*   `N` で発表者ノートを表示、`F` で全画面
*   ブラウザの印刷機能で「PDF に保存」すると、全スライドを PDF にできます
