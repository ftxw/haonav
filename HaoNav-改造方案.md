# HaoNav 改造方案（v2 重写版）

> 体检日期：2026-09-11
> 体检方式：全量源码通读 + 实际执行 `npx vite build` 生产构建 + 依赖产物逆向分析 + 平台免费额度核对
> 前提：迁移成本不设限，语言 / 框架 / 依赖 / 架构均可推翻重来；界面视觉尽量保持不变；运行要快；编辑要方便；只用 Cloudflare / EdgeOne Makers / Vercel 免费套餐。

---

## 0. 一句话结论

这个项目的**功能设想是对的，工程实现是坏的**。目前它是「一个 Google AI Studio 导出的 React 玩具」上面叠了三套互相矛盾的 Serverless 后端，核心问题不是"代码写得不够优雅"，而是**三件事同时坏掉**：数据可能正在丢失、安全锁形同虚设、首屏要下载 1.6MB JS 且样式依赖一个运行时 CDN。

建议：**前台 + 后台双入口重写（Vue 3 + Vite + Tailwind 构建化，实测运行时仅 18.9 KB brotli），后端收敛成一套 Hono 边缘 API，只用 KV 单一存储（不用 Blob、不用数据库）+ 操作日志**。视觉结构保留"左目录 + 右内容"，实现全部重写。

---

## 1. 实测体检数据（不是估算，是跑出来的）

```
$ npx vite build
✓ 1721 modules transformed.
dist/index.html                  5.78 kB │ gzip:   1.85 kB
dist/assets/index-DTrd8b4a.js 1,617.33 kB │ gzip: 359.36 kB   ← 单 chunk，无分割
```

| 指标 | 实测值 | 说明 |
|---|---|---|
| 首屏 JS | **1,579 KB / gzip 348 KB / brotli 280 KB**，**单 chunk 零分割** | 对比：一个导航首页合理预算 ≤ 45 KB（brotli） |
| 构建产出的 CSS | **0 个文件** | 全站样式不来自构建，来自运行时 CDN |
| 运行时样式依赖 | `cdn.tailwindcss.com` = **407 KB / gzip 120 KB 阻塞脚本** | 浏览器现场编译 CSS，官方明确标注"不可用于生产" |
| lucide 图标 | 实测：`import * as` 全量打包 = **146.0 KB brotli**；换成具名导入（约 50 个图标）= **8.5 KB brotli** | 白白多传 **137.5 KB**。bundle 内含 1,657 处 lucide 引用 / 4,414 条 SVG path，只因 `Icon.tsx` 写了 `import * as LucideIcons` |
| 被塞进主 chunk 的重依赖 | 实测：`@google/genai` + `jszip` = **75.2 KB brotli**（454.7 KB raw） | 只有编辑后台才用，却让每个访客都下载 |

> **体积归因（实测）**：280 KB brotli 的产物里，lucide 占 146 KB、genai+jszip 占 75 KB、React+ReactDOM 占 57.9 KB —— **三者合计 279 KB，即整个包体几乎全是"框架 + 两处错误的 import"，业务代码占比接近 0**。换句话说，只要改两个 import 就能砍掉 79%。
| `index.html` | 同一段 site-config IIFE **重复了 2 遍**（head 末尾各一份，5.8 KB） | 复制粘贴残留 |
| `index.html` importmap | 8 个包指向 `aistudiocdn.com` | AI Studio 残留；有 Vite 打包后完全无用 |
| 根目录非源码资产 | 10 张 PNG(648 KB) + docx(476 KB) + 3 个 SVG(32 KB) ≈ **1.16 MB** | 只服务 README，污染仓库 |
| TS 严格模式 / ESLint / 测试 | 均无 | `tsconfig.json` 未开 `strict` |

**关键推论**：因为构建产物里没有任何 CSS，**一旦 `cdn.tailwindcss.com` 被墙、被 CSP 拦、或挂了，你的站点会变成一堆没有样式的纯文本**。国内访问这个 CDN 的稳定性本身就有问题 —— 这不是"优化项"，是**可用性缺陷**。

---

## 2. 系统性缺陷清单

### 🔴 P0-1：数据正在丢失（三套后端，三种 key，两套绑定名）

仓库里同时存在三套互不兼容的服务端实现：

| 目录 | 目标平台 | KV 绑定名 | 写入的 key | 数据形态 |
|---|---|---|---|---|
| `functions/api/*.ts` | Cloudflare Pages | `CLOUDNAV_KV` | `haonav_links` / `haonav_categories` / … | **分片** |
| `functions/api/link.ts` | Cloudflare Pages | `CLOUDNAV_KV` | `app_data` | **单体** |
| `api/storage.ts` | 签名是 EdgeOne Edge Functions | `env.HaoNav_KV` | `haonav_*` | 分片 |
| `edgefunctions/api/storage.ts` | EdgeOne Edge Functions | 全局 `HaoNav_KV` | `haonav_*` | 分片 |

由此产生三个确定性 Bug：

1. **Chrome 扩展存的书签永远不出现。** 扩展生成的代码 POST `/api/link`，而 `link.ts` 把新链接写进 `app_data.links`；网页端从 `haonav_links` 读取。**两条数据链永不相交。**
2. **README 的部署说明与代码不符。** README 让 Cloudflare 用户把 KV 绑定名为 `HaoNav_KV`、设 `PASSWORD` 环境变量；而 `functions/api/storage.ts` 读的是 `env.CLOUDNAV_KV`，且密码来自 KV 里的 `haonav_auth_password`，根本不看 `env.PASSWORD`。**照 README 部署，云端同步直接 500。**
3. **平台判断是硬编码域名猜测。**
   ```ts
   const IS_EDGEONE_ENV = location.hostname.includes('edgeone.app');
   ```
   EdgeOne Pages 的实际线上域名是 `*.edgeone.pages.dev` / `*.edgeone.cool`（本环境部署流程确认），**都不包含 `edgeone.app`** → 在 EdgeOne 上被判为"非 EdgeOne"，走 Cloudflare 分支 → `env.CLOUDNAV_KV` 未绑定 → 抛错 → 静默 `loadFromLocal()` 降级。**结果是：在 EdgeOne 上部署，登录永远失败、数据永不上云，用户只会看到"离线"两个字。**

> 迁移时**必须把 `haonav_*` 和 `app_data` 两个 key 都读出来合并去重**，只读一个就等于丢一半数据。这是整个改造里风险最高的一步。

### 🔴 P0-2：访问密码是假的，且存在接管漏洞

```ts
// functions/api/storage.ts  GET 分支
const isAuthorized = password ? await verifyPassword(HaoNav_KV, password) : true;
//                                                                       ^^^^ 不传密码 = 直接放行
```

具体后果：

- **全局锁可以一行命令绕过**：`curl https://你的域名/api/storage` —— 不带任何 header 就能拿到全部书签、分类、设置。
- **配合 `Access-Control-Allow-Origin: *`**：任意第三方网页都能在访客浏览器里静默读取你的整个导航库。
- **首个请求者成为站长**：`verifyPassword()` 的逻辑是"KV 里没密码就把传进来的密码存下来并返回 true"。所以任何一个陌生人在你首次部署后抢先 POST 一次，就设定了站点密码。
- **分类密码是明文下发的**：`Category.password` 存在同一份 JSON 里，随 `/api/storage` 明文返回给浏览器。所谓"私密目录"只是 CSS 上把内容藏起来了，看一眼接口就能拿到密码和全部链接。
- **密码即令牌即凭据**：明文存 `localStorage`，作为 `x-auth-password` 每次请求明文发送，无会话、无过期、无常量时间比较。

### 🔴 P0-3：WebDAV 备份"假成功"

