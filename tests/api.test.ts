import { describe, expect, it } from 'vitest';
import { createApp, type ServerConfig } from '../api/core';
import { createMemoryStore } from '../api/store';
import { createRateLimiter } from '../api/auth';
import type { Doc, LinkItem } from '../shared/types';

function makeApp(
  seed?: Record<string, string>,
  configOverride: Partial<ServerConfig> = {},
  fetchImpl?: typeof fetch,
) {
  const store = createMemoryStore(seed);
  const app = createApp({
    store,
    config: {
      adminPassword: 'pw',
      sessionSecret: 'unit-secret',
      platform: 'dev',
      loginDelayMs: 0,
      secureCookies: false,
      ...configOverride,
      ...(fetchImpl ? { fetchImpl } : {}),
    },
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
  const cookie = res.headers.get('set-cookie') || '';
  expect(cookie).toContain('HttpOnly');
  return cookie.split(';')[0];
}

function newLink(over: Partial<LinkItem> = {}): LinkItem {
  return {
    id: 'l1',
    title: 'GitHub',
    url: 'https://github.com',
    urlKey: 'https://github.com',
    cat: 'dev',
    order: 'V',
    createdAt: 1,
    ...over,
  };
}

describe('api / health & data', () => {
  it('health 返回平台标识', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.platform).toBe('dev');
  });

  it('GET /api/data 公开可读，返回最小空文档 + ETag', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/data');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-cache');
    const etag = res.headers.get('etag');
    expect(etag).toBeTruthy();
    const doc = (await res.json()) as Doc;
    expect(doc.schemaVersion).toBe(1);
    expect(doc.links).toEqual([]);

    // If-None-Match 命中 → 304，空响应体
    const res304 = await app.request('/api/data', { headers: { 'if-none-match': etag! } });
    expect(res304.status).toBe(304);
    expect(await res304.text()).toBe('');
  });
});

describe('api / auth', () => {
  it('错误密码 → 401 统一消息', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'nope' }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('密码错误');
  });

  it('无会话写 → 401', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/data', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rev: 0, ops: [] }),
    });
    expect(res.status).toBe(401);
  });

  it('跨站写 → 403', async () => {
    const { app } = makeApp();
    const cookie = await login(app);
    const res = await app.request('/api/data', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie, origin: 'https://evil.example' },
      body: JSON.stringify({ rev: 0, ops: [] }),
    });
    expect(res.status).toBe(403);
  });

  it('logout 清 cookie', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/logout', { method: 'POST' });
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});

describe('api / PATCH 乐观并发', () => {
  it('合法 op → 应用并 rev+1', async () => {
    const { app } = makeApp();
    const cookie = await login(app);
    const res = await app.request('/api/data', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        rev: 0,
        ops: [
          { t: 'cat.add', cat: { id: 'dev', name: '开发', icon: { type: 'letter' }, order: 'V' } },
          { t: 'link.add', link: newLink() },
        ],
      }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).rev).toBe(1);

    const doc = (await (await app.request('/api/data')).json()) as Doc;
    expect(doc.rev).toBe(1);
    expect(doc.links.length).toBe(1);
    expect(doc.links[0].urlKey).toBe('https://github.com');
  });

  it('rev 不匹配 → 409 且返回服务端最新文档', async () => {
    const { app } = makeApp();
    const cookie = await login(app);
    await app.request('/api/data', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ rev: 0, ops: [{ t: 'link.add', link: newLink() }] }),
    });
    const res = await app.request('/api/data', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ rev: 0, ops: [{ t: 'link.delete', id: 'l1' }] }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.rev).toBe(1);
    expect(body.doc.links.length).toBe(1);
  });

  it('非法 op → 400，不落库', async () => {
    const { app } = makeApp();
    const cookie = await login(app);
    const res = await app.request('/api/data', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ rev: 0, ops: [{ t: 'link.delete', id: 'missing' }] }),
    });
    expect(res.status).toBe(400);
    const doc = (await (await app.request('/api/data')).json()) as Doc;
    expect(doc.rev).toBe(0);
  });

  it('link.update 改 url 会重算 urlKey', async () => {
    const { app } = makeApp();
    const cookie = await login(app);
    await app.request('/api/data', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ rev: 0, ops: [{ t: 'link.add', link: newLink() }] }),
    });
    await app.request('/api/data', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        rev: 1,
        ops: [{ t: 'link.update', id: 'l1', patch: { url: 'https://gitlab.com/' } }],
      }),
    });
    const doc = (await (await app.request('/api/data')).json()) as Doc;
    expect(doc.links[0].urlKey).toBe('https://gitlab.com');
  });
});

