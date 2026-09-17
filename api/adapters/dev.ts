/**
 * 本地开发适配器（Node / Vite）。
 *
 * ⚠️ 前端伙伴会在 vite.config.ts 里 `import { createDevMiddleware }`，
 *    名称必须保持**完全一致**。
 *
 * 这里出现的 Node 内建模块（fs / path / http）只允许存在于本 adapter：
 * 它跑在 Node（Vite dev server）里，不会进浏览器包体，也不会进边缘运行时。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp, configFromEnv, DEV_DEFAULT_PASSWORD, DEV_DEFAULT_SESSION_SECRET, type ServerConfig } from '../core';
import type { Store } from '../store';

/* ------------------------------------------------------------------ *
 * 文件存储（每个 key 一个文件；文件名做安全转义）
 * ------------------------------------------------------------------ */

function tinyHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function fileForKey(dir: string, key: string): string {
  // encodeURIComponent 会转义 ':' '/' 等；再兜底 Windows 非法字符
  let name = encodeURIComponent(key).replace(/[*?"<>|]/g, '_');
  if (name.length > 180) name = name.slice(0, 160) + '-' + tinyHash(key);
  return path.join(dir, name + '.kv');
}

export function createFileStore(dir: string): Store {
  const ensure = () => fs.mkdir(dir, { recursive: true });
  return {
    async getText(key: string): Promise<string | null> {
      try {
        return await fs.readFile(fileForKey(dir, key), 'utf8');
      } catch (e: any) {
        if (e?.code === 'ENOENT') return null;
        throw e;
      }
    },
    async putText(key: string, value: string): Promise<void> {
      await ensure();
      await fs.writeFile(fileForKey(dir, key), value, 'utf8');
    },
    async del(key: string): Promise<void> {
      try {
        await fs.unlink(fileForKey(dir, key));
      } catch (e: any) {
        if (e?.code !== 'ENOENT') throw e;
      }
    },
  };
}

/* ------------------------------------------------------------------ *
 * Node req/res ↔ Web Request/Response 桥接
 * ------------------------------------------------------------------ */

const SKIP_HEADERS = new Set(['connection', 'content-length', 'transfer-encoding', 'host', 'keep-alive']);

function readRequestBody(req: IncomingMessage): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.from(c)));
    req.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}

async function handleNodeRequest(
  app: ReturnType<typeof createApp>,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `http://${host}`);
  const method = (req.method || 'GET').toUpperCase();

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined || SKIP_HEADERS.has(k.toLowerCase())) continue;
    try {
      headers.set(k, Array.isArray(v) ? v.join(', ') : String(v));
    } catch {
      /* 忽略无法设置的 header */
    }
  }

  let body: Uint8Array | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    body = await readRequestBody(req);
  }

  const request = new Request(url.toString(), { method, headers, body: body as BodyInit | undefined });
  const response = await app.fetch(request);

  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    try {
      res.setHeader(key, value);
    } catch {
      /* ignore */
    }
  });
  const buf = Buffer.from(await response.arrayBuffer());
  res.end(buf);
}

/* ------------------------------------------------------------------ *
 * Vite / connect 中间件
 * ------------------------------------------------------------------ */

export function createDevMiddleware() {
  const dir = path.resolve(process.cwd(), '.data');
  const store = createFileStore(dir);

  const password = process.env.HAONAV_ADMIN_PASSWORD;
  const secret = process.env.HAONAV_SESSION_SECRET;
  if (!password) {
    console.warn(
      '\n[HaoNav dev] ⚠️  未设置 HAONAV_ADMIN_PASSWORD，使用开发默认密码 "haonav-dev"。切勿用于生产！\n',
    );
  }
  if (!secret) {
    console.warn(
      '[HaoNav dev] ⚠️  未设置 HAONAV_SESSION_SECRET，使用不安全的开发默认值。切勿用于生产！\n',
    );
  }

  const config: ServerConfig = {
    ...configFromEnv(process.env, 'dev'),
    adminPassword: password || DEV_DEFAULT_PASSWORD,
    sessionSecret: secret || DEV_DEFAULT_SESSION_SECRET,
    platform: 'dev',
    secureCookies: false,
    // dev 刻意关闭鉴权配置强度校验：允许弱默认值便于本地开发（生产适配器会开启）
    enforceAuthConfig: false,
  };

  const app = createApp({ store, config });

  return function haonavDevApiMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: unknown) => void,
  ): void {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (!url.pathname.startsWith('/api/')) {
      next();
      return;
    }
    handleNodeRequest(app, req, res).catch((err) => {
      console.error('[HaoNav dev] API error:', err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    });
  };
}