`services/webDavService.ts` 向 `/api/webdav` 发送 `{operation: 'check'|'upload'|'download', config, payload}`。
而 `functions/api/webdav.ts` **只实现了"存 WebDAV 配置"和"读 WebDAV 配置"**，完全没有实现任何 PROPFIND/PUT/GET 代理。

于是：
- `checkWebDavConnection()` → 后端返回 `{success:true}` → **前端告诉你"连接成功"**
- `uploadBackup()` → 同样 `{success:true}` → **前端告诉你"备份成功"**（实际什么都没传）
- `downloadBackup()` → 返回的是你刚发过去的配置对象 → `Array.isArray(result.links)` 为 false → **静默返回 null，恢复失败且无提示**

**用户以为自己有云端备份，其实从来没有。**

### 🟠 P1：性能（列表渲染 + 网络请求双重灾难）

- **零代码分割**：`geminiService` → `@google/genai`（App.tsx 顶层 import 链）和 `jszip`（SettingsModal 顶层）全进主 bundle。
- **全量图标库**：`Icon.tsx` 的 `import * as LucideIcons from 'lucide-react'` 让 tree-shaking 彻底失效。
- **全量 DOM**：1000 个链接 = 1000+ 张卡片一次性挂载，无懒渲染、无虚拟滚动。每次输入搜索词，全部卡片重绘。
- **O(分类 × 链接) 的重复计算**：`App.tsx` 里 `categories.map(cat => searchResults.filter(l => l.categoryId === cat.id))` 在每次 render 执行。20 分类 × 1000 链接 = 20,000 次遍历/帧。搜索无防抖。
- **第三方请求风暴**：图标直接用远程 URL（`t2.gstatic.com/faviconV2`、`github.com/favicon.ico` 等），**1000 个书签 ≈ 1000 个跨域图片请求**，无 `loading="lazy"`、无 `decoding="async"`、无本地缓存。顺带把用户的全部收藏列表实时汇报给了 Google / 百度 / 必应的 favicon 服务。
- **首屏白屏**：`#root` 初始 `display:none`，等 React 挂载后由 `hideLoadingOverlay()` 用 `setTimeout(..., 300)` 揭开。叠加 Tailwind CDN 的现场编译，移动端首次白屏 1–3 秒。

### 🟠 P1：写入策略把免费额度当无底洞

- `updateData()`：**每一次**改动（切换置顶、改个标题、切换卡片样式）都同步写 `localStorage` **并且**全量 POST 整份数据。
- `saveLinks/saveCategories/saveSettings` 各自实现为 `loadAll()` + `saveAll()` → **两次往返 + 客户端 read-modify-write**，天然存在并发覆盖。
- 无 `rev` / ETag / 冲突检测 → 手机和电脑同时编辑，**后写的一方静默覆盖前者全部改动**。
- **免费额度是硬约束**：Cloudflare KV 免费版 **1,000 次写/天**。当前实现下"编辑 100 个链接"= 100 次全量写。加上自动保存类交互，很容易撞到日限后**当天所有保存开始报错**。

### 🟡 P2：架构与可维护性

- `App.tsx` **1,642 行**，20+ 个 `useState`，14 个 Modal 全量常驻挂载，业务逻辑 / 渲染 / 网络 / 权限判断混在一个函数里。
- **1,067 行死代码**：`CategoryManagerModal`(328 行) 和 `CategorySortModal`(247 行) 都没有任何入口 —— `setIsCatManagerOpen(true)` 和 `setIsCategorySortModalOpen(true)` 在代码里根本不存在。另有 3 个功能重叠的分类管理途径（`CategoryEditModal` / `CategoryManagerModal` / `CategorySortModal`）。
- **数据模型缺陷**：
  - 排序靠"数组下标"隐含表达。`handleReorderLinks` 里未出现在新顺序中的项会被赋 `Infinity`。拖动排序只在"排序模式"里改内存数组，**没有持久化 order 字段**。
  - `id: Date.now().toString()` —— **同一毫秒创建两个条目就 ID 撞车**（批量导入、扩展连点）。而 `bookmarkParser.ts` 里明明定义了 `generateId()` 却没用，还 import 了没用的 `uuid`。
  - 无 `schemaVersion`，无迁移机制。三套后端各写各的 key，注定要手工考古。
  - `createdAt` 同时兼任"创建时间"和"排序依据"。
- **配置不一致**：`vite.config.ts` 设 dev 端口 3000 + `host: '0.0.0.0'`，`eop-config.json` 写 5173。
- **密钥泄漏风险**：`vite.config.ts` 用 `define` 把 `process.env.GEMINI_API_KEY` 内联进客户端代码。**一旦构建时配了这个变量，你的 Gemini Key 就烤进了公开的 JS 文件**。
- **AI 调用在浏览器直连**：`@google/genai` 带着用户明文 Key 从前端请求，CORS 暴露、无速率限制、无批量控制。
- **渲染期副作用**：`App.tsx` 组件函数体顶部直接读 `localStorage` 并改 `document.title`，配合 `StrictMode` 双执行。
- 用 `alert()` 做导入结果提示（`ImportModal` / `App.tsx`）。

### 🟡 P2：界面与交互细节问题

- **Chrome 扩展生成器生成的是坏代码**（README 主推功能）：
  - `parentId: "cloudnav_root"` 而根菜单 id 是 `"haonav_root"` → **子菜单无法创建，Chrome 会直接报错**，右键"保存到分类"整条链路不可用。
  - 写入的 `/api/link` 用了与网页端不同的 key 和 schema（见 P0-1）→ 即使菜单能用，存进去的链接也不会显示。
  - 一个 500+ 行的扩展程序**用模板字符串硬编码在 React 组件里**，改一行要动 UI 代码，无法维护。
- **二维码依赖 `api.qrserver.com`**：第三方域名、离线不可用、每次弹窗都发一次请求。
- **导入在浏览器里跑**：1000+ 条书签的 HTML 解析 + 去重全在主线程，卡死页面。
- 侧边栏底部硬编码上游作者的 `https://github.com/sese972010/HaoNav` 和"Fork 项目"按钮 —— 个人部署实例上的无意义入口。
- 遗漏：无 404 页、无离线能力、无 `prefers-reduced-motion` 处理、无键盘可达性（`a11y` 标签基本缺失）、无"链接失效检测"、无批量编辑/多选。

---

## 3. 改造目标与验收口径

### 性能预算（硬指标，上线前必须达标）

| 指标 | 现状 | 目标 |
|---|---|---|
| 首屏 JS（brotli，三者同口径对比） | **280 KB**（单 chunk，gzip 348 KB） | **≤ 45 KB** |
| 首屏 CSS（gzip） | 0（依赖 120 KB 阻塞脚本现场编译） | **≤ 12 KB，构建时产出** |
| 首屏第三方请求 | Tailwind CDN + N 个 favicon + qrserver | **0 个** |
| 1000 链接时首屏请求数 | 1 + 1000+ | **≤ 4**（HTML / CSS / JS / API） |
| LCP（移动端 4G，二次访问） | 白屏 1–3 s | **< 400 ms** |
| 首次内容绘制 | 被 CDN JIT 阻塞 | **< 300 ms** |
| 首屏实际参与渲染的节点数（1000 链接） | ~12,000 全部参与渲染 | **< 1,500**（DOM 总数仍约 12,000，其余由 `content-visibility` 跳过） |
| 搜索 5000 条响应 | 每次 render 全量 filter | **< 10 ms（防抖后）** |
| 保存一次改动的网络写入 | 1 次全量 POST | **1 次 PATCH，写入量 ∝ 改动量** |

### 功能目标

- 界面：保留全部视觉语言与布局结构，改造前后截图逐像素对比，允许的差异只有间距微调。
- 编辑：独立 `/admin` 入口，支持多选批量改分类、批量删、去重、死链检测、拖拽排序、撤销、导入预览 diff。日常改一条链接 ≤ 3 次点击。
- 数据：单文档 + 操作日志，具备 `rev` 乐观并发控制，两端同时编辑不丢改动。
- 平台：一份代码，Cloudflare（首选）/ EdgeOne Makers（备选）/ Vercel（备选）均可部署，切换平台只改一个文件。

