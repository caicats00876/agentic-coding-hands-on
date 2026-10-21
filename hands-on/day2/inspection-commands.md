# Vibe Chat 品質検証コマンド

Day2 の「品質を検証する」で使うコマンドです。**AI に頼らず、自分でターミナルから実行**してください。
結果は [Vibe vs Agentic 比較シート](../../docs/worksheets/VibeVsAgentic比較シート.md) の「Vibe Chat」列に記入します。

> [!NOTE]
> Vibe Chat の構成は人によって異なります。`package.json` が複数ある場合は、それぞれのディレクトリで実行してください。
> `package.json` の場所は `find vibe-chat -name package.json -not -path "*/node_modules/*"` で確認できます。

## 1. テストは「仕組みとして」残っているか

Claude Code は、頼まなくてもテストを書いて実行することがあります。大事なのは「一度テストを動かしたか」ではなく、**次に誰かが変更したときにも、テストが自動で走るか**です。

```bash
cd vibe-chat
npm run test
```

*   `Missing script: "test"` や `no test specified` と表示されたら、`npm run test` で動くテストはありません。
*   テストファイルの数を数えます。

```bash
find . -path ./node_modules -prune -o \( -name "*.test.*" -o -name "*.spec.*" \) -print | wc -l
```

*   変更のたびにテストを自動で走らせる仕組み（CI）があるかを確かめます。何も表示されなければ、ありません。

```bash
ls ../.github/workflows 2>/dev/null
```

*   「変更したらテストを実行する」と決めて書いてある場所（ルールのファイル）があるかを確かめます。何も表示されなければ、ありません。

```bash
ls ../CLAUDE.md CLAUDE.md 2>/dev/null
```

次の3つに、自分の言葉で答えます（Claude Code には聞きません）。

*   テストは、プロジェクトに残っているか
*   テストは、変更のたびに自動で走るか
*   テストを実行することが、どこかに決めて書いてあるか

## 2. Lint と Format は設定されているか

```bash
npm run lint
npx @biomejs/biome lint .
```

*   `lint` スクリプトがない場合は、Biome で一時的にチェックしてエラー件数を記録します。

## 3. 依存パッケージに脆弱性はないか

```bash
npm audit
```

*   `found N vulnerabilities` の件数と重大度（critical / high / moderate / low）を記録します。

## 4. 古いライブラリを使っていないか

```bash
npm outdated
```

*   `Current` と `Latest` のメジャーバージョンが違うパッケージの数を数えます。

## 5. 依存パッケージはいくつあるか、説明されているか

```bash
npm ls --depth=0
```

*   AI が追加理由を説明しなかったパッケージがいくつあるか、数えてみましょう。

## 6. 秘密情報が書かれていないか

```bash
grep -rnE "(secret|password|api[_-]?key|token)\s*[:=]" --include=*.ts --include=*.tsx --include=*.js --include=*.json . | grep -v node_modules
```

## 7. 既存機能は壊れていないか（手動確認）

機能追加の前に動いていた機能を、ブラウザで確認します。2人のユーザーで試すときは、2つ目のユーザーを**シークレットウィンドウ**（`Ctrl+Shift+N`）で開きます。同じウィンドウの2つのタブでは、ログイン状態が共有されて2人になりません。

*   [ ] ダイレクトメッセージ：ユーザー A から B に送ると、**B にだけ**届く（3人目には見えない）
*   [ ] チャンネル：`#general` などのチャンネルでメッセージを送ると、ほかのユーザーにも表示される
*   [ ] スレッド：メッセージに返信でき、返信が元のメッセージの下にまとまる
*   [ ] オンラインステータス：もう1人がログインすると、名前の横の表示が変わる
*   [ ] ファイル共有：画像を送ると、プレビューが表示される
*   [ ] 共同編集ドキュメント：開いて書いた内容が、もう1人の画面にも出る
