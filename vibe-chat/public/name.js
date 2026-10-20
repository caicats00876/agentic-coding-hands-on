/*
 * Vibe Chat - ユーザー名のチェック
 * サーバー(Node.js) とブラウザの両方で読み込む共用モジュール。
 *
 * 「1 文字」は見た目の 1 文字(書記素クラスタ)で数える。
 * 例: 🎉 / 👍🏽 / 👨‍👩‍👧 / 🇯🇵 / 「か＋゛」はどれも 1 文字。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VibeName = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_NAME = 20;
  // 見た目 1 文字あたりの上限(UTF-16 の単位)。実在する絵文字は最長でも 15 前後なので余裕を持たせ、
  // 結合文字を何百個も重ねた「見た目 1 文字」で画面が崩れたりデータが膨らんだりするのを防ぐ
  const MAX_UNITS_PER_CHAR = 32;

  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const graphemes = (s) => Array.from(segmenter.segment(s), (x) => x.segment);

  /** 見た目の文字数 */
  function graphemeLength(s) {
    return graphemes(s).length;
  }

  /** 名前を確かめる。前後の空白を取り除いた名前と、問題があればエラー文を返す */
  function checkName(raw) {
    if (typeof raw !== 'string') return { name: '', error: '名前を入力してください' };
    const name = raw.trim();
    if (!name) return { name, error: '名前を入力してください' };
    const chars = graphemes(name);
    if (chars.length > MAX_NAME || chars.some((c) => c.length > MAX_UNITS_PER_CHAR)) {
      return { name, error: `名前は${MAX_NAME}文字以内で入力してください` };
    }
    return { name, error: null };
  }

  return { MAX_NAME, graphemeLength, checkName };
});