---

## 4. 目标架构（推荐方案 A）

### 4.1 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 前端框架 | **Vue 3.5 + Vite**（✅ 已确认） | 实测运行时基线 brotli **18.9 KB**（Svelte 5 为 13.4 KB，React 19 为 57.9 KB，Next.js 16 为 150.6 KB）。Vue 加应用代码约 34 KB，**在 45 KB 预算内有余量**，同时中文生态最好、AI 生成代码准确率高。详见 4.1.1 实测数据 |
| 样式 | **Tailwind CSS v4（构建时）** | 直接消掉 120 KB 阻塞脚本和白屏；产出约 8–14 KB gzip；色板用 `@theme` 复刻现有 `primary #3b82f6` / `slate` 系 |
| 路由 | **无** | 整个应用本质是单视图。只用两个构建入口，不引入 router |
| 入口 | `index.html`（前台）+ `admin.html`（后台） | Vite 多入口天然代码分割，**访客永远不会下载编辑后台的代码** |
| API | **Hono**（Web 标准 Request/Response） | 框架无关，同一份代码跑在 Cloudflare Workers / EdgeOne Edge Functions / Vercel / Node / Deno / Bun。这是"一套代码多平台"的最优解 |
| 存储 | **KV 单文档 + 操作日志** | 读多写极少，单键读取 1 次请求；额度压力最小 |
| 图标 | **本地字母图标（默认 0 请求）+ 边缘 favicon 代理（按需抓取并长缓存）** | 彻底消灭 1000 次第三方请求 |
| 二维码 | 本地生成（~4 KB 的轻量 qrcode 库） | 去掉 `api.qrserver.com` |
| 后台拖拽 | 原生 Pointer Events（约 80 行）替换 `@dnd-kit`（3 个包） | 少 3 个依赖，行为可控 |
| 测试 | Vitest 单测（API/迁移/去重逻辑）+ Playwright 视觉回归（8 张关键页面截图） | 视觉"保持不变"这条要求必须靠截图对比来保证 |

> **Vue 与 Svelte 的取舍**：两者都能满足 45 KB 预算（Vue ≈ 34 KB，Svelte ≈ 28 KB）。**选 Vue** —— 中文文档与社区最好、`<script setup>` 可读性高、AI 生成代码准确率高、长期可维护性更好。**选 Svelte 5** 的唯一理由是压到极限体积，但要接受生态小众、且 runes 语法较新（2024 年底稳定），AI 生成时容易混入 Svelte 4 的 `export let` / `$:` 旧写法。**如果你偏好"改动最小、风险最低"**：见第 9 节方案 B。

#### 4.1.1 框架选型实测数据（2026-09 实测，非估算）

测量口径：框架**运行时基线**，**不含任何业务代码**。
- Next.js 数据：`create-next-app@latest`（Next 16.3.4，App Router，默认模板，零第三方依赖）执行 `next build` 后，解析 `index.html` 中实际引用的 7 个 `<script>` chunk 汇总。
- React / Vue / Svelte 数据：仅 import 挂载入口（`createRoot` / `createApp` / `mount`），用 `esbuild --bundle --minify` 生产构建，`zlib` 压缩测量。

| 框架（版本） | 原始 | gzip | **brotli（实际传输）** | 是否满足 45 KB 预算 |
|---|---|---|---|---|
| Next.js 16.3.4（App Router，单静态路由） | 567.6 KB | 174.2 KB | **150.6 KB** | ❌ 超 3.3 倍 |
| React 19.3.0 + ReactDOM（纯 SPA） | 217.4 KB | 67.3 KB | **57.9 KB** | ❌ 超 |
| Vue 3.5.42（runtime-only） | 51.9 KB | 20.7 KB | **18.9 KB** | ✅ 加应用代码约 34 KB |
| Svelte 5.57.0 | 39.1 KB | 14.8 KB | **13.4 KB** | ✅ 加应用代码约 28 KB |

**Next.js 为什么出局**：它的核心价值（SSR / SSG / ISR / RSC / 文件路由 / Server Actions）HaoNav 一个都用不上——前台是单视图、数据客户端拉一份 JSON、编辑后台是另一个独立页面。用 Next 等于为一个页面付整套服务端渲染框架的成本。更要紧的是平台适配成本：Next 上 Cloudflare 需要 `@opennextjs/cloudflare` 适配层，上 EdgeOne 要么用其适配、要么 `output: 'export'`——而 **static export 会直接废掉 API route**（正是当前项目踩过的坑）。Vue / Svelte 走 Vite，产物就是静态文件 + 一个独立 Edge Function，三家平台零改动。

**什么情况下该考虑 Next / Astro**：只有当**服务端渲染带来的 SEO 是硬需求**时。但即便如此，导航站这类"内容型静态站"的正解是 **Astro**（内容直出 HTML、首屏零 JS），或者启用本方案的**方案 C**（构建期把数据内联进 HTML），而不是 Next。

**更新模型差异（对 1000 张卡片有意义，但不是生死线）**：React 改一个状态要重跑组件函数并 diff 子树，靠 `memo` 与虚拟化压成本；Vue 在编译期提升静态部分、只 patch 变化的绑定；Svelte 5 编译成直接操作 DOM 的代码。**三者配合 4.6 的分段懒渲染都能稳定跑满 60fps**，所以这一条不构成选型依据。

### 4.2 目录结构

```
haonav/
├── web/                        # 前台（Vue 3 + Vite，入口 index.html）
│   ├── main.ts
│   ├── App.vue
│   ├── components/             # Sidebar / Header / LinkCard / ContextMenu / ...
│   ├── stores/nav.ts           # 唯一状态源（reactive + 乐观更新）
│   ├── lib/
│   │   ├── api.ts              # 只依赖 fetch，无平台假设
│   │   ├── cache.ts            # localStorage / IndexedDB 数据缓存
│   │   ├── search.ts           # 预建索引 + 防抖
│   │   └── icon.ts             # 本地 SVG 字母图标生成
│   └── styles/app.css          # Tailwind v4 + @theme
├── admin/                      # 后台（Vue 3 + Vite，入口 admin.html，独立 bundle）
│   ├── App.vue                 # 表格视图 + 多选 + 批量操作
│   └── panels/                 # Import / Export / Dedup / DeadLink / Snapshot / Settings
├── api/
│   ├── core.ts                 # ★ 全部业务逻辑（Hono app，零平台依赖）
│   ├── store.ts                # Store 接口 + 4 个实现
│   └── adapters/
│       ├── cloudflare.ts       # export default { fetch }        ← 用这个部署 CF
│       ├── edgeone.ts          # export async function onRequest ← 用这个部署 EdgeOne
│       ├── vercel.ts           # export const GET/POST = ...     ← 用这个部署 Vercel
│       └── dev.ts              # Vite middleware + 文件存储（本地开发）
├── shared/
│   └── schema.ts               # 类型 + zod 校验 + 迁移函数（前后端共享）
└── migrate/
    └── v0-to-v1.ts             # 读旧 KV 的 haonav_* + app_data → 合并去重 → 新文档
```

**核心设计约束**：`api/core.ts` 里不出现任何平台符号（不写 `env.HaoNav_KV`、不写 `wrangler`、不写 `c.env`）。所有平台差异被 `store.ts` 的实现类和 ≤ 10 行的 adapter 吸收。这是对当前"三套后端互相打架"的根本解法。

### 4.3 数据模型 v2

