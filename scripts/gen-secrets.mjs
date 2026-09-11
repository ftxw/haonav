#!/usr/bin/env node
/**
 * HaoNav 密钥生成（可选哈希版）。
 *
 * 用法：
 *   node scripts/gen-secrets.mjs "你的密码"
 *
 * 输出三个部署 Secret：
 *   HAONAV_PEPPER          —— HMAC 的 pepper（随机，无需记忆）
 *   HAONAV_PASSWORD_HASH   —— HMAC-SHA256(pepper, password) 的 hex
 *   HAONAV_SESSION_SECRET  —— 会话 cookie 签名密钥（必须密码学随机）
 *
 * 与 api/auth.ts 的 passwordDigest() 保持一致：
 *   算法 HMAC-SHA256，key = pepper，message = password(utf8)，输出 hex。
 *
 * 默认不需要哈希版 —— 平台的 Secret 写入后无法读回明文，而会话签名密钥就在
 * 同一个 Secret 存储里：攻击者一旦拿到 Secret，可直接伪造会话 cookie，根本
 * 不需要密码。哈希版唯一的价值是防密码明文意外泄漏到日志。
 */

import { createHmac, randomBytes } from 'node:crypto';

const password = process.argv[2];

if (!password) {
  console.error('用法: node scripts/gen-secrets.mjs "你的密码"');
  process.exit(1);
}

const pepper = randomBytes(32).toString('hex');
const passwordHash = createHmac('sha256', pepper).update(password, 'utf8').digest('hex');
const sessionSecret = randomBytes(32).toString('hex');

console.log('# 把下面三行写入平台 Secret（不要提交进仓库）：');
console.log(`HAONAV_PEPPER=${pepper}`);
console.log(`HAONAV_PASSWORD_HASH=${passwordHash}`);
console.log(`HAONAV_SESSION_SECRET=${sessionSecret}`);
console.log('');
console.log('# 配了 HAONAV_PEPPER + HAONAV_PASSWORD_HASH 后，');
console.log('# 可删除 HAONAV_ADMIN_PASSWORD（api/auth.ts 会自动切换到 HMAC 比较）。');