describe('api / 导入', () => {
  it('parse 分类 added / existing / conflict', async () => {
    const { app } = makeApp();
    const cookie = await login(app);
    await app.request('/api/data', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ rev: 0, ops: [{ t: 'link.add', link: newLink() }] }),
    });
    const res = await app.request('/api/import/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        items: [
          { title: 'GitHub', url: 'https://github.com', cat: 'dev' }, // existing（标题分类都同）
          { title: 'GitHub Renamed', url: 'https://github.com' }, // conflict（标题不同）
          { title: 'New', url: 'https://new.example' }, // added
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.counts.added).toBe(1);
    expect(body.counts.existing).toBe(1);
    expect(body.counts.conflict).toBe(1);
  });

  it('apply 追加到末尾并 rev+1，重复 urlKey 跳过', async () => {
    const { app } = makeApp();
    const cookie = await login(app);
    const res = await app.request('/api/import/apply', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        rev: 0,
        items: [
          { title: 'A', url: 'https://a.example' },
          { title: 'B', url: 'https://b.example' },
          { title: 'A dup', url: 'https://a.example/' },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.added).toBe(2);
    const doc = (await (await app.request('/api/data')).json()) as Doc;
    expect(doc.links.length).toBe(2);
    expect(doc.links[0].order < doc.links[1].order).toBe(true);
  });
});

describe('api / 导出', () => {
  it('html → Netscape 格式且正确转义', async () => {
    const { app } = makeApp();
    const cookie = await login(app);
    await app.request('/api/data', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        rev: 0,
        ops: [
          { t: 'cat.add', cat: { id: 'c', name: 'A&B', icon: { type: 'letter' }, order: 'V' } },
          {
            t: 'link.add',
            link: newLink({ id: 'x', title: 'A <B> "C"', url: 'https://a.example/?a=1&b=2', cat: 'c' }),
          },
        ],
      }),
    });
    const res = await app.request('/api/export?format=html', { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const text = await res.text();
    expect(text).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
    expect(text).toContain('A &lt;B&gt; &quot;C&quot;');
    expect(text).toContain('A&amp;B');
    expect(text).toContain('&amp;b=2');
  });

  it('json → 完整文档', async () => {
    const { app } = makeApp();
    const cookie = await login(app);
    const res = await app.request('/api/export?format=json', { headers: { cookie } });
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.schemaVersion).toBe(1);
  });

  it('无会话导出 → 401', async () => {
    const { app } = makeApp();
    expect((await app.request('/api/export?format=json')).status).toBe(401);
  });
});