```ts
type Doc = {
  schemaVersion: 1;
  rev: number;                  // 乐观并发：每次写入 +1
  updatedAt: number;
  settings: {
    title: string;
    navTitle: string;
    favicon: string;
    cardStyle: 'detailed' | 'simple';
    searchEngines: SearchEngine[];
    accessMode: 'public' | 'locked';   // 取代现在失效的"全局锁"
  };
  categories: {
    id: string;                 // crypto.randomUUID()
    name: string;
    icon: string;
    order: string;              // ★ LexoRank 字符串，拖动只改 1 个字段
  }[];
  links: {
    id: string;
    title: string;
    url: string;
    urlKey: string;             // 规范化后的 url，用于去重（唯一索引）
    desc?: string;
    cat: string;
    order: string;              // ★ 同上
    pinned?: boolean;
    icon?: string;              // 只在用户显式抓取时才有值
    createdAt: number;
  }[];
  changelog: { at: number; ops: Op[] }[];   // 最近 50 批操作，支撑撤销
};
```

关键改进：

- **`order` 用 LexoRank 字符串**（相邻两项取中间值）。拖动排序 = 只写被拖动的**那一个**元素，不再重排整个数组。这同时解决了"未在顺序表中的项被赋 `Infinity`"的 bug。
- **`urlKey` 唯一索引** → 导入去重从"每次 O(n²) 比对"变成 `Set` 查表。
- **去掉 `Category.password`**。理由见 4.5。
- **`rev` + 操作日志**：写入走 `PATCH ops[]`，服务端原子应用。两端并发编辑时冲突窗口从"整份文档"缩小到"同一条链接"。
- **明确的 `schemaVersion` + 一次性迁移函数**，前后端共享同一份 `schema.ts`（用 zod 校验，KV 里读到脏数据能立刻发现而不是渲染时崩）。

### 4.4 API 契约

```
GET    /api/data            读全量文档。ETag + Cache-Control: public, max-age=60,
                            stale-while-revalidate=600。带 If-None-Match 时返回 304。
                            accessMode=locked 且无有效会话 → 401（真的挡在服务端）。
POST   /api/login           {password} → 校验 PBKDF2 哈希 → Set-Cookie: 签名会话
                            (HttpOnly, SameSite=Lax, Secure, 30d)。同 IP 限速 5 次/分钟。
POST   /api/logout
PATCH  /api/data            需会话。body: {rev, ops:[{type:'link.add'|'link.update'|
                            'link.move'|'link.delete'|'cat.*'|'settings.update', ...}]}
                            rev 不匹配 → 409 + 返回服务端最新版 → 前端提示合并/覆盖。
POST   /api/import          需会话。服务端解析 Netscape HTML / JSON，返回 diff 预览（不落库）
POST   /api/import/apply    确认后原子应用
GET    /api/export?format=html|json
GET    /api/icon?u=<host>   favicon 代理，首次抓取后存 KV/R2 并返回
                            Cache-Control: public, max-age=31536000, immutable
POST   /api/backup/snapshot 需会话 + 定期自动。把文档快照成一个带时间戳的 KV key（保留最近 7 份）
GET    /api/health
```

> **不包含 AI 相关接口** —— AI 与插件功能已确认全部删除（见 7）。API 面因此比初版方案更小，没有外部模型调用、没有密钥托管、也少一整类失败模式。

**CORS 全部去掉**。前后同一域名，`Access-Control-Allow-Origin: *` 纯属自伤。

### 4.5 安全设计（必须落地，不是可选项）

| 问题 | 现状 | 方案 |
|---|---|---|
| 访问控制 | GET 不传密码就放行 | `accessMode: 'public' \| 'locked'` 两种模式，**都在服务端强制**。个人导航站建议默认 `public`（谁能看都行、只有你能写），彻底不需要"全局锁" |
| 密码存储 | 明文 KV 比较 | PBKDF2-SHA256（WebCrypto，210k 轮）哈希，或直接用部署时配置的 `ADMIN_PASSWORD_HASH` secret。**删掉"首次使用自动注册密码"逻辑**（那是接管漏洞） |
| 会话 | 密码即长期令牌，明文存 localStorage | HMAC-SHA256 签名的 `{exp, sub}` 会话 cookie，HttpOnly，30 天过期，密钥来自 secret |
| 分类锁 | 明文密码随 JSON 下发，纯装饰 | **建议直接删除**。理由：站点要么公开（那把分类藏起来没意义，接口能拿到）、要么整站锁（那所有分类都在锁内）。保留一个"服务端隔离版"是可行的，但会增加 `/api/data` 的复杂度，收益远低于成本 —— 属于你要求里"用处不大可以去掉"的范畴 |
| Origin | `*` 全网可读 | 同源；写接口校验 `Origin` |
| 密钥 | `GEMINI_API_KEY` 被 `define` 内联进公开 JS | 全部移服务端 secret。前端永不出现 API Key |

### 4.6 读路径设计（性能的关键）

一个导航站 99.9% 的流量是"读"，所以读路径必须做到"零计算、零第三方"。

```
第 1 次访问                          第 2 次及以后
─────────────                       ─────────────
HTML+CSS 直出骨架（<300ms 可见）      同上
       ↓                                  ↓
读 localStorage 缓存 → 有则立刻渲染     内联脚本把缓存 JSON 注入 window.__NAV__
       ↓（无缓存）                        → 首帧直接绘出全部卡片，LCP < 400ms
请求 /api/data（被 CDN 边缘缓存）             ↓
       ↓                              后台拉 /api/data 比对 rev，有变化才更新
写 localStorage
```

四层优化叠加：

1. **CDN 边缘缓存**：`GET /api/data` 带 `stale-while-revalidate`，绝大多数请求拿不到函数执行（省 Worker 调用、省 KV 读）。
2. **客户端缓存秒开**：localStorage 或 IndexedDB（文档 > 1 MB 时）缓存整份文档 + `rev`，配合一段内联脚本在首帧前注入，**二次访问接近零网络等待**。
3. **零第三方图标请求**：默认全部用本地生成的字母 SVG 图标（0 请求、0 延迟），只有用户主动"抓取图标"才走 `/api/icon` 代理，抓一次永久缓存。
4. **跳过视口外渲染**：给每个分类 section 加 `content-visibility: auto` + `contain-intrinsic-size`（约 3 行 CSS），浏览器自动跳过视口外内容的渲染、布局与绘制。1000 个链接时**实际参与渲染的节点从 ~12,000 降到 <1,500**，且不改视觉、不加依赖。详见 6.1。

### 4.7 编辑路径设计（`/admin`）

这是当前版本最薄弱的环节（只能靠右键菜单一条条改）。新后台：

- **主视图**：所有链接的表格 / 紧凑网格，支持按分类、置顶、有无描述、域名筛选。
- **多选批量操作**：批量改分类、批量删、批量置顶、批量补描述。
- **拖拽排序**：直接在表格里拖（LexoRank，单条写入）。
- **重复检测**：按 `urlKey` 一键列出重复项与冲突，勾选合并。
- **死链检测**：按需触发，服务端 HEAD 并发探测（限流），标记失效并提供"归档/删除"。
- **导入 diff 预览**：服务端解析后返回"新增 X / 已存在 Y / 冲突 Z"，确认才落库。
- **撤销**：基于 `changelog`，最近 50 批操作可回滚。
- **设置区**：标题 / 图标 / 卡片样式 / 访问模式 / 搜索引擎。
- **入口隔离**：`admin.html` 是独立构建产物，访客的 45 KB 预算里不含任何后台代码。

### 4.8 存储方案决策（KV / Blob / 数据库）

**这不是三选一，而是四种形态的数据该去的四个地方。**

事实对照（已核实，2026-09）：

