import { describe, expect, it } from 'vitest';
import { createApp, type ServerConfig } from '../api/core';
import { createMemoryStore } from '../api/store';
import { createRateLimiter } from '../api/auth';

/**
 * 回归测试：陈旧/半损坏文档的「自愈」能力。
 *
 * 背景：线上曾出现 PATCH 400「.for is not iterable」—— 服务端拿到的 KV 文档
 * 顶层缺 `links`/`categories` 数组时，applyOps 对 undefined 做迭代直接崩，
 * 且被 catch-all 吞成黑盒。现在 readDocForWrite 会先补齐顶层结构再校验，
 * 这类老格式数据不再把写接口拖死。
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

function docWith(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    rev: 0,
    updatedAt: 0,
    settings: {},
    categories: [] as unknown[],
    links: [] as unknown[],
    ...over,
  };
}

async function patch(app: ReturnType<typeof makeApp>['app'], cookie: string, ops: unknown[]) {
  const res = await app.request('/api/data', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ rev: 0, ops }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('陈旧文档自愈', () => {
  it('links 缺失时 PATCH 仍成功（不再 500/400 崩溃）', async () => {
    const { app } = makeApp({ 'nav:v1': JSON.stringify(docWith({ links: undefined })) });
    const cookie = await login(app);
    const r = await patch(app, cookie, [{ t: 'settings.update', patch: { name: 'X' } }]);
    expect(r.status).toBe(200);
    expect(r.body.rev).toBe(1);
  });

  it('categories 缺失时 PATCH 仍成功', async () => {
    const { app } = makeApp({ 'nav:v1': JSON.stringify(docWith({ categories: undefined })) });
    const cookie = await login(app);
    const r = await patch(app, cookie, [{ t: 'settings.update', patch: { name: 'Y' } }]);
    expect(r.status).toBe(200);
  });

  it('settings 为 null 时 PATCH 仍成功', async () => {
    const { app } = makeApp({ 'nav:v1': JSON.stringify(docWith({ settings: null })) });
    const cookie = await login(app);
    const r = await patch(app, cookie, [{ t: 'settings.update', patch: { name: 'Z' } }]);
    expect(r.status).toBe(200);
  });

  it('修复后写入的文档结构完整（links/categories 是数组）', async () => {
    const { app, store } = makeApp({ 'nav:v1': JSON.stringify(docWith({ links: undefined })) });
    const cookie = await login(app);
    await patch(app, cookie, [{ t: 'settings.update', patch: { name: 'X' } }]);
    const saved = JSON.parse((await store.getText('nav:v1')) || '{}');
    expect(Array.isArray(saved.links)).toBe(true);
    expect(Array.isArray(saved.categories)).toBe(true);
    expect(saved.settings && typeof saved.settings).toBe('object');
  });

  it('link.add 携带自定义 icon 正常落库（图标链路回归）', async () => {
    const { app } = makeApp({ 'nav:v1': JSON.stringify(docWith()) });
    const cookie = await login(app);
    const r = await patch(app, cookie, [
      {
        t: 'link.add',
        link: { title: 'B', url: 'https://b.com', icon: 'https://b.com/f.ico', cat: '', desc: null },
      },
    ]);
    expect(r.status).toBe(200);
  });
});
