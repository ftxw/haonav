/**
 * EdgeOne Edge Functions 入口（V8 运行时）。
 *
 * 与 cloudflare.ts 的差异**只体现在 import 与 env 读取上**：
 *  - 同时导出 `onRequest`（EdgeOne 约定）与默认 `{ fetch }`（标准入口）
 *  - KV 绑定按三重兜底解析：env → globalThis → **裸标识符**
 *
 * ⚠️ EdgeOne Makers 的 KV 是**绑定命名空间时所填变量名对应的全局变量**，
 *    官方文档明确写 "NOT on `context.env`"。但不同部署路径（dev server vs
 *    deploy builder）注入方式可能是 env、globalThis 属性、或外层作用域变量，
 *    因此这里做三重兜底；core.ts 对此完全无感。
 *
 * 部署入口见 `edge-functions/api/[[default]].ts`（该目录路径即路由）。
 */

import { createApp, configFromEnv } from '../core';
import { createEdgeOneKVStore } from '../store';

/**
 * 解析 KV 命名空间绑定对象。
 * 顺序：env → globalThis → 裸标识符（见各步注释）。
 */
function resolveNamespace(env: any): any {
  // 1) env：部分部署路径会把绑定挂在 env 上
  const fromEnv = env?.HAONAV_KV ?? env?.HaoNav_KV;
  if (fromEnv) return fromEnv;

  // 2) globalThis：平台把绑定注入成 globalThis 上的属性时
  const g = globalThis as any;
  const fromGlobal = g.HAONAV_KV ?? g.HaoNav_KV;
  if (fromGlobal) return fromGlobal;

  // 3) 裸标识符：平台把绑定注入成外层作用域的变量（可见，但不在 globalThis 上）时，
  //    只能直接用标识符取 —— 这种情况 globalThis 兜底是取不到的。
  //
  //    ⚠️ 必须用 `typeof X !== 'undefined'` 守卫：对**未声明**的标识符 `typeof` 不会抛
  //       ReferenceError，而 `X ?? ...` / `if (X)` 会直接抛异常 → /api/* 全部 500。
  // @ts-expect-error 平台注入的全局绑定名 HAONAV_KV，类型系统不可见
  if (typeof HAONAV_KV !== 'undefined') return HAONAV_KV;
  // @ts-expect-error 旧绑定名 HaoNav_KV 兼容
  if (typeof HaoNav_KV !== 'undefined') return HaoNav_KV;

  return undefined;
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