| | Cloudflare KV | Cloudflare R2（对象存储） | Cloudflare D1（SQLite） | EdgeOne KV | EdgeOne Blob |
|---|---|---|---|---|---|
| 读额度 | 100,000 / 天 | Class B 10M / 月 | 5M 行 / 天 | 含在函数额度内 | 含在函数额度内 |
| 写额度 | **1,000 / 天** | Class A 1M / 月 | **100,000 行 / 天** | 含在函数额度内 | 含在函数额度内 |
| 一致性 | 最终一致（~60 s 全局传播） | 强一致 | 强一致 | 最终一致（边缘缓存 ≤60 s） | 可选强一致 |
| 单值上限 | 25 MB | 单对象极大 | 行级 | 25 MB | 25 MB |
| 查询能力 | 无 | 无 | 完整 SQL | 无 | 仅目录层级 |
| 免费容量 | 1 GB | 10 GB（启用是否需绑卡需确认） | 5 GB | 1 GB | 按量计费 |

**三个决定性认知：**

1. **KV 的写是按 key 计费，不是按条。** Cloudflare 文档明确"per-key basis"。所以「一次 PATCH 改 100 条链接」= **1 次 KV 写**。1,000 写/天 实际等于"每天能保存 1,000 次"，对个人导航站绰绰有余。真正会打爆额度的是**当前实现的方式**（每改一条就全量 POST 一次），而不是 KV 本身。

2. **KV 最大的陷阱是最终一致（~60 s），不是额度。** 写完立刻回读可能拿到旧值——这正是当前 `saveLinks() = loadAll() + saveAll()` 的真实丢写风险来源。设计上必须「写后不回读 + 乐观更新 + `rev` 冲突检测」。

3. **数据库的价值在"查询"，而 HaoNav 不需要查询。** 这里的数据永远是**整份读、整份写**（一个 JSON 文档）。上了 SQL 之后，每次读仍要 join 回同一个 JSON 形状，等于白付一次序列化 + 一次网络往返。数据库不是"更高级"，只是另一种形状的取舍。

**最终布局（已确认）：只用 KV 一种存储。**

| 数据 | 存放 | 写入频率 |
|---|---|---|
| 主文档 `nav:v1`（链接 + 分类 + 设置） | KV 单键 | 每次保存 1 次写 |
| 站点图标（按域名一个 key） | KV 单键 + `immutable` 长缓存 | 每个域名一辈子只写 1 次 |
| 每日快照（保留 7 份） | KV 带 TTL 的 7 个 key | 每天 1 次写 |
| 关系型数据 | **不存在** | — |

**推算额度占用**：一天最多 50 次保存 + 7 次快照 + 零星图标抓取 ≈ **60 次写/天**，对比 Cloudflare 免费版 1,000 写/天上限，用量约 6%。**完全不需要 Blob，也不需要数据库。**

**已确认：不需要 R2（Cloudflare）/ Blob（EdgeOne）对象存储。**

理由逐条：
- **图标不需要它**：浏览器的 `Cache-Control: immutable` 会让同一域名一辈子只请求一次，所以图标产生的 KV 读取量极低，用 R2 省不出东西。
- **快照不需要它**：每天只写 1 次，保留 7 份约 2.8 MB，KV 的 1 GB 容量与 1,000 写/天都远远够用。R2 那句"写入无次数压力"在这里毫无价值。
- **它带来的成本是实打实的**：多一个绑定、多一处凭证、多一套 SDK（`@edgeone/pages-blob` 或 R2 binding）、多一层跨平台适配。而收益是 0。**引入 Blob 只会让本来已经收敛的架构重新变复杂。**
- **额外风险**：R2 与 EdgeOne Blob 通常需要单独开通，Cloudflare R2 可能要求绑定支付方式 —— 这与"只用免费套餐、越简单越好"的目标直接冲突。

**真正需要对象存储的触发条件**（出现任一条再引入）：
- 增加**用户上传附件**类功能（自定义图标原图上传、批量导入时的原始 HTML 归档、导出 zip 打包下载）
- 数据总量超过 KV 的 1 GB
- 出现一天 10 万次以上的图标读取（即每天有上万不同域名的新访客）—— 对个人导航站不可能发生

**一个必须守住的约束**：Cloudflare KV 单值上限 25 MB。**图标绝对不能以 data URL 内联进主文档** —— 那会让每次保存都重传几 MB，同时逼近上限。图标必须独立成 key。

**数据库为什么用不上**：见上文第 3 条。整个文档已经在 Worker 内存里，去重、导入 diff、死链检测这些"看起来需要查询"的操作，直接在内存里对数组做即可，一次 KV 读就够，不需要 SQL。

**什么时候才该上 D1（明确的触发信号）：**
- 需要**点击量／访问记录**这类高频、细粒度、持续增长的写入（KV 的 1,000 写/天 会立刻被打爆，D1 是 100,000 行/天）
- 需要**多用户账号体系**、分享、协作
- 需要**服务端查询**：跨表筛选、分页、按标签多对多检索
- 链接量级进入 **10,000+** 且需要服务端全文检索
- 需要**逐条链接的修订历史**（每条记录一行，而不是整份文档重写）

以上任一条出现时才引入 D1；在此之前引入都只会增加迁移、schema 和运维成本，换不来任何性能收益。

---

## 5. 平台适配（一份代码，多平台）

已核实的免费额度（2026-09）：

| 平台 | 静态托管 | 函数额度 | KV 额度 | 适配结论 |
|---|---|---|---|---|
| **Cloudflare** | Pages 无限带宽 | Workers Free **100,000 请求/天** | KV Free：**100,000 读/天 · 1,000 写/天 · 1 GB** · 单值上限 25 MB | ✅ **首选**。额度最宽裕，但**1,000 写/天 是硬约束**，所以写入必须合并成 PATCH |
| **EdgeOne Makers** | Pages 流量/请求不限量 | Edge Functions **300 万请求/月** | KV：1 GB，**仅 Edge Functions 可调用**，最终一致（边缘缓存 ≤60 s） | ✅ **备选**。函数的写入限制比 CF 宽松，适合"编辑很频繁"的用法。注意 KV 只能在 Edge Function 用，Node Function 不行 |
| **Vercel** | Hobby 100 GB 带宽/月 | 函数调用额度较紧，冷启动明显 | 无自带 KV，需接 Upstash（10k 命令/天） | ⚠️ **第三备选**。额度最紧、且 Hobby 明确禁止商业用途 |

**共同约束（决定写入设计）**：三家的 KV 都是**最终一致**（EdgeOne 明确"边缘缓存最长 60 s"，Cloudflare 也是 ~60 s 全局传播）。这带来一个必须遵守的规则：

> **写完不要立刻回读。** 客户端写完 PATCH 后，直接乐观更新本地状态（并把新 `rev` 写到 localStorage 缓存），**不要马上 `GET /api/data`**，否则可能读回旧值并覆盖掉你刚保存的内容。当前代码 `syncToCloud` 后没有回读，这点是对的；但 `saveLinks()` 里的 `loadAll() → saveAll()` 是先读后写，**在最终一致的 KV 上存在真实的丢写风险**。

### 5.1 部署平台推荐（已确认）

**结论：主要在国内访问 → EdgeOne Makers 首选；主要面向海外 → Cloudflare 首选。Vercel 不作为目标平台。**

关键决定因素不是额度（三家都够用），而是**中国大陆的访问质量**：

| 维度 | EdgeOne Makers | Cloudflare | Vercel |
|---|---|---|---|
| 中国大陆节点 | ✅ 有 | ❌ 无（需绕道香港/日本/新加坡） | ❌ 无 |
| 国内访问延迟 | 好 | 一般，且偶发不稳定 | 一般 |
| 平台二级域名国内可达性 | 正常 | `*.pages.dev` / `*.workers.dev` 可达性不稳 | `*.vercel.app` 可达性不稳 |
| 静态托管额度 | 流量/请求不限量 | 无限带宽 | 100 GB 带宽/月 |
| 函数额度 | 300 万请求/月 | 100,000 请求/天（≈300 万/月） | 较紧 |
| KV | 1 GB，仅 Edge Functions 可调用 | 1 GB，读 10 万/天 · **写 1,000/天** | 无自带 KV，需外接 Upstash |
| 商业使用限制 | 无 | 无 | ⚠️ Hobby 明确禁止商业用途 |

