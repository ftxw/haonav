/**
 * EdgeOne Edge Functions 入口（V8 运行时）。
 *
 * 与 cloudflare.ts 的差异**只体现在 import 与 env 读取上**：
 *  - 同时导出 `onRequest`（EdgeOne 约定）与默认 `{ fetch }`（标准入口）
 *  - KV 绑定的来源：env.HAONAV_KV（推荐命名）→ env.HaoNav_KV（旧名兼容）
 *    → globalThis 上的同名全局变量（旧代码用 `declare const HaoNav_KV`）
 *
 * ⚠️ EdgeOne 的 KV 绑定到底出现在 env 还是全局变量，需在控制台确认；
 *    因此在取值处做了多重兜底。core.ts 对此完全无感。
 */

import { createApp, configFromEnv } from '../core';
import { createEdgeOneKVStore } from '../store';

function resolveNamespace(env: any): any {
  return (
    env?.HAONAV_KV ??
    env?.HaoNav_KV ??
    (globalThis as any).HAONAV_KV ??
    (globalThis as any).HaoNav_KV
  );
}

async function handle(request: Request, env: any, ctx?: any): Promise<Response> {
  const store = createEdgeOneKVStore(resolveNamespace(env));
  const app = createApp({ store, config: configFromEnv(env, 'edgeone') });
  return app.fetch(request, env, ctx);
}

export async function onRequest(context: { request: Request; env: any }): Promise<Response> {
  return handle(context.request, context.env);
}

export default {
  fetch: handle,
};
