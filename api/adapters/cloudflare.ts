/**
 * Cloudflare Workers 入口。
 *
 * 这是**唯一**允许出现平台符号的地方（与 edgeone.ts、store.ts 一起）。
 * 逻辑全部来自 api/core.ts —— 这里只做"读 env → 建 Store → 建 app"。
 */

import { createApp, configFromEnv } from '../core';
import { createCloudflareKVStore } from '../store';

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const store = createCloudflareKVStore(env?.HAONAV_KV);
    const app = createApp({ store, config: configFromEnv(env, 'cloudflare') });
    return app.fetch(request, env, ctx);
  },
};
