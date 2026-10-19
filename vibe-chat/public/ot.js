/*
 * Vibe Chat - テキスト用 Operational Transformation (OT)
 * サーバー(Node.js) とブラウザの両方で読み込む共用モジュール。
 *
 * 操作(TextOperation)は次の要素の配列で表す:
 *   正の整数 n  … n 文字そのまま残す (retain)
 *   文字列 s    … s を挿入する (insert)
 *   負の整数 -n … n 文字削除する (delete)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const isRetain = (o) => typeof o === 'number' && o > 0;
  const isInsert = (o) => typeof o === 'string';
  const isDelete = (o) => typeof o === 'number' && o < 0;

  class TextOperation {
    constructor() {
      this.ops = [];
      this.baseLength = 0; // 適用前の文字列長
      this.targetLength = 0; // 適用後の文字列長
    }

    retain(n) {
      if (n === 0) return this;
      this.baseLength += n;
      this.targetLength += n;
      const l = this.ops.length;
      if (l && isRetain(this.ops[l - 1])) this.ops[l - 1] += n;
      else this.ops.push(n);
      return this;
    }

    insert(s) {
      if (!s) return this;
      this.targetLength += s.length;
      const ops = this.ops;
      const l = ops.length;
      if (l && isInsert(ops[l - 1])) {
        ops[l - 1] += s;
      } else if (l && isDelete(ops[l - 1])) {
        // 挿入は常に削除より前に置き、表現を正規化する
        if (l > 1 && isInsert(ops[l - 2])) ops[l - 2] += s;
        else {
          ops.push(ops[l - 1]);
          ops[l - 1] = s;
        }
      } else {
        ops.push(s);
      }
      return this;
    }

    delete(n) {
      if (n === 0) return this;
      if (n < 0) n = -n;
      this.baseLength += n;
      const l = this.ops.length;
      if (l && isDelete(this.ops[l - 1])) this.ops[l - 1] -= n;
      else this.ops.push(-n);
      return this;
    }

    isNoop() {
      return this.ops.length === 0 || (this.ops.length === 1 && isRetain(this.ops[0]));
    }

    apply(str) {
      if (str.length !== this.baseLength) {
        throw new Error(`OT: base length mismatch (${str.length} != ${this.baseLength})`);
      }
      const out = [];
      let i = 0;
      for (const o of this.ops) {
        if (isRetain(o)) {
          out.push(str.slice(i, i + o));
          i += o;
        } else if (isInsert(o)) {
          out.push(o);
        } else {
          i -= o;
        }
      }
      return out.join('');
    }

    /** カーソル位置などのインデックスを、この操作の適用後の位置に変換する */
    transformIndex(index) {
      let newIndex = index;
      let oldIndex = index;
      for (const o of this.ops) {
        if (isRetain(o)) oldIndex -= o;
        else if (isInsert(o)) newIndex += o.length;
        else {
          newIndex -= Math.min(oldIndex, -o);
          oldIndex += o;
        }
        if (oldIndex < 0) break;
      }
      return newIndex;
    }

    toJSON() {
      return this.ops;
    }

    static fromJSON(ops) {
      if (!Array.isArray(ops)) throw new Error('OT: ops must be an array');
      const op = new TextOperation();
      for (const o of ops) {
        if (isInsert(o)) op.insert(o);
        else if (Number.isInteger(o) && o > 0) op.retain(o);
        else if (Number.isInteger(o) && o < 0) op.delete(o);
        else throw new Error('OT: invalid component ' + JSON.stringify(o));
      }
      return op;
    }

    /** a の後に b を適用するのと同じ結果になる 1 つの操作を返す */
    static compose(a, b) {
      if (a.targetLength !== b.baseLength) throw new Error('OT: compose length mismatch');
      const res = new TextOperation();
      const ops1 = a.ops;
      const ops2 = b.ops;
      let i1 = 0;
      let i2 = 0;
      let op1 = ops1[i1++];
      let op2 = ops2[i2++];
      for (;;) {
        if (op1 === undefined && op2 === undefined) break;
        if (isDelete(op1)) {
          res.delete(op1);
          op1 = ops1[i1++];
          continue;
        }
        if (isInsert(op2)) {
          res.insert(op2);
          op2 = ops2[i2++];
          continue;
        }
        if (op1 === undefined || op2 === undefined) throw new Error('OT: compose failed');

        if (isRetain(op1) && isRetain(op2)) {
          if (op1 > op2) { res.retain(op2); op1 -= op2; op2 = ops2[i2++]; }
          else if (op1 === op2) { res.retain(op1); op1 = ops1[i1++]; op2 = ops2[i2++]; }
          else { res.retain(op1); op2 -= op1; op1 = ops1[i1++]; }
        } else if (isInsert(op1) && isDelete(op2)) {
          if (op1.length > -op2) { op1 = op1.slice(-op2); op2 = ops2[i2++]; }
          else if (op1.length === -op2) { op1 = ops1[i1++]; op2 = ops2[i2++]; }
          else { op2 += op1.length; op1 = ops1[i1++]; }
        } else if (isInsert(op1) && isRetain(op2)) {
          if (op1.length > op2) { res.insert(op1.slice(0, op2)); op1 = op1.slice(op2); op2 = ops2[i2++]; }
          else if (op1.length === op2) { res.insert(op1); op1 = ops1[i1++]; op2 = ops2[i2++]; }
          else { res.insert(op1); op2 -= op1.length; op1 = ops1[i1++]; }
        } else if (isRetain(op1) && isDelete(op2)) {
          if (op1 > -op2) { res.delete(op2); op1 += op2; op2 = ops2[i2++]; }
          else if (op1 === -op2) { res.delete(op2); op1 = ops1[i1++]; op2 = ops2[i2++]; }
          else { res.delete(op1); op2 += op1; op1 = ops1[i1++]; }
        } else {
          throw new Error('OT: compose unexpected state');
        }
      }
      return res;
    }

    /**
     * 同じ文書に対して同時に作られた a, b を変換し [a', b'] を返す。
     * apply(apply(S, a), b') === apply(apply(S, b), a')
     * 同じ位置への挿入は a を優先(前)にする。
     */
    static transform(a, b) {
      if (a.baseLength !== b.baseLength) throw new Error('OT: transform length mismatch');
      const a1 = new TextOperation();
      const b1 = new TextOperation();
      const ops1 = a.ops;
      const ops2 = b.ops;
      let i1 = 0;
      let i2 = 0;
      let op1 = ops1[i1++];
      let op2 = ops2[i2++];
      for (;;) {
        if (op1 === undefined && op2 === undefined) break;
        if (isInsert(op1)) {
          a1.insert(op1);
          b1.retain(op1.length);
          op1 = ops1[i1++];
          continue;
        }
        if (isInsert(op2)) {
          a1.retain(op2.length);
          b1.insert(op2);
          op2 = ops2[i2++];
          continue;
        }
        if (op1 === undefined || op2 === undefined) throw new Error('OT: transform failed');

        let minl;
        if (isRetain(op1) && isRetain(op2)) {
          if (op1 > op2) { minl = op2; op1 -= op2; op2 = ops2[i2++]; }
          else if (op1 === op2) { minl = op2; op1 = ops1[i1++]; op2 = ops2[i2++]; }
          else { minl = op1; op2 -= op1; op1 = ops1[i1++]; }
          a1.retain(minl);
          b1.retain(minl);
        } else if (isDelete(op1) && isDelete(op2)) {
          if (-op1 > -op2) { op1 -= op2; op2 = ops2[i2++]; }
          else if (op1 === op2) { op1 = ops1[i1++]; op2 = ops2[i2++]; }
          else { op2 -= op1; op1 = ops1[i1++]; }
        } else if (isDelete(op1) && isRetain(op2)) {
          if (-op1 > op2) { minl = op2; op1 += op2; op2 = ops2[i2++]; }
          else if (-op1 === op2) { minl = op2; op1 = ops1[i1++]; op2 = ops2[i2++]; }
          else { minl = -op1; op2 += op1; op1 = ops1[i1++]; }
          a1.delete(minl);
        } else if (isRetain(op1) && isDelete(op2)) {
          if (op1 > -op2) { minl = -op2; op1 += op2; op2 = ops2[i2++]; }
          else if (op1 === -op2) { minl = op1; op1 = ops1[i1++]; op2 = ops2[i2++]; }
          else { minl = op1; op2 += op1; op1 = ops1[i1++]; }
          b1.delete(minl);
        } else {
          throw new Error('OT: transform unexpected state');
        }
      }
      return [a1, b1];
    }
  }

  /** 2 つの文字列の差分(共通の前後を除いた中央部の置換)から操作を作る */
  function fromDiff(oldStr, newStr) {
    let start = 0;
    const minLen = Math.min(oldStr.length, newStr.length);
    while (start < minLen && oldStr.charCodeAt(start) === newStr.charCodeAt(start)) start++;
    let endOld = oldStr.length;
    let endNew = newStr.length;
    while (endOld > start && endNew > start && oldStr.charCodeAt(endOld - 1) === newStr.charCodeAt(endNew - 1)) {
      endOld--;
      endNew--;
    }
    return new TextOperation()
      .retain(start)
      .delete(endOld - start)
      .insert(newStr.slice(start, endNew))
      .retain(oldStr.length - endOld);
  }

  return { TextOperation, fromDiff };
});
