import { describe, expect, it } from 'vitest';
import { createApp, type ServerConfig } from '../api/core';
import { createMemoryStore } from '../api/store';
import { createRateLimiter } from '../api/auth';
import { normalizeUrl, hostOf } from '../api/urlKey';

/**
 * 回归：normalizeUrl 不得依赖 URLSearchParams 的迭代器协议。
 *
 * 线上事故：EdgeOne 的 V8 运行时未给 URLSearchParams 实现 Symbol.iterator，
 * 而 `for (const [k, v] of params)` 会在迭代「之前」先查迭代器 —— 于是哪怕 URL
 * 一个查询参数都没有（0 次迭代）也立刻抛 "is not iterable"，把整条 link.add
 * 打成 400「操作应用失败：.for is not iterable」（压缩后变量名为 .for）。
 */

function makeApp(seed?: Record<string, string>) {
  const store = createMemoryStore(seed);
  const app = createApp({
    store,
    config: {
      adminPassword: 'pw',
      sessionSecret: 'unit-secret',
      platform: 'dev',
      loginDelayMs: 0,
      secureCookies: false,
    } as ServerConfig,
    limiter: createRateLimiter(10_000),
  });
  return { app, store };
}

async function login(app: ReturnType<typeof makeApp>['app']): Promise<string> {
  const res = await app.request('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'pw' }),
  });
  expect(res.status).toBe(200);
  return (res.headers.get('set-cookie') || '').split(';')[0];
}

/** 在 fn 执行期间摘掉 URLSearchParams 的 Symbol.iterator，模拟 EdgeOne 运行时 */
async function withoutSearchParamsIterator<T>(fn: () => Promise<T>): Promise<T> {
  const proto = URLSearchParams.prototype as any;
  const orig = proto[Symbol.iterator];
  delete proto[Symbol.iterator];
  try {
    return await fn();
  } finally {
    proto[Symbol.iterator] = orig; // 必须还原，否则污染其它用例
  }
}

describe('normalizeUrl 基础行为', () => {
  it('去末尾斜杠，根路径归一', () => {
    expect(normalizeUrl('https://a.com/')).toBe('https://a.com');
    expect(normalizeUrl('https://a.com')).toBe('https://a.com');
    expect(normalizeUrl('https://a.com/x/')).toBe('https://a.com/x');
  });

  it('host 小写、保留端口', () => {
    expect(normalizeUrl('https://A.com/X')).toBe('https://a.com/X');
    expect(normalizeUrl('https://a.com:8443/x')).toBe('https://a.com:8443/x');
  });

  it('剥离追踪参数（utm_* / fbclid / gclid 等）', () => {
    expect(normalizeUrl('https://a.com/p?utm_source=x&keep=1')).toBe('https://a.com/p?keep=1');
    expect(normalizeUrl('https://a.com/p?fbclid=zz&keep=1')).toBe('https://a.com/p?keep=1');
    expect(normalizeUrl('https://a.com/p?a=1&b=2')).toBe('https://a.com/p?a=1&b=2');
  });

  it('非法 URL 不抛异常', () => {
    expect(() => normalizeUrl('not a url')).not.toThrow();
    expect(normalizeUrl('')).toBe('');
  });

  it('hostOf 取小写域名，非法返回空串', () => {
    expect(hostOf('https://A.com/x')).toBe('a.com');
    expect(hostOf('bad')).toBe('');
  });
});

describe('无 URLSearchParams 迭代器时仍可用（EdgeOne 回归）', () => {
  it('normalizeUrl 对无查询串的 URL 不抛异常', async () => {
    await withoutSearchParamsIterator(async () => {
      expect(() => normalizeUrl('https://cloudflare.com')).not.toThrow();
      expect(normalizeUrl('https://cloudflare.com')).toBe('https://cloudflare.com');
    });
  });

  it('normalizeUrl 对带查询串的 URL 不抛异常', async () => {
    await withoutSearchParamsIterator(async () => {
      expect(() => normalizeUrl('https://a.com/p?utm_source=x&keep=1')).not.toThrow();
    });
  });

  it('link.add 不再 400（线上「.for is not iterable」回归）', async () => {
    await withoutSearchParamsIterator(async () => {
      const { app } = makeApp({
        'nav:v1': JSON.stringify({
          schemaVersion: 1,
          rev: 1,
          updatedAt: 0,
          settings: {},
          categories: [{ id: 'c1', name: 'Cat', order: 'V' }],
          links: [],
        }),
      });
      const cookie = await login(app);
      const res = await app.request('/api/data', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          rev: 1,
          ops: [
            {
              t: 'link.add',
              link: {
                id: '2ca704b6-2205-49a5-8692-acd57ae6162f',
                title: 'cloudflare',
                url: 'https://cloudflare.com',
                urlKey: '',
                cat: 'c1',
                order: 'V',
                createdAt: 1789366753359,
              },
            },
          ],
        }),
      });
      const body = (await res.json()) as Record<string, unknown>;
      expect(res.status).toBe(200);
      expect(body.rev).toBe(2);
    });
  });
});
