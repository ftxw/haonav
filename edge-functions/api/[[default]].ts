/**
 * EdgeOne Makers Edge Function 入口（V8 运行时）。
 *
 * 为什么是这个路径：
 *   EdgeOne Makers **只扫描约定目录 `edge-functions/`**，路径即路由 ——
 *   `edge-functions/api/hello.js` → `GET /api/hello`。
 *   文件名 `[[default]]` 表示该目录的 **catch-all**，匹配 `/api/*` 下所有未单独
 *   定义的路由（本项目前台/后台全部请求都打 `/api/*`）。
 *
 * 为什么这么薄：
 *   真正的实现在 `api/adapters/edgeone.ts`（平台符号只允许出现在 adapters/ 与
 *   store.ts），这里**不复制任何业务逻辑**，只把两种导出形式都透出去。
 *
 * 两种导出形式都保留，是为了同时兼容 dev server 与 deploy builder 两条路径：
 *   - `export default { fetch }`  → 框架实例式入口（Hono 的 app 也是这个形状）
 *   - `export async function onRequest` → EdgeOne 约定的普通 handler 式入口
 *
 * ⚠️ 官方文档提示：dev server 比 deploy 时的 builder 更宽松，因此 catch-all 换成
 *    handler 形式后，部署完必须**实际请求一次 `/api/health` 复验**（见 README 排障表）。
 */

import edgeoneHandler from '../../api/adapters/edgeone';
import { onRequest } from '../../api/adapters/edgeone';

export default edgeoneHandler;
export { onRequest };
