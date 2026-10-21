# 試走フィードバック（Day1〜Day2）

受講者 ID：caicats00876（試走）
ブランチ：trial/caicats00876-day2
目的：試走で見つかった教材の問題点と修正案。Claude Code に Plan モードで渡し、教材の修正計画を立てさせるために使う。

## 進め方の方針（全体）

| # | 指摘 | 修正案 | 対象ファイル |
| :--- | :--- | :--- | :--- |
| 1 | 研修の趣旨と関係ない Git、Codespace、VS Code、ターミナルの解説はノイズになる | 操作（何を押す、何を貼る）だけを示す。解説しない | tutor/指示文.md |
| 2 | Codespace の操作説明を毎日繰り返す必要はない | Day1 でまとめて説明。Day2 以降は「分からなければ Day1 の資料を見る」と案内 | tutor/指示文.md、tutor/guide/day2〜5 |
| 3 | 右クリックメニューでは Codespace の VS Code に貼り付けできない | 貼り付けは必ず「Ctrl+V」と明記 | tutor/指示文.md、docs/道具の使い方.md |
| 4 | 「【チューターに返事】」が命令口調で感じが悪い | 「【チューターへ】」「【このチャットで教えてください】」などに言い換え | tutor/指示文.md、docs/道具の使い方.md、docs/Day1 |
| 5 | チューターとの対話で気づきに誘導する進め方は好評 | 問いかけ例をガイドに残す（下の「効いた問い」） | tutor/guide/day2.md |

## Day1 からの持ち越し

| # | 指摘 | 修正案 | 対象ファイル |
| :--- | :--- | :--- | :--- |
| 6 | 確認ダイアログの「常に許可」が、教材の説明（settings.local.json）と違い、共有用の `.claude/settings.json` に書き込まれていた。中身に `rm -rf`、`curl`、`npm i *` を含む | 教材の説明を実際の挙動に合わせて確認・修正。Day2 ではこれを「読まずに許可した結果」の実例として見せる | docs/ClaudeCodeチートシート.md、docs/Day2、tutor/guide/day1.md、day2.md |
| 7 | 比較シートの置き場所とコピーの仕方が伝わっていない | Day1 の記録で、自分用ファイルを作って開くコマンドを示す | docs/Day1、tutor/guide/day1.md |

## Day2 ハンズオン 1：機能追加

| # | 指摘 | 修正案 | 対象ファイル |
| :--- | :--- | :--- | :--- |
| 8 | 機能追加が1回の指示、約10分、手戻り0、デグレ0で完了。「壊れる体験」が起きない | 変更依頼の難度を上げる、または「3か月後に別の人が変更する」想定を入れる。壊れない場合の進め方をガイドに書く | hands-on/day2/change-request.prompt.txt、tutor/guide/day2.md |
| 9 | 「起動して」のあと、アクセスする URL が受講者に分からなかった | 起動後の開き方（ポートタブ → 地球儀アイコン、または Claude Code に「URL を教えて」）を手順に入れる | docs/Day2、docs/Day1 |
| 10 | 確認リストの「グループチャット」が何を指すか分からない | 「チャンネルでメッセージを送れる」など、画面での確かめ方を書く | hands-on/day2/inspection-commands.md |

## Day2 ハンズオン 2〜3：品質検証と4分類

