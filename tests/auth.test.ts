import { describe, expect, it } from 'vitest';
import {
  buildSessionCookie,
  clearSessionCookie,
  constantTimeEqual,
  createRateLimiter,
  getSessionToken,
  issueSession,
  parseCookies,
  passwordDigest,
  verifyPassword,
  verifyPasswordAgainstConfig,
  verifySession,
} from '../api/auth';

describe('auth / constantTimeEqual', () => {
  it('相等 → true', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('', '')).toBe(true);
  });

  it('内容不同 → false', () => {
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
  });

  it('长度不同 → false（且不提前 return）', () => {
    expect(constantTimeEqual('abc', 'abcdef')).toBe(false);
    expect(constantTimeEqual('abcdef', 'abc')).toBe(false);
    expect(constantTimeEqual('', 'a')).toBe(false);
    // 前缀相同 + 长度不同，最容易触发提前 return 的用例
    expect(constantTimeEqual('aaaa', 'aaaaa')).toBe(false);
  });

  it('verifyPassword', () => {
    expect(verifyPassword('pw', 'pw')).toBe(true);
    expect(verifyPassword('pw', 'nope')).toBe(false);
  });

  it('哈希版：HMAC 比较', async () => {
    const pepper = 'pepper-123';
    const hash = await passwordDigest('s3cret', pepper);
    expect(await verifyPasswordAgainstConfig('s3cret', { pepper, passwordHash: hash })).toBe(true);
    expect(await verifyPasswordAgainstConfig('wrong', { pepper, passwordHash: hash })).toBe(false);
  });

  it('明文版：常量时间比较', async () => {
    expect(await verifyPasswordAgainstConfig('pw', { adminPassword: 'pw' })).toBe(true);
    expect(await verifyPasswordAgainstConfig('x', { adminPassword: 'pw' })).toBe(false);
  });
});

describe('auth / session', () => {
  const secret = 'unit-test-secret';

  it('签名 → 验签往返', async () => {
    const token = await issueSession(secret, 60);
    const payload = await verifySession(token, secret);
    expect(payload?.sub).toBe('admin');
  });

  it('篡改签名 → null', async () => {
    const token = await issueSession(secret, 60);
    const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    expect(await verifySession(tampered, secret)).toBeNull();
  });

  it('换密钥 → null', async () => {
    const token = await issueSession(secret, 60);
    expect(await verifySession(token, 'other-secret')).toBeNull();
  });

  it('过期 → null', async () => {
    const token = await issueSession(secret, -10);
    expect(await verifySession(token, secret)).toBeNull();
  });

  it('格式非法 → null（不抛异常）', async () => {
    expect(await verifySession('', secret)).toBeNull();
    expect(await verifySession('garbage', secret)).toBeNull();
    expect(await verifySession('a.b.c', secret)).toBeNull();
  });
});

describe('auth / cookies', () => {
  it('Set-Cookie 属性完整', () => {
    const c = buildSessionCookie('tok', 2592000, true);
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Secure');
    expect(c).toContain('Path=/');
    expect(c).toContain('Max-Age=2592000');
    expect(clearSessionCookie(true)).toContain('Max-Age=0');
  });

  it('parseCookies / getSessionToken', () => {
    const m = parseCookies('a=1; haonav_session=xyz; b=2');
    expect(m.a).toBe('1');
    expect(m.haonav_session).toBe('xyz');
    expect(getSessionToken('haonav_session=xyz')).toBe('xyz');
    expect(getSessionToken(null)).toBeNull();
  });
});

describe('auth / rate limiter', () => {
  it('每分钟上限生效', () => {
    const rl = createRateLimiter(3);
    expect(rl.check('ip')).toBe(true);
    expect(rl.check('ip')).toBe(true);
    expect(rl.check('ip')).toBe(true);
    expect(rl.check('ip')).toBe(false);
    expect(rl.check('other')).toBe(true);
    rl.reset('ip');
    expect(rl.check('ip')).toBe(true);
  });
});
