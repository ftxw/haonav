import { describe, expect, it } from 'vitest';
import { between, orderForIndex, ORDER_DIGITS } from '../api/order';

describe('order / between', () => {
  it('字符集字典序与数值序一致（0-9A-Za-z 严格递增）', () => {
    for (let i = 1; i < ORDER_DIGITS.length; i++) {
      expect(ORDER_DIGITS.charCodeAt(i)).toBeGreaterThan(ORDER_DIGITS.charCodeAt(i - 1));
    }
  });

  it('(null, null) 有确定结果（0 与 1 的中点 = "V"）', () => {
    expect(between(null, null)).toBe('V');
  });

  it('(null, "") 与 ("", "") 等价于无约束', () => {
    expect(between(null, '')).toBe('V');
    expect(between('', '')).toBe('V');
    expect(between('', null)).toBe('V');
  });

  it('(x, x) 有确定行为：退化为严格大于 x', () => {
    const r = between('V', 'V');
    expect(r > 'V').toBe(true);
  });

  it('文档化的示例值', () => {
    expect(between('1', '2')).toBe('1V');
    expect(between('z', null)).toBe('zV');
    expect(between(null, 'V')).toBe('FV');
    expect(between('V', null)).toBe('kV');
  });

  it('基本区间：a < result < b', () => {
    expect(between(null, null) > '').toBe(true);
    expect(between('1', 'V') > '1' && between('1', 'V') < 'V').toBe(true);
    expect(between('a', 'b') > 'a' && between('a', 'b') < 'b').toBe(true);
  });

  it('随机插入 300 次后仍严格递增', () => {
    const list: string[] = [between(null, null)];
    for (let i = 0; i < 300; i++) {
      const at = Math.floor(Math.random() * list.length);
      const lower = list[at];
      const upper = at + 1 < list.length ? list[at + 1] : null;
      const mid = between(lower, upper);
      expect(mid > lower).toBe(true);
      if (upper !== null) expect(mid < upper).toBe(true);
      list.splice(at + 1, 0, mid);
    }
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1] < list[i]).toBe(true);
    }
  });

  it('orderForIndex 递增且定宽', () => {
    const a = orderForIndex(0);
    const b = orderForIndex(1);
    const c = orderForIndex(61);
    const d = orderForIndex(62);
    expect(a).toBe('0000');
    expect(a < b && b < c && c < d).toBe(true);
    expect(orderForIndex(0).length).toBe(4);
  });
});
