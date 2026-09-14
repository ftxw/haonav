/**
 * EdgeOne Makers Edge Function 入口（V8 运行时）—— 图标专用路径 `/icon`。
 *
 * 为什么单独开一个非 `/api/` 的路径：
 *   Makers / EdgeOne 的默认缓存策略对 **`URI Path starts with /api/`** 一律
 *   **Bypass Cache**（官方文档原话，目的是保证动态响应新鲜度）。实测后果有两个：
 *     1. `/api/*` 的响应永不进 CDN（响应无 `Age` 头）；
 *     2. 边缘函数里调 `cache.put()` 直接抛 `err:forbidden cdn cache`。
 *   → 所以只要图标接口顶着 `/api/` 前缀，`caches.default` 就**永远写不进去**，
 *     表现为「一直 MISS」。把它挪到 `/icon` 才能解锁 CDN 缓存与 Cache API。
 *
 * 对照实验（curl 实测，非估算）：
 *   `/api/icon` ×5      → 全 MISS + forbidden cdn cache，无 Age 头
 *   `/assets/*.js` ×3   → Age: 0 → 1 → 2 递增，CDN 缓存完全正常
 *   → CDN 能力本身没坏，坏的是平台不放行 `/api/*`。
 *
 * 为什么这么薄：真正的实现在 `api/adapters/edgeone.ts`（平台符号只允许出现在
 * adapters/ 与 store.ts），这里**不复制任何业务逻辑**，只把两种导出形式都透出去。
 */

import edgeoneHandler from '../api/adapters/edgeone';
import { onRequest } from '../api/adapters/edgeone';

export default edgeoneHandler;
export { onRequest };
