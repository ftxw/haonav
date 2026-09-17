/**
 * Cloudflare Workers 入口。
 *
 * 这是**唯一**允许出现平台符号的地方（与 edgeone.ts、store.ts 一起）。
 * 逻辑全部来自 api/core.ts —— 这里只做"读 env → 建 Store → 建 app"。
 */

import { createApp, configFromEnv, validateAuthConfig } from '../core';
import { createCloudflareKVStore } from '../store';

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const store = createCloudflareKVStore(env?.HAONAV_KV);
    const config = configFromEnv(env, 'cloudflare');
    // 生产鉴权配置自查（fail-closed）：见 edgeone.ts 同处注释。
    // 真正的拒绝逻辑在 core.ts（/api/login 与 requireSession 返回 503），此处仅补日志。
    const authCheck = validateAuthConfig(config);
    if (!authCheck.ok) {
      console.error(
        `[cloudflare] ⛔ 鉴权配置不安全，已拒绝所有需要鉴权的请求（/api/login 将返回 503）：${authCheck.error} 请补齐 HAONAV_ADMIN_PASSWORD / HAONAV_SESSION_SECRET 后重新部署。`,
      );
    }
    const app = createApp({ store, config });
    return app.fetch(request, env, ctx);
  },
};
