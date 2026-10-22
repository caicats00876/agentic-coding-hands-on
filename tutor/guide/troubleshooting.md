# トラブル対応

受講者が自分で操作して直せるよう、手順を案内します。あなたが代わりに操作することはしません。

## 環境とブラウザ

| 症状 | 対処 |
| :--- | :--- |
| Codespace が「recovery mode」で起動する | devcontainer の設定エラーです。**View Creation Log** で `ERROR` の行を見てもらいます。教材の誤りの可能性が高いので、再開メモの「メモ」に記録し、研修の担当者への報告を勧めます。修正が入ったら `git pull` → `F1` → **Codespaces: Rebuild Container** |
| 右クリックの「貼り付け」で貼れない | Codespace の VS Code では、右クリックメニューの貼り付けが使えないことがある。必ず `Ctrl+V` で貼る |
| 貼り付けると「クリップボードから読み取ることができません」と出る | Chrome のアドレスバー左のアイコン → サイトの設定 → クリップボードを「許可」にして再読み込み。Claude アプリの内蔵ブラウザで開いている場合は、作業用プロファイルの Chrome で開き直す |
| Codespace に Claude のアイコン（✳）が出ない | Claude Code 拡張が自動で入らなかった。左端の拡張機能アイコン → 検索欄に `Claude Code` → 提供元 Anthropic（認証済み）の「Claude Code for VS Code」をインストールしてもらう |
| 拡張機能のインストールで「発行元を信頼しますか?」と出る | 研修で必須の拡張機能は Claude Code だけ（提供元 Anthropic は認証済み）。それ以外の拡張機能は入れなくてよいので、キャンセルしてもらう |
| 作業中に Codespace が止まった | アイドルタイムアウト（初期値 30分）で停止した。https://github.com/codespaces から開き直せば、作業内容は残っている。https://github.com/settings/codespaces の Default idle timeout を 120 分にしてもらう |
| 「このフォルダー内のファイルの作成者を信頼しますか?」が出る | 「フォルダーを信頼して続行」。信頼しないと制限モードになる |
| Codespaces が重い | まず不要な dev サーバーを止める。それでも遅すぎて進められない場合だけ、4-core に変える（https://github.com/codespaces → 「…」→ **Change machine type**）。利用枠が2倍の速さで減るので、受講者に判断してもらい、終わったら 2-core に戻すよう勧める |
| Codespace の作成で 2-core が選べない（Below dev container requirements と出る） | 受講者の fork の `.devcontainer/devcontainer.json` が古い（4 コアが条件になっている）。研修担当者に連絡してもらう |
| Codespaces の利用枠が足りなくなりそう | 使わないときは Codespace を停止する（github.com/codespaces →「…」→ Stop codespace）。「Auto-delete codespace」に注意する |
| ポートを開いても画面が出ない | サーバーが `0.0.0.0` で待ち受けているか、PORTS タブで転送されているかを確認する |
| WebSocket がつながらない | フロントエンドの接続先が `localhost` 固定になっていないか確認する（Codespaces では転送先の URL を使う） |
| Playwright が起動しない | `npx playwright install --with-deps chromium` |

## Claude Code

| 症状 | 対処 |
| :--- | :--- |
| 右側のチャットに入力しても Claude が反応しない | VS Code 標準のチャット（Copilot）に入力しています。Claude のアイコン（✳）からパネルを開き直す |
| サインインで認証コードが届かない | 許可（Authorize）を押すとブラウザに認証コードが出る。それを Claude Code の入力欄に貼り戻す |
| サインインできない | ポップアップのブロックを解除する。アカウントの割り当ては管理者に確認する |
| 応答が英語になる | `/config` で language を `japanese` にする |
| AI が権限設定で拒否された操作を何度も試す | 会話を止め、受講者自身にターミナルで実行させる |
| 同じ失敗を繰り返す、指示を忘れる | 新しい会話で状況を整理してから再開する。Day4 以降は `resume.template.prompt.txt` を使う |

## AI チューター（このプロジェクト）と Claude in Chrome

| 症状 | 対処 |
| :--- | :--- |
| チューターが「Chrome を使えない」と言う | 受講者が Web 版の claude.ai（Chrome のタブ）でプロジェクトを開いています。Web 版では Chrome を使えません。**Claude デスクトップアプリ**のチャットで、プロジェクト → 組織 タブから開き直してもらう。再開メモを貼れば続きから進められる |
| チャットの切り替えが Cowork になっている | 入力欄の下の切り替えを **チャット** に戻してもらう |
| 接続されたブラウザが 0 件 | 受講者に、作業用プロファイルの Chrome でツールバーの Claude のアイコンを開いてもらう。サインインが切れていればサインインし直してもらう |
| 受講者が開いたタブが見えない | 仕様です。確認したいページは自分のタブグループで開く |
| つながらないまま進めたい | 受講者にスクリーンショットを貼ってもらって進める |

## 権限設定（Day2 以降）

| 症状 | 対処 |
| :--- | :--- |
| `cp` でコピーした `.claude/settings.json` が、すぐに「全部 allow」（deny と ask がない）に変わった | Claude Code のパネルを閉じてから、もう一度コピーしてもらう。そのあと `cat .claude/settings.json` で、deny、ask、allow の3つがあるかを確かめる（試走で発生。原因は調査中） |
| Day1 のあとに `.claude/settings.json` ができている | 「常に許可」を押した結果。Day2 のハンズオン 4 の教材として中身を見せる。それまではコミットしない |

## Git と CI

| 症状 | 対処 |
| :--- | :--- |
| CI だけ失敗する | CI のログをそのまま AI に貼って原因を調べさせる。`npm ci` と `package-lock.json` の不一致が多い |
| `git add .` で個人用の設定までコミットしそう | `.claude/settings.local.json` は `.gitignore` 済み。それ以外の不要なファイルは `git status` で確認してから add する |