| # | 指摘 | 修正案 | 対象ファイル |
| :--- | :--- | :--- | :--- |
| 11 | Day1 で Claude Code が頼まれなくても `test/smoke.test.js` を作っていた。「テストがない」体験が起きない | 観点を「テストがあるか」から「プロジェクトに残っているか」「毎回自動で走るか」「決めてある場所があるか」に寄せる | hands-on/day2/inspection-commands.md、docs/Day2、tutor/guide/day2.md |
| 12 | 受講者が品質検証の問いに Claude Code の答えを貼ってきた | 問いを出すたびに「Claude Code には聞かず、自分の言葉で」と明記 | tutor/指示文.md、tutor/guide/day2.md |
| 13 | 比較シート・日報は Markdown の表で、初心者には書き方が分からない | 記入済みのひな形をチューターが示し、受講者は貼り付けと数字の記入だけにする。または記入欄を箇条書きにする | docs/worksheets/*、tutor/guide/day1〜5 |
| 14 | 受講者は「特に問題ない品質」「プロトタイプなら十二分」と判断 | 4分類は「今は動いている」ではなく「変更し続けたときに守れるか」を問う | tutor/guide/day2.md |

### 効いた問い（ガイドに残す）

* 「3か月後、別の担当者が機能を足したら、DM が第三者に届くようになった。誰が、いつ気づきますか」
* 「AI が必ずテストを実行してくれる、と言える根拠はどこにありますか。決めてある場所はありますか」
* 受講者の「確認ダイアログは数が少なくても読まない」という本音 → 人の注意力に頼らない多層防御につなげる

## Day2 ハンズオン 4〜5：ガードレール

| # | 指摘 | 修正案 | 対象ファイル |
| :--- | :--- | :--- | :--- |
| 15 | 手順書の `git add -A` が、コミットしない予定の `hello/` と `.claude/` も含めてしまう | `git add vibe-chat` に変える | docs/Day2 |
| 16 | `cp` で配置した `.claude/settings.json` が、直後に「全部 allow」（deny と ask がなくなる）に書き換わった。テンプレートは正しい。再コピー後は再発なし。原因不明 | 研修担当者が原因を調査。手順に「コピー後に `cat` で中身を確認する」を入れる | docs/Day2、tutor/guide/day2.md、tutor/guide/troubleshooting.md |
| 17 | 受講者から「この設定は研修として意味があるのか、正解なのか」と質問 | 「体験用の例。止まることと、すり抜けることの両方を体験するためのもの」と目的を明記 | docs/Day2、hands-on/day2/templates/.claude/settings.json の説明 |
| 18 | 受講者から「rm -rf、push --force、curl も必要なら許可する」「数が少なくても読まない」と意見 | ガードレールの説明を「禁止」より「誰がどこで判断するかを先に決める（deny / ask / allow）」として伝える。ask の中身（commit、push、npm install）を見直す | docs/Day2、tutor/guide/day2.md |
| 19 | 拒否されたあと、Claude Code が自ら抜け道を説明・提案した（`.env` は cat なら読める、`rm -r -f` や `find -delete` なら通る、`--force-with-lease` は deny に一致しない） | 手順書の WARNING を「AI が勝手に回り込む」だけでなく「人に抜け道を提案する」形も書く。ブランチ保護への導入に使う | docs/Day2、tutor/guide/day2.md |
| 20 | `.claude/settings.json` をコミットする手順がない（提出物に `.claude/` が含まれる） | ハンズオン 4 の最後に `git add .claude/settings.json && git commit` を入れる | docs/Day2 |

## Day2 ハンズオン 6：Plan モード

| # | 指摘 | 修正案 | 対象ファイル |
| :--- | :--- | :--- | :--- |
| 21 | 直す「不具合」がなかった | 代わりの課題を用意する。今回は「ユーザー名20文字の数え方（絵文字・全角）」を使い、調査で3か所の数え方がばらばらと判明した | docs/Day2、tutor/guide/day2.md、hands-on/day2/ に代替プロンプト |
| 22 | 計画承認の選択肢は「Yes, and use auto mode」「Yes, and manually approve edits」「No, keep planning」。手順書・チートシートの「Edit automatically で実行」に当たる選択肢がない | 「2 を選び、必要なら入力欄のモードを Edit automatically に切り替える」と書く | docs/ClaudeCodeチートシート.md、docs/Day2〜4 |
| 23 | 計画に頼んでいないもの（NFC、文字数表示、E2E とスマホ幅、Playwright 追加）が入っていた | 計画レビューの観点に「頼んでいない作業はないか」を入れる | docs/Day2、tutor/guide/day2.md |
| 24 | 計画で追加した @playwright/test@1.49.1 に high 脆弱性2件。AI が npm audit で気づいて質問。最終的に 1.63.0 を固定 | 計画レビューの観点に「追加するライブラリの版は新しいか、脆弱性はないか」を入れる | docs/Day2、docs/Day3、tutor/guide/day2〜3 |
| 25 | 受講者から版の選び方について質問（ゼロデイ、ワンデイ攻撃の観点）。「2週間待つ」はサプライチェーン攻撃には有効だが、ワンデイ攻撃とは逆向きのリスク | 深追いせず、Day3 の CI（定期的な npm audit）につなげる。ガイドに想定問答として残す | tutor/guide/day2.md |
| 26 | 受講者は「Vibe Coding との違いが分からない」「自分で決めたことはない」と回答。AI が選択肢とおすすめを出すので、決めた実感が生まれにくい | 「計画の中に、自分が知らなかった事実や頼んでいない作業がいくつあったか」を数える活動にする | docs/Day2、tutor/guide/day2.md、docs/worksheets/VibeVsAgentic比較シート.md |

## Day2 ハンズオン 7：要件を読む

| # | 指摘 | 修正案 | 対象ファイル |
| :--- | :--- | :--- | :--- |
| 27 | 受講者が技術スタックの説明を求めた。探してほしいのは「何を作るか」の曖昧さ | 「コア機能」「非機能要件」を読むよう範囲を指定する | docs/Day2、tutor/guide/day2.md |
| 28 | 「MVP」が通じなかった。冒頭に定義はあるが、見出しの「（MVP）」だけでは分からない | 見出しの近くにも「MVP = 必ず作る範囲」を書く。曖昧な言葉の例として使う | hands-on/day3/prompts/vibe-order-requirements.md |
| 29 | 「注文画面を使うのはお客さんか店員か」「どの機器か」が要件にない。受講者は「お客さんが自分のスマートフォンで使う」と決めた。その結果、「席の選び方」「Private ポートとの関係」が新たな問いになる | 曖昧な点の例としてガイドに残す。Private ポートとお客さんのスマホの矛盾は、Day3 の要件の具体化で扱う | tutor/guide/day2.md、day3.md |

## Codespaces の利用枠

| # | 指摘 | 修正案 | 対象ファイル |
| :--- | :--- | :--- | :--- |
| 30 | Day1〜Day2 で 7.47 時間（4 コア）使用。残り約22.5時間で、Day3〜5（約22時間）とほぼ同じ。無料枠では受け切る余裕がない | 管理者向け準備の記載を強める。使用量の見方（Settings → Billing and licensing → Usage → 検索欄 `product:codespaces`）と残り時間の計算（(120 − 使ったコア時間) ÷ 4）を README に書く | README.md、docs/管理者向け準備.md |
| 31 | 停止の確認方法が分からない | github.com/codespaces の「…」に Stop codespace がなければ停止済み、と書く | README.md、docs/Day1 |

## 受講者の認識の変化（参考）

* 朝：「見た目がまともだから、そのまま納品できる」
* 夕方：「プロトタイプならこんなもの」
* 安心感（比較シート）：5
