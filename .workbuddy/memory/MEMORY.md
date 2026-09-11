# HaoNav 项目长期备忘

## 项目定位与用户硬要求

- HaoNav 是「可部署在 Cloudflare / EdgeOne Makers / Vercel 免费套餐上的网址导航站」，源自一个 Google AI Studio 导出的 React 模板。
- 用户的三条硬要求（2026-09 确认）：**界面视觉尽量不变** · **运行要快** · **编辑要方便**（前台或后台皆可）。
- 迁移成本不设限：语言 / 框架 / 依赖 / 架构均可推翻重来。

## 已确认的技术决策

- **前端框架：Vue 3 + Vite**（首选）。实测运行时基线 brotli 18.9 KB，加应用代码约 34 KB，落在 45 KB 预算内。备选 Svelte 5（13.4 KB）。**Next.js 已排除**（基线 150.6 KB，且上 EdgeOne 需 static export 会废掉 API route）。
- **后端：Hono 单一 API**（`api/core.ts` 零平台依赖），平台差异收进 ≤10 行 adapter。
- **存储分工**：主文档 → KV 单键；站点图标 → KV 单键 + 长缓存；快照备份 → Blob；数据库（D1）暂不启用。
- **构建方式**：Vite 双入口 —— `index.html`（前台）+ `admin.html`（编辑后台，独立 bundle，访客不下载）。不用路由。
- **样式**：Tailwind v4 构建时产出。**严禁再用 `cdn.tailwindcss.com`**。
- 改造方案全文见项目根目录 `HaoNav-改造方案.md`。

## 已知的关键缺陷（改造时必须一并修掉）

1. 三套并行后端（`functions/` CF、`edgefunctions/` EdgeOne、`api/` 无平台签名），KV 绑定名与 key 名两套。
2. `functions/api/link.ts` 写 `app_data`，网页端读写 `haonav_links` → Chrome 扩展存的链接永不显示。
3. `IS_EDGEONE_ENV = hostname.includes('edgeone.app')` → 在 EdgeOne 实际域名下恒为 false → 登录永远失败。
4. `functions/api/storage.ts` 的 GET：`password ? verify : true` → 不传 header 即全量公开；叠加 `Access-Control-Allow-Origin: *`。
5. `verifyPassword()` 在 KV 无密码时会写入传入密码并返回 true → 首个请求者成为站长。
6. `Category.password` 明文随 JSON 下发，分类锁是装饰。
7. `functions/api/webdav.ts` 只存取配置、未实现 WebDAV 代理 → check/upload 恒 true，download 恒 null（假成功）。
8. `saveLinks/saveCategories/saveSettings = loadAll() + saveAll()` → 在最终一致的 KV 上有真实丢写风险。
9. 死代码：`CategoryManagerModal`(328 行)、`CategorySortModal`(247 行) 无任何入口。
10. `id: Date.now().toString()` 同毫秒撞车；排序靠数组下标，无持久化 order 字段。

## 体积归因（实测，改造前后对比基线）

- 改造前：单 chunk 1,579 KB raw / gzip 348 KB / **brotli 280 KB**，且构建产物中**没有任何 CSS 文件**。
- 280 KB 的构成：lucide 全量 146 KB + `@google/genai`&`jszip` 75 KB + React 57.9 KB = 279 KB（业务代码占比接近 0）。
- 换 Vue 3 + 具名图标导入 + 动态导入重依赖后，目标首屏 JS ≤ 45 KB brotli。

## 环境与工具约定

- **npm registry**：本机默认指向已废弃的 `registry.npm.taobao.org`，证书过期会让 install 直接失败。装包必须显式指定 `--registry=https://registry.npmmirror.com`，或先 `export npm_config_registry=https://registry.npmmirror.com`。
- 运行环境：Windows + Git Bash；`/tmp` 映射到 `C:\Users\BoYan\AppData\Local\Temp`。
- 托管平台免费额度（2026-09 核实）：Cloudflare Workers 100,000 请求/天、KV 100,000 读/天 + **1,000 写/天** + 1 GB；EdgeOne Pages 流量请求不限量、Edge Functions 300 万请求/月、KV 1 GB 且**仅 Edge Functions 可调用**；Vercel Hobby 额度最紧且禁商业用途。
- 三家 KV 均为**最终一致**（边缘缓存最长 60 s）→ 设计上必须「写后不回读 + 乐观更新 + rev 冲突检测」。
