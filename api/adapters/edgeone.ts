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
 *
 * 💡 KV 未绑定时的行为（可自诊断）：`handle()` 先解析 namespace，**解析不到不会裸抛**——
 *    裸抛会被 EdgeOne 运行时吞成 12 字节的 `script error`，用户无从判断。改为：
 *      · `/api/health`（不依赖 KV）→ 仍返回 200，body 多一个 `kvBound:false`；
 *      · 其余 `/api/*`（属配置错误）→ 返回 500 的中文 JSON，写明「变量名填 HAONAV_KV」。
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

/** 统一 JSON 响应（V8 运行时没有 `Response.json()`） */
function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** 取 request 的 pathname；解析失败时按「非 health」处理，避免连累正常分支 */
function pathnameOf(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return '';
  }
}

async function handle(request: Request, env: any, ctx?: any): Promise<Response> {
  const ns = resolveNamespace(env);

  // ── KV 缺失：不能裸抛异常 ──
  // 裸抛会被 EdgeOne 运行时吞成 12 字节的 `script error`，用户完全无从判断哪里错了。
  // 这里改成「可自诊断」的响应：/api/health 不依赖 KV，降级成 200 且带 kvBound 字段；
  // 其余 /api/* 是配置错误，返回 500 + 中文修复指引。
  if (!ns) {
    if (pathnameOf(request) === '/api/health') {
      // /api/health 不读 KV，不该被连坐 —— 让它继续当排障入口用。
      console.error(
        '[edgeone] KV 命名空间未绑定：/api/health 降级响应（kvBound=false）。请在控制台绑定 KV 并把变量名设为 HAONAV_KV。',
      );
      return json(
        { status: 'ok', platform: 'edgeone', time: Date.now(), kvBound: false },
        200,
      );
    }

    // 日志便于在部署日志里搜索；不回显任何密钥（此处也拿不到）。
    console.error(
      '[edgeone] KV 命名空间未绑定：请检查控制台 KV 存储绑定，变量名必须为 HAONAV_KV。',
    );
    return json(
      {
        error: 'KV 命名空间未绑定',
        detail:
          'EdgeOne Makers 的 KV 是绑定命名空间时所填变量名对应的全局变量。请在控制台把 KV 命名空间绑定到本项目，变量名填 HAONAV_KV，然后重新部署。',
        hint: '详见 README「部署」章节的故障排查表',
      },
      500,
    );
  }

  const store = createEdgeOneKVStore(ns);
  const app = createApp({ store, config: configFromEnv(env, 'edgeone') });
  return app.fetch(request, env, ctx);
}

export async function onRequest(context: { request: Request; env: any }): Promise<Response> {
  // 第 3 个参数透传 context：Hono 据此填 c.executionCtx.waitUntil（/api/icon 写缓存要用）
  return handle(context.request, context.env, context);
}

export default {
  fetch: handle,
};
