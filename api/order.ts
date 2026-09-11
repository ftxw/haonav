/**
 * base-62 有序字符串（fractional indexing，非完整 LexoRank）。
 *
 * 用途：拖动排序只写被拖动的**那一个**元素（1 次 KV 写），不重排整个数组。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 算法（前端 web/lib/order.ts 必须实现一份等价的，两份结果必须兼容）
 * ────────────────────────────────────────────────────────────────────────
 *
 * 字符集：'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
 *   注意其 ASCII 码严格递增（'0'-'9' < 'A'-'Z' < 'a'-'z'），
 *   因此**字符串字典序 == 数值序**（对规范串而言，见下）。
 *
 * 一个有序串 s 表示 [0,1) 区间内的一个 62 进制小数：
 *   value(s) = Σ d_i · 62^(−(i+1))   （d_i 为第 i 位字符的索引）
 *
 * 约定：
 *   - `null` 作为下界 = −∞（0）；作为上界 = +∞（1）
 *   - `''`（空串）视为与 null 等价（"无约束"），这样 (null,'')、('','') 等
 *     边界都有确定行为，不会产生"没有合法结果"的死角
 *   - 若 a、b 均非空且 a >= b（输入非法 / 相等），退化为 between(a, null)：
 *     结果一定 > a，行为确定
 *
 * between(a, b) 的计算：
 *   1. 把 a、b 转成 62 进制数字数组（表示小数部分）
 *   2. sum = a + b（逐位相加带进位；b 为 +∞ 时 sum = 1 + a，即数组前置 1）
 *   3. result = sum / 2（逐位长除；末位有余数则补一位直到余数为 0）
 *   4. 规范化：去掉前导 0 与末尾 0（前导 0 是空操作；末尾 0 不改变数值，
 *      去掉后仍是规范串，而规范串上"字典序 == 数值序"，故 a < result < b 成立）
 *
 * 已知边界与期望：
 *   between(null, null) = 'V'              （0 与 1 的中点 = 0.5 → 31 → 'V'）
 *   between('1', '2')   = '1V'
 *   between('z', null)  = 'zV'             （严格 > 'z'）
 *   between(null, 'V')  = 'FV'
 *   between('V', null)  = 'kV'
 *
 * 不需要完整 LexoRank 的桶平衡：极端情况下相邻两串确实插不进中间值时，
 * 由调用方做一次**该分类内**的重排（改多条，仍占 1 次 KV 写，不影响 rev 语义）。
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

/**
 * 两个小数逐位相加，带进位。
 * ⚠️ 两个数组都从**最高位**（62^-1，下标 0）开始，因此短数组要在**右侧**
 *    （低位）补 0，进位则从右向左传播。
 */
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
  if (carry > 0) out.unshift(carry); // 进位 = 整数位（数值可 ≥ 1）
  return out;
}

/** 逐位长除 2；末位有余数时继续补位直到余数归零（保证严格中点） */
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

/** 去掉前导 0（空操作）与末尾 0（不改变数值），得到规范串 */
function canonicalize(digits: number[]): string {
  let start = 0;
  while (start < digits.length && digits[start] === 0) start++;
  let end = digits.length;
  while (end > start && digits[end - 1] === 0) end--;
  if (end <= start) return ''; // 全 0
  return toDigitsString(digits.slice(start, end));
}

export function between(a: string | null, b: string | null): string {
  const lower = a == null || a === '' ? null : a;
  const upper = b == null || b === '' ? null : b;

  // 非法 / 相等下界：退化为"放在 a 之后"
  if (lower !== null && upper !== null && lower >= upper) {
    return between(lower, null);
  }

  const dA = lower === null ? [] : digitsOf(lower);
  let sum: number[];
  if (upper === null) {
    // +∞：sum = 1 + a
    sum = [1, ...dA];
  } else {
    sum = addFraction(dA, digitsOf(upper));
  }

  const result = canonicalize(halve(sum));
  // 兜底：正常路径不会走到这里
  return result === '' ? ORDER_DIGITS[Math.floor(BASE / 2)] : result;
}

/**
 * 迁移用：按数组下标生成递增的规范有序串。
 * 固定宽度左补 '0'，保证字典序与下标序一致（宽度 4 → 支持 62^4 ≈ 1,477 万条）。
 */
export function orderForIndex(index: number, width = 4): string {
  let n = Math.max(0, Math.floor(index));
  if (n === 0) return '0'.repeat(width);
  let s = '';
  while (n > 0) {
    s = ORDER_DIGITS[n % BASE] + s;
    n = Math.floor(n / BASE);
  }
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}

/** 追加到末尾：给定当前最大 order，返回一个严格更大的串 */
export function appendOrder(prev: string | null): string {
  if (prev == null || prev === '') return between(null, null);
  return prev + ORDER_DIGITS[1];
}