**推荐做法：两家都部一份，用同一个域名路径做 A/B 实测再定。** 因为架构已经把平台差异收敛成 `api/adapters/` 里的一个文件，**同时部署两家的增量成本几乎为零** —— 各跑一次 `deploy` 就能拿到真实的首屏耗时和 TTLB 数据，这比看任何评测都可靠。

两个注意事项：
- **自定义域名**：国内 CDN 接入自定义域名通常涉及备案，用平台提供的二级域名则不需要。具体以控制台提示为准。
- **Cloudflare 的 1,000 写/天** 是唯一需要留意的硬上限。按 4.8 的推算实际用量约 60 次/天，安全；但**必须避免"逐条保存"式的实现**，否则很容易撞限。

平台切换成本：改 `api/adapters/` 里的一个 import + 部署配置，业务代码零改动。

---

## 6. 界面重构方案（左目录 + 右内容）

**布局结论：保持"左侧目录 + 右侧内容"的双栏结构**（与现状同构，所以观感不会突变），但内部实现全部重写，并且这次可以顺手修掉现有 UI 的几个低效设计。

### 6.1 最快渲染方案（核心）

按投入产出排序，前三条是必做，第四条是可选升级：

**① 布局零 JavaScript。** 用纯 CSS Grid：
```css
.app { display: grid; grid-template-columns: 16rem 1fr; height: 100dvh; }
.content { overflow-y: auto; }
```
不用 JS 计算尺寸、不用 `ResizeObserver`。移动端抽屉用 `transform: translateX(-100%)`（GPU 合成，不触发重排），保留现有交互。

**② `content-visibility: auto` —— 一行 CSS 胜过手写虚拟滚动。**
```css
.cat-section {
  content-visibility: auto;
  contain-intrinsic-size: auto 640px;
}
```
浏览器会**自动跳过视口外 section 的渲染、布局与绘制**。这是本方案里性价比最高的一条：不需要引入任何虚拟滚动库、不改变视觉与交互、代码量约 3 行，却能把 1000 张卡片的渲染工作量压到只处理可见的几十张。

> 注意 `contain-intrinsic-size` 必须给一个合理的高度估值，否则滚动条会跳动。这是该方案唯一的注意点。

**③ 预分组 + 预建搜索索引，修掉当前的 O(分类×链接) 重复计算。**
数据加载时一次性构建：
- `Map<catId, Link[]>` —— 分类分组只算一次，而不是每次 render 都对每个分类跑一遍 `filter`（这是当前代码的 P1 缺陷）
- 每条链接预生成小写 `haystack`（`title + url + desc`）—— 搜索退化为一次 `filter`，1000 条约 1 毫秒，再配 80ms 防抖

**④ 可选升级：section 级懒挂载。** 只有在实测发现滚动仍不流畅时才启用（典型触发条件是单个分类超过 500 条）。做法是给 section 挂 `IntersectionObserver`，进入视口前只渲染前 12 张卡片。**先不要做** —— `content-visibility` 已经覆盖了 99% 的场景，过早优化只会增加复杂度。

**⑤ 滚动联动改用 `IntersectionObserver` 观察 section 可见性来高亮左侧分类**，主线程零成本。当前实现是在 `scroll` 事件里循环调用 `getElementById` 并读取 `offsetTop`（会强制同步布局），而且这段联动已经被注释禁用了 —— 用 IO 重做，成本极低且能恢复这个实用功能。

**⑥ 图标零请求。** 默认全部使用本地生成的字母 SVG 图标（与现状"无图标时显示首字母"视觉一致），彻底消灭 1000 次第三方 favicon 请求。真实图标改为后台按需抓取，抓到后走 `/api/icon` + `immutable` 长缓存。`<img>` 统一加 `loading="lazy" decoding="async"` 与固定宽高。

### 6.2 导航逻辑（已确认，与现有行为一致）

| 左侧选中 | 右侧渲染内容 |
|---|---|
| **全部链接**（默认） | 置顶区（全部置顶链接）+ **所有分类** section（每个 section = 分类标题 + 该分类的卡片网格） |
| **任一具体分类** | 置顶区（**跨分类的全部置顶链接**）+ **仅该分类**的 section |

补充规则（沿用现有行为）：

- 两个视图**都显示置顶区**；单分类视图下的置顶区展示的是**跨分类的全部置顶链接**，而不是该分类自己的置顶项
- 站内搜索时只显示命中的分类 section（无命中的分类整体隐藏），置顶区隐藏
- 左侧当前项高亮；在「全部链接」视图下滚动时，用 `IntersectionObserver` 联动高亮左侧对应分类（单分类视图只有一个 section，不需要联动）

**这对性能设计的影响（很重要）：**

- **「全部链接」既是默认视图，也是最重的视图** —— 所有分类的所有卡片都要渲染。6.1 的 `content-visibility` 主要就是为它服务的
- **单分类视图天然很轻**（只渲染 1 个 section + 置顶区），不需要任何额外优化
- 所以性能优化只需要盯住「全部链接」这一个视图，目标非常集中

**因为导航逻辑与现有一致，用户的操作习惯不需要重新学习** —— 重写后的验收重点因此落在视觉与手感，而不是交互逻辑，风险显著降低。

### 6.3 分区渲染策略

| 区域 | 渲染策略 | 1000 链接时的规模 |
|---|---|---|
| 左侧目录 | 全量渲染 + `:key` 复用，不做虚拟化 | 10–100 项，永久不参与滚动性能问题 |
| 右侧「置顶」区 | 全量渲染（通常 ≤ 20 项） | ≤ 20 张卡片 |
| 右侧分类 section | 容器全量渲染 + `content-visibility` 跳过视口外内容 | DOM 约 12,000 节点，**实际参与渲染的 < 1,500** |
| 卡片内部 | 纯 CSS，无 JS 参与布局 | — |
| 所有浮层（右键菜单 / 弹窗） | 按需挂载（不用时不在 DOM 中） | 现状是 14 个弹窗常驻挂载，改为 `v-if` 按需 |

### 6.4 具体规格（沿用现状数值，保证观感连续）

- 侧栏宽 `16rem`，顶栏高 `4rem` —— 与现状一致
- 卡片网格列数沿用现值：详情模式 `2 / md:4 / lg:6 / xl:8`；简洁模式 `2 / md:5 / lg:8 / xl:10`
- 断点 `lg`(1024px) 以下侧栏转抽屉 + 遮罩
- 主题：`<html class="dark">` + CSS 变量，无 JS 参与渲染
- 保留：置顶区、分类 section（图标 + 标题 + 下分割线）、卡片两态、右键菜单、复制 Toast、二维码弹窗、全部动效与圆角

### 6.5 顺手补上的低成本增强

- **分类标题 `position: sticky` 吸顶** —— 长列表滚动时始终知道自己在哪个分类，成本为 0
- **左侧分类项显示链接数徽章** —— 一眼看出哪个分类内容多
- **键盘快捷键**：`/` 聚焦搜索、`Esc` 清空 —— 约 10 行代码
- 去掉侧栏硬编码的 Fork 按钮（改成设置项），去掉只为 README 服务的根目录图片与 docx

### 6.6 验收方式

用 Playwright 在改造前对 8 个关键状态（浅色首页 / 深色首页 / 简洁模式 / 移动端抽屉展开 / 链接右键菜单 / 编辑弹窗 / 后台表格 / 空态）截图存为基线，改造后逐张对比；另加 Lighthouse 移动端 Performance ≥ 95、滚动与输入期间无长任务（>50ms）。

---

