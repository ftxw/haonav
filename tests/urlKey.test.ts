import { describe, expect, it } from 'vitest';
import { normalizeUrl, hostOf } from '../api/urlKey';

describe('urlKey / normalizeUrl', () => {
  it('去末尾斜杠', () => {
    expect(normalizeUrl('https://github.com/')).toBe('https://github.com');
    expect(normalizeUrl('https://github.com/a/b/')).toBe('https://github.com/a/b');
    expect(normalizeUrl('https://github.com')).toBe('https://github.com');
  });

  it('host 小写，path 大小写保留', () => {
    expect(normalizeUrl('https://GitHub.com/Path')).toBe('https://github.com/Path');
  });

  it('剥离追踪参数', () => {
    expect(normalizeUrl('https://a.com/x?utm_source=q&utm_medium=m&id=1')).toBe(
      'https://a.com/x?id=1',
    );
    expect(normalizeUrl('https://a.com/?fbclid=abc&gclid=d&spm=e&from=f&keep=1')).toBe(
      'https://a.com?keep=1',
    );
  });

  it('丢弃 fragment', () => {
    expect(normalizeUrl('https://a.com/x#sec')).toBe('https://a.com/x');
  });

  it('保留端口（非默认）', () => {
    expect(normalizeUrl('https://a.com:8443/x/')).toBe('https://a.com:8443/x');
  });

  it('非法 URL 不抛异常', () => {
    expect(() => normalizeUrl('not a url')).not.toThrow();
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl('  github.com/  ')).toBe('github.com');
  });

  it('同一站点不同写法归一为同一 key', () => {
    const a = normalizeUrl('https://github.com/');
    const b = normalizeUrl('https://GitHub.com');
    const c = normalizeUrl('https://github.com/?utm_source=x');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('hostOf', () => {
    expect(hostOf('https://A.com/x')).toBe('a.com');
    expect(hostOf('nope')).toBe('');
  });
});
