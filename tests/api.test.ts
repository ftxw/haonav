import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
          { t: 'cat.add', cat: { id: 'dev', name: '开发', icon: 'folder', order: 'V' } },
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
          { t: 'cat.add', cat: { id: 'c', name: 'A&B', icon: 'folder', order: 'V' } },
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

describe('api / icon（逐行对齐 workers.js handleIconProxy）', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const imgRes = (): Response =>
    new Response(png, { status: 200, headers: { 'Content-Type': 'image/png' } });

  /** 内存版 caches.default：Node 没有 Cache API，用它验证 HIT/MISS 分支 */
  function installMemCache() {
    const map = new Map<string, { body: ArrayBuffer; status: number; headers: [string, string][] }>();
    const keyOf = (req: any) => String(req?.url ?? req);
    (globalThis as any).caches = {
      default: {
        async match(req: any) {
          const e = map.get(keyOf(req));
          if (!e) return undefined;
          return new Response(e.body, { status: e.status, headers: e.headers });
        },
        async put(req: any, res: Response) {
          map.set(keyOf(req), {
            body: await res.arrayBuffer(),
            status: res.status,
            headers: [...res.headers.entries()] as [string, string][],
          });
        },
      },
    };
    return {
      size: () => map.size,
      /** waitUntil 未被挂起时 cache.put 是浮动的 → 让出事件循环等它落地 */
      flush: () => new Promise((r) => setTimeout(r, 5)),
    };
  }

  let restore: (() => void) | null = null;
  beforeEach(() => {
    const had = 'caches' in globalThis;
    const prev = (globalThis as any).caches;
    restore = () => {
      if (had) (globalThis as any).caches = prev;
      else delete (globalThis as any).caches;
    };
  });
  afterEach(() => restore?.());

  it('缺 url → 400 Missing URL（与 workers.js 一致，不再静默 404）', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/icon');
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('Missing URL');
  });

  it('代理第三方：URL / UA / 响应头全部对齐 workers.js', async () => {
    let called = '';
    let ua = '';
    const { app } = makeApp({}, {}, (async (u: any, init: any) => {
      called = String(u);
      ua = init?.headers?.['User-Agent'] ?? '';
      return imgRes();
    }) as unknown as typeof fetch);
    const res = await app.request(`/api/icon?url=${encodeURIComponent('https://a.com/x')}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(called).toBe(
      `https://api.xinac.net/icon/?url=${encodeURIComponent('https://a.com/x')}`,
    );
    expect(ua).toContain('Chrome/120.0.0.0');
    expect(res.headers.get('cache-control')).toBe('public, max-age=604800, s-maxage=604800');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('x-icon-cache-status')).toBe('MISS');
  });

  it('二次请求命中 caches.default（HIT），上游只打一次，且不写 KV', async () => {
    const mem = installMemCache();
    let n = 0;
    const { app, store } = makeApp({}, {}, (async () => {
      n++;
      return imgRes();
    }) as unknown as typeof fetch);

    const q = `/api/icon?url=${encodeURIComponent('https://b.com/')}`;
    const first = await app.request(q);
    expect(first.headers.get('x-icon-cache-status')).toBe('MISS');
    await first.arrayBuffer();
    await mem.flush();

    const second = await app.request(q);
    expect(second.status).toBe(200);
    expect(second.headers.get('x-icon-cache-status')).toBe('HIT');
    expect(n).toBe(1); // 缓存生效
    expect(mem.size()).toBe(1);
    // 关键回归：图标不再占用 KV 写配额
    expect(await store.getText('nav:icon:b.com')).toBeNull();
  });

  it('上游异常 → 200 + 内联默认 SVG（DEFAULT），不是 404', async () => {
    const { app } = makeApp({}, {}, (async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch);
    const res = await app.request(`/api/icon?url=${encodeURIComponent('https://d.com/')}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(res.headers.get('x-icon-cache-status')).toBe('DEFAULT');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(await res.text()).toContain('<svg');
  });

  it('上游返回非图 → 原样透传（workers.js 不校验 content-type）', async () => {
    const { app } = makeApp({}, {}, (async () =>
      new Response('nope', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })) as unknown as typeof fetch);
    const res = await app.request(`/api/icon?url=${encodeURIComponent('https://c.com/')}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html');
  });

  it('无 ExecutionContext 时不得 500（Hono 的 c.executionCtx 是雷）', async () => {
    // 回归：Hono 的 c.executionCtx 是 getter，没有 ExecutionContext 时**主动抛异常**
    // （"This context has no ExecutionContext"），不是返回 undefined。
    // 早期版本 runLater() 直接读它 → 整个 handler 500；且异常被吞后 cache.put 失去
    // waitUntil 保护 → 表现为「永远 MISS」。这里锁死：拿不到就报 no，绝不能 500。
    const { app } = makeApp({}, {}, (async () => imgRes()) as unknown as typeof fetch);
    const res = await app.request(`/api/icon?url=${encodeURIComponent('https://e.com/')}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-icon-waituntil')).toBe('no');
    expect(res.headers.get('x-icon-cache-put')).toBe('no-cache-api');
  });

  it('不判私网：本处理器只跟 api.xinac.net 通信，从不直连 targetUrl', async () => {
    let called = '';
    const { app } = makeApp({}, {}, (async (u: any) => {
      called = String(u);
      return imgRes();
    }) as unknown as typeof fetch);
    const res = await app.request(`/api/icon?url=${encodeURIComponent('http://127.0.0.1/')}`);
    expect(res.status).toBe(200);
    // 请求打给的是 xinac，127.0.0.1 只是编码后的查询参数
    expect(called.startsWith('https://api.xinac.net/icon/?url=')).toBe(true);
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

describe('api / 删除快照', () => {
  async function seedTwo() {
    let t = 1_000;
    const { app, store } = makeApp(undefined, { now: () => t });
    const cookie = await login(app);
    const h = { 'content-type': 'application/json', cookie };
    await app.request('/api/backup/snapshot', { method: 'POST', headers: h });
    t = 2_000;
    await app.request('/api/backup/snapshot', { method: 'POST', headers: h });
    return { app, store, cookie, h };
  }

  it('无会话 → 401', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/backup/snapshot', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'nav:snap:x' }),
    });
    expect(res.status).toBe(401);
  });

  it('key 非快照前缀 → 400（防误删其它 KV key）', async () => {
    const { app, cookie } = await seedTwo();
    const res = await app.request('/api/backup/snapshot', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ key: 'haonav_links' }),
    });
    expect(res.status).toBe(400);
  });

  it('删除成功：返回剩余份数，列表与正文同步移除', async () => {
    const { app, store, cookie } = await seedTwo();
    const target = 'nav:snap:' + new Date(1_000).toISOString();

    const res = await app.request('/api/backup/snapshot', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ key: target }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, count: 1 });

    // 正文真的被删了
    expect(await store.getText(target)).toBeNull();
    // 列表同步
    const list = await (await app.request('/api/backup/snapshots', { headers: { cookie } })).json();
    expect(list.snapshots.length).toBe(1);
    expect(list.snapshots[0].key).not.toBe(target);
  });

  it('手动删除不受 retention 限制', async () => {
    const { app, cookie } = await seedTwo();
    // retention=1 时自动滚动只留 1 份；此处显式删 1 份应成功而不是被 retention 拦下
    const target = 'nav:snap:' + new Date(1_000).toISOString();
    const res = await app.request('/api/backup/snapshot', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ key: target }),
    });
    expect(res.status).toBe(200);
  });

  it('不存在的快照 → 404 且不改动索引', async () => {
    const { app, cookie } = await seedTwo();
    const res = await app.request('/api/backup/snapshot', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ key: 'nav:snap:1970-01-01T00:00:00.000Z' }),
    });
    expect(res.status).toBe(404);
    const list = await (await app.request('/api/backup/snapshots', { headers: { cookie } })).json();
    expect(list.snapshots.length).toBe(2);
  });

  it('POST /api/backup/snapshot/delete 别名同样可用', async () => {
    const { app, cookie } = await seedTwo();
    const target = 'nav:snap:' + new Date(2_000).toISOString();
    const res = await app.request('/api/backup/snapshot/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ key: target }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(1);
  });
});