## 7. 功能取舍清单

### 功能取舍结论（AI 与插件：全部删除 —— 已确认）

**用户已确认：AI 功能和浏览器插件一律不做。** 这一刀砍掉的不只是两个功能，还连带移除了三个依赖、一个后端接口和一整类安全面。

#### 删除清单与连带影响（体积为实测）

| 删除项 | 连带影响 | 体积收益 |
|---|---|---|
| **AI 全部**（补描述 / 猜分类 / AI 设置 UI） | `services/geminiService.ts` 整个文件删除；`@google/genai` 依赖删除；`types.ts` 的 `AIConfig` / `AIProvider` 删除；`App.tsx` 的 `aiConfig` state、`AI_CONFIG_KEY`、`handleSaveAIConfig` 删除；`LinkModal` 的 `aiConfig` prop 删除；原定的 `POST /api/ai/enrich` 接口取消；"浏览器明文 Key + 前端直连模型"的安全问题一并消失 | `@google/genai` = 358.3 KB raw / **49.4 KB brotli** |
| **浏览器插件全部**（扩展生成器） | `SettingsModal` 内约 660 行扩展模板字符串与 zip 打包逻辑删除；`jszip` 依赖删除（**它唯一的使用点就是打包扩展文件**，见 `SettingsModal.tsx:729`） | `jszip` = 96.4 KB raw / **26.3 KB brotli** |

**合计省下 75.8 KB brotli**（genai 49.4 + jszip 26.3），而且这是"净"收益 —— 不需要写任何替代代码就能拿到。

**设置弹窗大幅瘦身**：`SettingsModal.tsx` 现在 1,092 行，内含 `site`（站点设置）/ `ai`（AI 设置）/ `tools`（扩展工具）三个 tab，**后两个全部删除**。删完后预计剩 **230 行左右，约为原来的 1/5**。

**那日常录入新链接怎么办？** AI 和插件都没了之后，加一条链接的最快路径是：打开本站 → 添加 → 粘贴 URL。批量录入继续靠**导入浏览器书签 HTML**（这正是替代"插件一键保存"的主要途径，保留不删）。平时用浏览器自带收藏积累，隔段时间导入一次即可。

> 如果将来确实觉得"一键保存当前页"必不可少，成本最低的补救是一条 **Bookmarklet**（一行 JS 存到书签栏，点击即把当前页 POST 到你的 API，约 1 小时工作量）。**不在本次改造范围内**，此处仅作为未来可选项记录。

#### 全功能实用性评估

| 功能 | 实用性 | 结论 |
|---|---|---|
| 站内搜索 | 高 | 保留 |
| 分类分组网格 | 高（核心） | 保留 |
| 置顶 | 高 | 保留 |
| 深色模式 | 高 | 保留 |
| 导入浏览器书签 | 高 | 保留，移到服务端解析 |
| 导出 HTML / JSON | 高 | 保留 |
| 每日自动快照 | 高 | **新增**（替代 WebDAV） |
| 二维码 | 中高（手机扫码打开很有用） | 保留，改本地生成 |
| 站外搜索跳转 | 中 | 保留，但简化：固定几个引擎 + 搜索前缀触发，不做完整 CRUD 管理 UI |
| 拖拽排序 | 中 | 保留，改 LexoRank 单条写入 |
| 右键菜单 | 中 | 保留 |
| 全局访问密码 | 中 | 保留，修成正确的服务端会话 |
| 重复检测 / 死链检测 | 中 | **新增**（后台按需触发） |
| 搜索引擎管理 UI | 低 | 简化为"固定 + 自定义"，不做完整管理面板 |
| AI 补描述 / 猜分类 / AI 设置 | — | **全部删除（已确认）** |
| 浏览器插件 / 扩展生成器 | — | **全部删除（已确认）** |
| 分类密码锁 | 低（假安全） | **删除** |
| WebDAV 备份 | 无（从未工作过） | **删除** |

### ✅ 保留（价值高、成本低）

站内搜索 · 分类分组网格 · 置顶 · 卡片两态（详细/简洁）· 深色模式 · 导入浏览器书签 · 导出 HTML/JSON · 每日快照 · 二维码（改本地生成）· 右键菜单 · 拖拽排序（改 LexoRank）· 访问密码保护（改为正确的服务端会话）· 站外搜索（简化版）

### 🔧 改造

| 功能 | 现状问题 | 改造方式 |
|---|---|---|
| 备份 | WebDAV 假成功 | **删除 WebDAV**。改为：① 服务端每日自动快照到 **KV**（保留 7 份，1 次写/天）；② 一键导出 JSON/HTML |
| 站外搜索 | 一整套引擎 CRUD 管理 UI，使用频率低 | 简化为固定几个引擎 + 搜索前缀触发（如 `g 关键词`），保留自定义但不做完整管理面板 |
| 访问锁 | 可绕过 + 接管漏洞 | `accessMode: public \| locked`，服务端强制 |
| 排序 | 隐式下标，易错 | LexoRank，单条写入 |
| 导入 | 浏览器解析卡死 | 移到服务端，先出 diff 再落库 |

### ❌ 删除（你要求"用处不大可以去掉"）

| 删除项 | 理由 |
|---|---|
| **WebDAV 备份**（`webDavService` + `functions/api/webdav.ts`） | 从未真正工作过，还"假报成功"。KV 快照 + 导出完全覆盖其价值 |
| **Chrome/Edge 扩展生成器**（`SettingsModal` 内约 500 行模板字符串） | 生成的代码有确定性 bug（`parentId` 写错、写入 key 与网页端不一致），整条链路不通；且无法维护。**替代**：给一条真实的 Bookmarklet（1 行 JS，点击即把当前页 POST 到本 API），零维护、零安装、功能等价 |
| **`CategoryManagerModal`**（328 行） | 无入口的死代码，功能被新 `/admin` 完全覆盖 |
| **`CategorySortModal`**（247 行） | 同上 |
| **三套后端中的两套**（`edgefunctions/` + `api/storage.ts`） | 保留一个 `api/core.ts` + 平台适配器 |
| **`functions/api/health.ts`** | 新 API 自带 `/api/health` |
| **`metadata.json` + `index.html` 的 importmap** | AI Studio 残留，与 Vite 打包冲突 |
| **`index.html` 中重复的内联脚本** | 复制粘贴残留 |
| **`uuid` 依赖** | 导入却未使用；改用 `crypto.randomUUID()` |
| **`buffer` 依赖** | 未发现使用点 |
| **`@dnd-kit`（3 个包）** | 用约 80 行原生 Pointer Events 替代 |
| **`api.qrserver.com` 依赖** | 改本地生成 |
| **根目录 10 张 PNG + docx + screenshots/（1.16 MB）** | 只服务 README，移出仓库或压缩后放 `docs/` |
| **侧边栏硬编码的 Fork 按钮** | 个人实例上无意义，改为设置项 |
| **AI 全部**（补描述 / 猜分类 / AI 设置 UI） | 已确认删除。连带移除 `services/geminiService.ts`、`@google/genai`（49.4 KB brotli）、`types.ts` 的 `AIConfig`/`AIProvider`、`App.tsx` 的 `aiConfig` 与 `AI_CONFIG_KEY`、`LinkModal` 的 `aiConfig` prop。详见 7 的删除清单 |
| **浏览器插件全部**（扩展生成器） | 已确认删除。连带移除 `jszip`（26.3 KB brotli）与 `SettingsModal` 内约 660 行扩展模板。详见 7 的删除清单 |
| **分类密码锁** | 见 4.5 —— 要么服务端隔离（成本高、收益低），要么删除。建议删除 |
| **组件内 `alert()` / `confirm()`** | 统一换成现有风格的 Toast / 确认弹窗 |

### 🆕 新增（直接服务"编辑方便"）

