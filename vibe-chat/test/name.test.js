'use strict';
/*
 * ユーザー名の文字数チェック(public/name.js)の単体テスト
 *  - 「1 文字」は見た目の 1 文字(書記素クラスタ)で数える
 *  - 見た目 20 文字までは通し、21 文字からは拒否する
 */
const assert = require('assert');
const { MAX_NAME, graphemeLength, checkName } = require('../public/name.js');

assert.strictEqual(MAX_NAME, 20);

// ───────── 見た目どおりに数える ─────────
const samples = [
  ['全角', 'あいう', 3],
  ['半角カナ', 'ｱｲｳ', 3],
  ['絵文字', '🎉', 1],
  ['肌の色つき', '👍🏽', 1],
  ['ZWJ でつないだ家族', '👨‍👩‍👧', 1],
  ['国旗', '🇯🇵', 1],
  ['異体字セレクタ付き', '❤️', 1],
  ['濁点が分かれた「か＋゛」', 'が', 1],
  ['キーキャップ', '1️⃣', 1],
];
for (const [label, s, expected] of samples) {
  assert.strictEqual(graphemeLength(s), expected, `${label}: ${s}`);
}
console.log(`✓ 見た目どおりに数える (${samples.length} 種類)`);

// ───────── 境界: 20 文字は通り、21 文字は拒否 ─────────
// 1 文字が UTF-16 で 14〜15 単位になる長い絵文字(スコットランドの旗、肌の色つきのカップル)も含める
const units = ['あ', '漢', 'Ａ', '🎉', '👨‍👩‍👧', '🇯🇵', '👍🏽', 'が', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '👩🏽‍❤️‍💋‍👨🏿'];
for (const u of units) {
  const ok = checkName(u.repeat(20));
  assert.strictEqual(ok.error, null, `${u}×20 は通る`);
  assert.strictEqual(ok.name, u.repeat(20));
  const ng = checkName(u.repeat(21));
  assert.match(ng.error, /20文字以内/, `${u}×21 は拒否`);
}
console.log(`✓ 20 文字は通り 21 文字は拒否 (${units.length} 種類)`);

// ───────── 空白 ─────────
assert.deepStrictEqual(checkName('  alice  '), { name: 'alice', error: null });
assert.match(checkName('   ').error, /名前を入力してください/);
assert.match(checkName('').error, /名前を入力してください/);
// 前後の空白は数えない(見た目 20 文字 + 空白でも通る)
assert.strictEqual(checkName(' ' + 'あ'.repeat(20) + ' ').error, null);
console.log('✓ 前後の空白は取り除き、空白だけは拒否');

// ───────── 文字列以外 ─────────
for (const v of [undefined, null, 123, {}, ['a']]) {
  assert.match(checkName(v).error, /名前を入力してください/, `型 ${typeof v}`);
}
console.log('✓ 文字列以外は拒否');

// ───────── 結合文字の重ねすぎ ─────────
const zalgo = 'a' + '́'.repeat(200);
assert.strictEqual(graphemeLength(zalgo), 1, '見た目は 1 文字');
assert.match(checkName(zalgo).error, /20文字以内/, 'それでも 1 文字あたりの上限で拒否');
// 上限ちょうど(1 文字 32 単位)は通り、33 単位は拒否
assert.strictEqual(checkName('a' + '́'.repeat(31)).error, null);
assert.match(checkName('a' + '́'.repeat(32)).error, /20文字以内/);
console.log('✓ 結合文字を重ねすぎた名前は拒否');

console.log('\nname tests passed 🎉');