describe('api / 快照', () => {
  it('snapshot → restore，恢复后 rev = 当前 rev + 1', async () => {
    const { app } = makeApp();
    const cookie = await login(app);
    const h = { 'content-type': 'application/json', cookie };

    await app.request('/api/data', {
      method: 'PATCH',
      headers: h,
      body: JSON.stringify({ rev: 0, ops: [{ t: 'link.add', link: newLink() }] }),
    });
    const snapRes = await app.request('/api/backup/snapshot', { method: 'POST', headers: h });
    expect(snapRes.status).toBe(200);
    const snap = await snapRes.json();
    expect(snap.key.startsWith('nav:snap:')).toBe(true);

    // 删除链接 → rev 2
    await app.request('/api/data', {
      method: 'PATCH',
      headers: h,
      body: JSON.stringify({ rev: 1, ops: [{ t: 'link.delete', id: 'l1' }] }),
    });
    expect(((await (await app.request('/api/data')).json()) as Doc).links.length).toBe(0);

    const restoreRes = await app.request('/api/backup/restore', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ key: snap.key }),
    });
    expect(restoreRes.status).toBe(200);
    expect((await restoreRes.json()).rev).toBe(3);

    const doc = (await (await app.request('/api/data')).json()) as Doc;
    expect(doc.rev).toBe(3);
    expect(doc.links.length).toBe(1);
  });

  it('restore 非法 key → 400', async () => {
    const { app } = makeApp();
    const cookie = await login(app);
    const res = await app.request('/api/backup/restore', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ key: 'haonav_links' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('api / icon SSRF', () => {
  it('未登记域名 → 404（不发起网络请求）', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/icon?u=not-registered.example&v=1');
    expect(res.status).toBe(404);
  });

  it('私网字面量 → 404', async () => {
    const { app } = makeApp();
    expect((await app.request('/api/icon?u=127.0.0.1')).status).toBe(404);
    expect((await app.request('/api/icon?u=10.0.0.1')).status).toBe(404);
    expect((await app.request('/api/icon?u=localhost')).status).toBe(404);
  });
});

describe('api / 快照列表', () => {
  it('无会话 → 401', async () => {
    const { app } = makeApp();
    expect((await app.request('/api/backup/snapshots')).status).toBe(401);
  });

  it('返回 {snapshots}，按 at 倒序，字段 key/at/size', async () => {
    let t = 1_000;
    const { app } = makeApp(undefined, { now: () => t });
    const cookie = await login(app);
    const h = { 'content-type': 'application/json', cookie };

    await app.request('/api/backup/snapshot', { method: 'POST', headers: h });
    t = 2_000;
    await app.request('/api/backup/snapshot', { method: 'POST', headers: h });

    const res = await app.request('/api/backup/snapshots', { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.snapshots)).toBe(true);
    expect(body.snapshots.length).toBe(2);
    // 新 → 旧
    expect(body.snapshots[0].at).toBeGreaterThan(body.snapshots[1].at);
    for (const s of body.snapshots) {
      expect(typeof s.key).toBe('string');
      expect(typeof s.at).toBe('number');
      expect(typeof s.size).toBe('number');
      expect(String(s.key).startsWith('nav:snap:')).toBe(true);
    }
  });

  it('空索引 → 空数组', async () => {
    const { app } = makeApp();
    const cookie = await login(app);
    const res = await app.request('/api/backup/snapshots', { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ snapshots: [] });
  });
});

describe('api / 死链探测', () => {
  const fakeFetch = (async (url: string) => {
    if (url.startsWith('https://ok.example')) return new Response(null, { status: 200 });
    if (url.startsWith('https://moved.example')) {
      return new Response(null, { status: 301, headers: { location: '/x' } });
    }
    if (url.startsWith('https://gone.example')) return new Response(null, { status: 404 });
    if (url.startsWith('https://boom.example')) return new Response(null, { status: 503 });
    throw new Error('network fail'); // DNS 失败 / 超时
  }) as unknown as typeof fetch;

  it('无会话 → 401', async () => {
    const { app } = makeApp(undefined, {}, fakeFetch);
    const res = await app.request('/api/check/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ urls: ['https://ok.example'] }),
    });
    expect(res.status).toBe(401);
  });

  it('> 20 条 → 400', async () => {
    const { app } = makeApp(undefined, {}, fakeFetch);
    const cookie = await login(app);
    const res = await app.request('/api/check/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        urls: Array.from({ length: 21 }, (_, i) => `https://h${i}.example`),
      }),
    });
    expect(res.status).toBe(400);
  });

  it('urls 非数组 → 400', async () => {
    const { app } = makeApp(undefined, {}, fakeFetch);
    const cookie = await login(app);
    const res = await app.request('/api/check/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ urls: 'https://ok.example' }),
    });
    expect(res.status).toBe(400);
  });

  it('按入参顺序返回；2xx/3xx ok，4xx/5xx/超时/非法/私网 不可达', async () => {
    const { app } = makeApp(undefined, {}, fakeFetch);
    const cookie = await login(app);
    const res = await app.request('/api/check/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        urls: [
          'https://gone.example/',
          'not a url',
          'https://127.0.0.1/',
          'https://ok.example/',
          'https://moved.example/',
          'https://boom.example/',
          'https://timeout.example/',
        ],
      }),
    });
    expect(res.status).toBe(200);
    const { results } = await res.json();
    expect(results).toEqual([
      { url: 'https://gone.example/', ok: false, status: 404 },
      { url: 'not a url', ok: false },
      { url: 'https://127.0.0.1/', ok: false },
      { url: 'https://ok.example/', ok: true, status: 200 },
      { url: 'https://moved.example/', ok: true, status: 301 },
      { url: 'https://boom.example/', ok: false, status: 503 },
      { url: 'https://timeout.example/', ok: false },
    ]);
  });

  it('ftp / javascript 协议 → 不可达（不发请求）', async () => {
    const { app } = makeApp(undefined, {}, fakeFetch);
    const cookie = await login(app);
    const res = await app.request('/api/check/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ urls: ['ftp://a.example', 'javascript:alert(1)'] }),
    });
    expect(res.status).toBe(200);
    const { results } = await res.json();
    expect(results).toEqual([
      { url: 'ftp://a.example', ok: false },
      { url: 'javascript:alert(1)', ok: false },
    ]);
  });
});
