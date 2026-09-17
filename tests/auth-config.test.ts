/**
 * 生产鉴权配置强度校验（fail-closed）回归测试。
 *
 * 覆盖历史漏洞：`configFromEnv` 读不到 env 时 adminPassword = undefined，
 * `/api/login` 退化成 `constantTimeEqual('', '')` → **空密码直接登录成功**。
 *
 * 修复分两层：
 *  1. `verifyPasswordAgainstConfig` 未配置密码时一律返回 false（auth.ts）
 *  2. 生产平台配置缺失/过弱时 `/api/login` 与 `requireSession` 返回 503（core.ts）
 */
import { describe, expect, it } from 'vitest';
import {
  createApp,
  configFromEnv,
  validateAuthConfig,
  MIN_SESSION_SECRET_LENGTH,
  DEV_DEFAULT_PASSWORD,
  DEV_DEFAULT_SESSION_SECRET,
  type ServerConfig,
} from '../api/core';
import { createMemoryStore } from '../api/store';
import { createRateLimiter, verifyPasswordAgainstConfig } from '../api/auth';

/** 一条足够强的会话密钥（64 字符，等同 `openssl rand -hex 32` 的长度） */
const STRONG_SECRET = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

function makeApp(platform: string, over: Partial<ServerConfig> = {}) {
  const store = createMemoryStore();
  const app = createApp({
    store,
    config: {
      platform,
      loginDelayMs: 0,
      secureCookies: false,
      ...over,
    } as ServerConfig,
    limiter: createRateLimiter(10_000),
  });
  return { app, store };
}

