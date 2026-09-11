/**
 * base-62 有序字符串（fractional indexing，非完整 LexoRank）。
 *
 * ⚠️ 与 `api/order.ts` 必须逐位兼容（两份实现、同一套测试向量）：
 *   between(null, null) === 'V'
 *   between('1', '2')   === '1V'
 *   between('z', null)  === 'zV'
 *   between(null, 'V')  === 'FV'
 *   between('V', null)  === 'kV'
 *
 * 拖动排序只写被拖动的**那一个**元素（1 次 KV 写）。
 * 相邻两串插不进中间值时由调用方做一次该分类内重排。
 */

export const ORDER_DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = ORDER_DIGITS.length; // 62

function digitsOf(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const idx = ORDER_DIGITS.indexOf(s[i]);
    if (idx >= 0) out.push(idx);
  }
  return out;
}

function toDigitsString(digits: number[]): string {
  return digits.map((d) => ORDER_DIGITS[d]).join('');
}

/** 两个 62 进制小数逐位相加（最高位在前，短数组右侧补 0，进位从右向左） */
function addFraction(a: number[], b: number[]): number[] {
  const n = Math.max(a.length, b.length);
  const out = new Array<number>(n).fill(0);
  let carry = 0;
  for (let i = n - 1; i >= 0; i--) {
    const ai = i < a.length ? a[i] : 0;
    const bi = i < b.length ? b[i] : 0;
    const s = ai + bi + carry;
    out[i] = s % BASE;
    carry = Math.floor(s / BASE);
  }
  if (carry > 0) out.unshift(carry);
  return out;
}

/** 逐位长除 2；末位有余数则继续补位直到余数归零（保证严格中点） */
function halve(digits: number[]): number[] {
  const out: number[] = [];
  let rem = 0;
  for (let i = 0; i < digits.length; i++) {
    const cur = rem * BASE + digits[i];
    out.push(Math.floor(cur / 2));
    rem = cur % 2;
  }
  while (rem !== 0) {
    const cur = rem * BASE;
    out.push(Math.floor(cur / 2));
    rem = cur % 2;
  }
  return out;
}

/** 去掉前导 0（空操作）与末尾 0（不改变数值） */
function canonicalize(digits: number[]): string {
  let start = 0;
  while (start < digits.length && digits[start] === 0) start++;
  let end = digits.length;
  while (end > start && digits[end - 1] === 0) end--;
  return end <= start ? '' : toDigitsString(digits.slice(start, end));
}

/** 取 (a, b) 开区间中点；a/b 为 null 表示 −∞ / +∞ */
export function between(a: string | null, b: string | null): string {
  const lower = a == null || a === '' ? null : a;
  const upper = b == null || b === '' ? null : b;

  // 非法 / 相等下界：退化为"放在 a 之后"，行为确定
  if (lower !== null && upper !== null && lower >= upper) return between(lower, null);

  const dA = lower === null ? [] : digitsOf(lower);
  const sum = upper === null ? [1, ...dA] : addFraction(dA, digitsOf(upper));
  const result = canonicalize(halve(sum));
  return result === '' ? ORDER_DIGITS[Math.floor(BASE / 2)] : result;
}

/** 追加到末尾：给定当前最大 order，返回严格更大的串 */
export function appendOrder(prev: string | null): string {
  if (prev == null || prev === '') return between(null, null);
  return prev + ORDER_DIGITS[1];
}

/** 重排用：按下标生成递增规范串（固定宽度左补 '0'） */
export function orderForIndex(index: number, width = 4): string {
  const n = Math.max(0, Math.floor(index));
  if (n === 0) return '0'.repeat(width);
  let s = '';
  let v = n;
  while (v > 0) {
    s = ORDER_DIGITS[v % BASE] + s;
    v = Math.floor(v / BASE);
  }
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}