`/admin` 表格后台 · 多选批量操作 · 重复链接检测与合并 · 死链检测 · 导入 diff 预览 · 操作撤销 · 每日自动快照

---

## 8. 迁移方案（数据零丢失）

**风险最高的一步，必须干跑验证。**

1. **先备份，再动手**
   - 用现有站点导出 HTML 书签（`导出 HTML`）+ 从控制台把 KV 里所有 key 导出为 JSON。
   - **两个 key 都要导出**：`haonav_*`（网页端写的）**和** `app_data`（扩展写的）。只导一个就会丢数据。
2. **盘点**：写个只读脚本统计两个 key 各自有多少条、`url` 去重后真实条数是多少、有多少条只在 `app_data` 里。（这能直接量化"扩展存的书签"到底丢了多少）
3. **迁移脚本**（`migrate/v0-to-v1.ts`，**只读旧数据，写到新 key**）：
   - 合并两个来源 → 按规范化 `urlKey` 去重（保留字段最全的那条，`description` / `icon` / `pinned` 做字段级合并而不是整条取舍）
   - 补齐 `order`（按原数组下标生成初始 LexoRank 序列）、`id`（原来 `Date.now()` 生成的重复 ID 重新分配）
   - 丢弃 `Category.password`（记录到迁移日志里，告知用户哪个分类的锁被移除了）
   - 输出到新 key `nav:v1`，**旧 key 保留不动**（回滚保险）
4. **干跑对比**：脚本先输出"迁移前 vs 迁移后"的条数、分类数、去重明细报告，人工确认无误再执行写入。
5. **回滚预案**：旧 key 不删；新版本上线后若发现异常，切回旧代码即可（旧 key 仍在，数据完整）。
6. **灰度**：新版本先部署到预览环境 / 新域名验证，旧站保持在线，确认无问题再切换。

---

## 9. 备选方案

### 方案 B：保留 React，就地加固（风险最低，收益约 70%）

如果你更看重"少改、不动 UI 结构"，可以保留 React 19，只做以下几件事：

1. 装真正的 Tailwind v4，删掉 CDN script → **省 123 KB gzip 阻塞 JS + 消除白屏**
2. 删掉 `Icon.tsx` 的 `import * as`，改成显式具名映射 → **实测省 137.5 KB brotli**
3. `@google/genai` 和 `jszip` 改 `await import()` 动态引入 → **实测省 75.2 KB brotli**
4. 每次 render 的 `categories.map(filter)` 改成 `Map<catId, Link[]>` 预分组 + 搜索防抖
5. 卡片列表加分段懒挂载
6. 图标改本地生成 + `loading="lazy"`
7. 后端收敛成一套 + 修安全漏洞 + 加 `/admin`

**结果**：首屏 JS 从 280 KB 降到约 **67 KB brotli**（因为 React + ReactDOM 自身的 57.9 KB 运行时地板无法再降），加构建期 CSS 12 KB ≈ 79 KB，LCP ~800ms。**工作量约为方案 A 的 40%，视觉漂移风险最低，但 `App.tsx` 仍是 1600 行、仍要背 React 的 57.9 KB 运行时。**

> 选择建议：**想彻底解决、愿意重写 → 方案 A。想以最小风险先止血 → 先做方案 B 的 1、2、3、7 步，再决定要不要迁 A。**（这几步在方案 A 里也是必做的，不浪费。）

### 方案 C（可选开关）：数据构建期内联

把文档在构建时注入 HTML，首屏连 `/api/data` 请求都省掉；编辑后通过 Cloudflare Deploy Hook（免费）触发重建。

- 收益：首屏 0 数据请求，最极致的首屏
- 代价：保存后需 30–90 秒才生效
- 结论：**作为方案 A 的可选开关**，适合"内容很少改"的用法。默认关闭。

---

## 10. 实施路线图

| 阶段 | 内容 | 产出 / 验收标准 |
|---|---|---|
| **P0 · 止血** | ① 全量导出两个 KV key 备份 ② 修 `GET` 的无密码放行 ③ 去掉 `Access-Control-Allow-Origin: *` ④ 装真 Tailwind 删 CDN ⑤ 修 `Icon.tsx` 的 `import *` | 立刻见效；首屏 JS 从 359 KB 降到约 60 KB，白屏消失。**不改变任何架构，当天可完成、可回滚** |
| **P1 · 地基** | 新 `shared/schema.ts`（类型 + zod 校验 + 迁移函数）；`api/core.ts` + `store.ts` + dev adapter；Vitest 覆盖迁移与去重逻辑 | 迁移脚本**干跑**输出对比报告，人工确认；API 单测全绿 |
| **P2 · 前台** | Vue 3 重写前台，达成第 3 节全部性能预算 | Playwright 8 张截图与基线逐像素对比通过；Lighthouse 移动端 Performance ≥ 95 |
| **P3 · 后台** | `/admin` 表格 + 批量操作 + 导入 diff + 重复检测 + 撤销 | 改一条链接 ≤ 3 次点击；批量改 50 条分类 ≤ 2 次操作 |
| **P4 · 平台适配** | Cloudflare 适配器 + 部署；EdgeOne Edge Function 适配器；Vercel 适配器（可选）；Bookmarklet | 三家平台各部署一次验证同一份代码可跑通 |
| **P5 · 切换** | 灰度到预览域名 → 验证 → 切正式域名 → 观察 1 周 → 旧站下线 | 旧 KV key 保留 30 天再清理 |

---

## 11. 风险与注意事项

| 风险 | 说明 | 应对 |
|---|---|---|
| 迁移丢数据 | 数据分散在两个不同 key（`haonav_*` 与 `app_data`） | 干跑对比 + 旧 key 不删 + 灰度 |
| 免费额度写入限制 | **Cloudflare KV 免费版仅 1,000 写/天** | 写入合并成 PATCH + 防抖；避免任何"逐条保存"；EdgeOne 备选（函数额度更宽） |
| KV 最终一致 | 三家 KV 都有 ≤60s 边缘缓存，写完立刻回读可能拿到旧值 | 乐观更新 + 写后不回读；`rev` 冲突检测在服务端做 |
| 视觉漂移 | 重写 14 个组件（含大量命令式右键菜单/点击外部关闭逻辑） | Tailwind 类名 1:1 照抄 + Playwright 截图回归 + 分阶段切换 |
| 单值大小上限 | KV 单值 25 MB（三家一致） | 图标**不进**文档，走 `/api/icon` 独立缓存；2000 条链接约 400 KB，安全 |
| 后台暴露 | `/admin` 是公开路径 | 登录后才可写；可选加路径混淆或 Cloudflare Access（免费版可用） |

---

## 附：立刻可做的 5 个低成本高收益修复

如果暂时不想大动，按这个顺序做，**每一步都能独立上线、独立回滚**：

1. **装真 Tailwind**（删 `cdn.tailwindcss.com`）→ 省 123 KB gzip 阻塞脚本，白屏消失。
2. **修 `Icon.tsx`**：把 `import * as LucideIcons` 换成显式具名导入 → 实测省 **137.5 KB brotli**（146.0 KB → 8.5 KB）。
3. **删掉 AI 与扩展生成器**（功能已确认不要）→ 连带移除 `@google/genai` 与 `jszip`，实测省 **75.8 KB brotli**（49.4 + 26.3），**不需要写任何替代代码**。
4. **修 `GET /api/storage` 的 `: true`** → 关闭"不传密码即可读取全部数据"。
5. **修 `IS_EDGEONE_ENV`**：不要再猜域名，改成"探测 `/api/health` 返回的平台标识"或直接用构建期变量 → 修复 EdgeOne 上登录永远失败的问题。

做完 1–3 步，首屏 JS 从 **280 KB brotli 降到约 67 KB**（剩下的是 React 自身 57.9 KB 的运行时地板），且**不需要改动任何架构**——这是投入产出比最高的一步。
