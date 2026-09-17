import { describe, expect, it } from 'vitest';
import { ensureIconApiPreconnect, iconApiOrigin } from '../web/lib/preconnect';

describe('iconApiOrigin', () => {
  it('从图标服务地址解析出 origin', () => {
    expect(iconApiOrigin('https://api.xinac.net/icon/?url=')).toBe('https://api.xinac.net');
    expect(iconApiOrigin('https://icons.example.com/favicon?domain=')).toBe('https://icons.example.com');
    expect(iconApiOrigin('http://localhost:8080/icon/')).toBe('http://localhost:8080');
  });

  it('解析失败/空值统一返回空串，不产生 undefined / null 字面量', () => {
    expect(iconApiOrigin('')).toBe('');
    expect(iconApiOrigin('not-a-url')).toBe('');
    expect(iconApiOrigin(null)).toBe('');
    expect(iconApiOrigin(undefined)).toBe('');
  });

  it('无 DOM 环境（node）下补充 preconnect 静默返回，不抛错', () => {
    expect(() => ensureIconApiPreconnect('https://api.xinac.net/icon/?url=')).not.toThrow();
  });
});