function login(app: ReturnType<typeof makeApp>['app'], password: string) {
  return app.request('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

describe('validateAuthConfig / 纯函数判定', () => {
  it('密码与哈希都未配置 → 不通过', () => {
    const r = validateAuthConfig({ sessionSecret: STRONG_SECRET, platform: 'edgeone' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('未配置管理员密码');
  });

  it('adminPassword 为空串（等价未配置）→ 不通过', () => {
    const r = validateAuthConfig({ adminPassword: '', sessionSecret: STRONG_SECRET, platform: 'edgeone' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('未配置管理员密码');
  });

  it('passwordHash 缺 pepper → 视为未配置密码', () => {
    const r = validateAuthConfig({ passwordHash: 'deadbeef', sessionSecret: STRONG_SECRET, platform: 'edgeone' });
    expect(r.ok).toBe(false);
  });

  it('passwordHash + pepper（无明文）→ 通过', () => {
    const r = validateAuthConfig({
      passwordHash: 'deadbeef',
      pepper: 'pep',
      sessionSecret: STRONG_SECRET,
      platform: 'edgeone',
    });
    expect(r.ok).toBe(true);
  });

  it('sessionSecret 缺失 → 不通过', () => {
    const r = validateAuthConfig({ adminPassword: 'pw', sessionSecret: '', platform: 'edgeone' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('HAONAV_SESSION_SECRET');
  });

  it('sessionSecret 过短 → 不通过（含实际长度提示）', () => {
    const short = 'x'.repeat(MIN_SESSION_SECRET_LENGTH - 1);
    const r = validateAuthConfig({ adminPassword: 'pw', sessionSecret: short, platform: 'edgeone' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('过短');
  });

  it('sessionSecret === 长度阈值 → 通过', () => {
    const r = validateAuthConfig({
      adminPassword: 'pw',
      sessionSecret: 'x'.repeat(MIN_SESSION_SECRET_LENGTH),
      platform: 'edgeone',
    });
    expect(r.ok).toBe(true);
  });

  it('sessionSecret 等于 dev 默认值 → 不通过', () => {
    const r = validateAuthConfig({
      adminPassword: 'pw',
      sessionSecret: DEV_DEFAULT_SESSION_SECRET,
      platform: 'edgeone',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('开发默认值');
  });

  it('adminPassword 等于 dev 默认值 → 不通过', () => {
    const r = validateAuthConfig({
      adminPassword: DEV_DEFAULT_PASSWORD,
      sessionSecret: STRONG_SECRET,
      platform: 'edgeone',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('开发默认值');
  });

  it('完整强配置 → 通过', () => {
    const r = validateAuthConfig({ adminPassword: 'S3cure!pw', sessionSecret: STRONG_SECRET, platform: 'edgeone' });
    expect(r.ok).toBe(true);
  });
});

describe('verifyPasswordAgainstConfig / fail-closed（第一层）', () => {
  it('未配置任何密码 → 即使输入为空串也必须 false', async () => {
    expect(await verifyPasswordAgainstConfig('', {})).toBe(false);
    expect(await verifyPasswordAgainstConfig('', { adminPassword: undefined })).toBe(false);
    expect(await verifyPasswordAgainstConfig('', { adminPassword: '' })).toBe(false);
  });

  it('已配密码时，空输入不匹配', async () => {
    expect(await verifyPasswordAgainstConfig('', { adminPassword: 'pw' })).toBe(false);
  });
});

describe('生产平台 /api/login 拒绝弱配置（第二层，fail-closed）', () => {
  it('⭐ 未配置密码 + 提交空密码 → 必须 503，绝不能 200', async () => {
    // 这正是历史漏洞的利用路径
    const { app } = makeApp('edgeone', { sessionSecret: STRONG_SECRET });
    const res = await login(app, '');
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain('拒绝登录');
    expect(body.detail).toContain('未配置管理员密码');
  });

  it('未配置密码 + 提交任意非空密码 → 也是 503（配置错误先于密码判定）', async () => {
    const { app } = makeApp('edgeone', { sessionSecret: STRONG_SECRET });
    const res = await login(app, 'whatever');
    expect(res.status).toBe(503);
  });

  it('sessionSecret 过短 → 登录 503', async () => {
    const { app } = makeApp('edgeone', { adminPassword: 'pw', sessionSecret: 'too-short' });
    const res = await login(app, 'pw');
    expect(res.status).toBe(503);
    expect((await res.json()).detail).toContain('过短');
  });

  it('sessionSecret 等于 dev 默认值 → 登录 503', async () => {
    const { app } = makeApp('edgeone', { adminPassword: 'pw', sessionSecret: DEV_DEFAULT_SESSION_SECRET });
    const res = await login(app, 'pw');
    expect(res.status).toBe(503);
  });

  it('cloudflare 平台同样 fail-closed', async () => {
    const { app } = makeApp('cloudflare', { sessionSecret: STRONG_SECRET });
    expect((await login(app, '')).status).toBe(503);
  });

  it('requireSession：弱配置下 /api/session → 503', async () => {
    const { app } = makeApp('edgeone', { sessionSecret: 'short' });
    const res = await app.request('/api/session');
    expect(res.status).toBe(503);
  });

  it('弱配置不影响公开只读路由 /api/data', async () => {
    const { app } = makeApp('edgeone', { sessionSecret: 'short' });
    const res = await app.request('/api/data');
    expect(res.status).toBe(200);
    expect((await res.json()).links).toEqual([]);
  });

  it('完整强配置 → 正确密码登录 200，错误密码 401（回归）', async () => {
    const { app } = makeApp('edgeone', { adminPassword: 'S3cure!pw', sessionSecret: STRONG_SECRET });
    const ok = await login(app, 'S3cure!pw');
    expect(ok.status).toBe(200);
    expect((await ok.json()).ok).toBe(true);
    expect(ok.headers.get('set-cookie')).toContain('HttpOnly');

    const bad = await login(app, 'nope');
    expect(bad.status).toBe(401);
  });
});

describe('dev 平台不受影响（回归）', () => {
  it('dev 用弱默认值仍可登录', async () => {
    const { app } = makeApp('dev', {
      adminPassword: DEV_DEFAULT_PASSWORD,
      sessionSecret: DEV_DEFAULT_SESSION_SECRET,
    });
    const res = await login(app, DEV_DEFAULT_PASSWORD);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});

describe('configFromEnv / enforceAuthConfig 默认值', () => {
  it('生产平台默认开启校验', () => {
    expect(configFromEnv({}, 'edgeone').enforceAuthConfig).toBe(true);
    expect(configFromEnv({}, 'cloudflare').enforceAuthConfig).toBe(true);
  });

  it('dev 默认关闭校验', () => {
    expect(configFromEnv({}, 'dev').enforceAuthConfig).toBe(false);
  });
});
