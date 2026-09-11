# HaoNav 项目长期备忘

## 项目定位与用户硬要求

- HaoNav 是「可部署在 Cloudflare / EdgeOne Makers / Vercel 免费套餐上的网址导航站」，源自一个 Google AI Studio 导出的 React 模板。
- 用户的三条硬要求（2026-09 确认）：**界面视觉尽量不变** · **运行要快** · **编辑要方便**（前台或后台皆可）。
- 迁移成本不设限：语言 / 框架 / 依赖 / 架构均可推翻重来。

## 已确认的技术决策

- **前端框架：Vue 3 + Vite**（已确认）。实测运行时基线 brotli 18.9 KB，加应用代码约 34 KB，落在 45 KB 预算内。备选 Svelte 5（13.4 KB），**Next.js 已排除**（基线 150.6 KB，且上 EdgeOne 需 static export 会废掉 API route）。
- **后端：Hono 单一 API**（`api/core.ts` 零平台依赖），平台差异收进 ≤10 行 adapter。
- **存储分工**：主文档 → KV 单键；站点图标 → KV 单键 + 长缓存；快照备份 → KV（带 TTL）；数据库（D1）暂不启用。**R2 / Blob 也不用**。
- **构建方式**：Vite 双入口 —— `index.html`（前台）+ `admin.html`（编辑后台，独立 bundle，访客不下载）。不用路由。
- **样式**：Tailwind v4 构建时产出。**严禁再用 `cdn.tailwindcss.com`**。
- **站点设置零硬编码**（用户硬性要求）：三层配置 —— L1 `site.config.json` 出厂默认 / L2 KV `settings` 运行时覆盖（改后台秒级生效，不需重新构建）/ L3 部署 secret。
- **后台可配置项最终收敛为 12 项**（9 项站点设定 + 3 项备份）：
  - 站点设定：`name`（合并 title+navTitle）、`icon`（合并 logo+favicon，favicon 由它派生）、`accent`、`themeDefault`、`cardStyle`、`openInNewTab`、`searchEngines`、`iconStrategy`、`footerLinks`
  - 备份：`backup.mode`（auto/manual）、`backup.frequency`（daily/weekly）、`backup.retention`（1–30，默认 7）
  - **已裁减 10 项**（避免过度设计）：`description`、`lang`、`theme.radius`、`density`（我提议后自我撤回）、`stickyCategoryTitle`、`showPinnedSection`、`defaultCategoryView`（改为"记住上次选中"）、`defaultSearchMode`、`searchPrefixes`、`texts`、`accessMode`（已确认删除）
  - **分工原则**：后台管"站点设定"（写 KV，全站生效）；前台管"个人偏好"（写 localStorage，仅本机生效）。优先级：个人偏好 > 站点默认。
- **导航逻辑（已确认）**：**保留「全局置顶区」，每个视图顶部都显示**。
  - 「全部链接」（默认）→ 置顶区（全部置顶链接）+ 所有分类 section
  - 某个分类 → 置顶区（**跨分类的全部置顶链接**）+ 仅该分类 section
  - 置顶链接**同时出现在置顶区和它所属分类里**（沿用现有行为，用户确认要这样）
  - 站内搜索时隐藏置顶区；没有置顶链接时置顶区自然不显示
  - ⚠️ **注意**：曾一度误解为"取消置顶区、改成左侧目录项"，用户澄清后已改回。**不要再动这个设计。**
- **权限模型（已确认）**：
  - **站点访问密码（读锁）已删除** —— 前台永远公开可读，没有"看要不要密码"这一层。
  - **只用一个管理员账号，没有注册功能，也没有用户体系**（用户明确要求）。全局唯一凭证在部署时经 `scripts/gen-secrets.mjs` 设定。
  - **明确没有**：注册 / 邀请 / 用户管理 / 多用户 / 角色权限 / 找回密码 / 邮箱验证 / 验证码 / OAuth。
  - **密码怎么来**：**用户自己在部署时定**，配成平台环境变量 `HAONAV_ADMIN_PASSWORD`。登录 = **常量时间字符串比较**（< 1 ms）。密码不进 KV、不进仓库、不进 `site.config.json`（那只放非敏感出厂默认值）。
  - **改密码 = 改 `HAONAV_ADMIN_PASSWORD` 这一个环境变量**；忘记密码也只能这样重设（无"找回"）。
  - **可选哈希版**：若在意明文落在 Secret 里，可改配 `HAONAV_PEPPER` + `HAONAV_PASSWORD_HASH`（跑 `scripts/gen-secrets.mjs`），登录时比较 `HMAC(输入, pepper)`。**但不推荐** —— 平台的 Secret 写入后无法读回明文，且**会话签名密钥就在同一个 Secret 存储里**，攻击者拿到 Secret 即可直接伪造会话 cookie、根本不需要密码，所以哈希在"Secret 已失守"场景下没有额外保护。
  - 部署配置**分两个区域**（别混）：**「绑定」区**配 KV 命名空间（变量名 `HAONAV_KV`，值是命名空间本身不是字符串）；**「环境变量 / Secrets」区**配 2 个 Secret —— `HAONAV_ADMIN_PASSWORD`（要记住）与 `HAONAV_SESSION_SECRET`（64 hex 随机串，**不用记、必须密码学随机**）。
  - `HAONAV_SESSION_SECRET` 是会话 cookie 的**签名密钥**。**绝不能"随便输入"** —— 猜出它就能伪造会话 cookie 绕过密码。生成：`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 或 `openssl rand -hex 32`。**不需要备份**（丢了重新生成，代价只是重新登录一次）；更换它 = 需要重新登录，数据不受影响。
  - 登录表单只需一个密码框；登录取 30 天会话 cookie；登录限速用内存计数 + 失败延迟；失败响应不区分原因。
  - 全站唯一登录入口是 `/admin`；**前台完全不需要登录、零写操作**。
  - "看"与"改"彻底分离：谁都能浏览，只有你能改。
- **前台严格只读（已确认方案 B）**：置顶操作也收归后台，因此前台**完全零写操作** → **不需要登录入口、不需要登录弹窗**，无会话态、无"未登录"交互分支。前台 = 纯静态页面 + 只读 API。
  - 前台右键菜单只剩三项：复制链接 / 二维码分享 / 在新标签打开（由 `openInNewTab` 决定是否显示）。
  - 前台组件从 14 个降到约 6 个，应用代码从约 15 KB 降到 8–10 KB，**首屏预算从 34 KB 宽松到约 28 KB**。
- **前台可切换的两项个人偏好（已确认）**：
  1. **白天/黑夜** —— 顶栏三态按钮 `light` / `dark` / `system`，写 localStorage，优先于 `themeDefault`。
  2. **卡片视图 —— 三档**（建议保留三档而非两档，因为现项目已有"简洁"档，砍掉就是功能倒退）：
     - `card` 正常卡片：图标 + 标题 + 描述 → 2/4/6/8 列
     - `compact` 简洁：图标 + 标题（单行）→ 2/5/8/10 列
     - `icon` 纯图标：只有图标，悬停出标题 → 3/6/10/14 列
     - 与 `iconStrategy` 联动：`letter` 时纯图标模式显示首字母色块（0 请求）；`fetched` 时为真实站点图标。
- **备份（已确认）**：支持自动（可配频率 daily/weekly 与保留份数 1–30，默认每天/7 份）/ 纯手动两种模式，后台「数据」面板提供"存快照 / 恢复（恢复前自动存一份当前状态防误操作）/ 下载 JSON 与 HTML"。**快照枚举必须用 index-aside（索引存单个 KV key），不要用 `KV.list()`** —— 免费版 List 请求仅 1,000 次/天。
- **后台只留 4 个面板**：链接 / 分类 / 数据 / 设置。分类管理从现项目的 3 处重叠入口收敛到 1 处（前台不再提供分类管理）；数据面板四合一（导入 / 导出 / 快照 / 检测）。
- 改造方案全文见项目根目录 `HaoNav-改造方案.md`（v3 定稿，约 1020 行）。

## ⚠️ 平台运行时硬约束（设计时必须遵守）

- **Cloudflare Workers Free：CPU 时间 10 ms/请求**（Paid 才 5 min）。官方文档明确"认证类负载通常要 10–20 ms"，**认证本身已踩线**。
- 因此：**密码哈希必须用单次 HMAC-SHA256 + 高熵 pepper，绝不能用 PBKDF2 多轮 KDF**（会触发 `Error 1102`，登录完全不可用）。
- 因此：**书签导入必须在客户端 Web Worker 解析 + 分批（≤200 条）提交**，服务端全量解析会超 CPU。
- 因此：**不要用 zod**。实测 74 KB brotli（`zod/v4-mini` 68.6 KB），放客户端把首屏顶到 93 KB（翻倍超预算），放服务端校验 2000 条要几十毫秒 CPU。改用 `api/validate.ts` 手写轻量校验（约 40 行）。
- 其他 Free 限制：请求 100,000/天、**子请求 50/请求**（限制死链检测与图标抓取批大小）、Cron Triggers 5 个/账号、KV 1,000 写/天、内存 128 MB、体积 3 MB。
- **关键洞察：排队等网络不计 CPU**（KV 读、fetch 都不算）。所以"多几次 KV 读"免费，"多做几次哈希/序列化/正则"致命。
- **原则：每次请求都要能在 10 ms 内做完。** 凡"遍历全量数据 + 复杂计算"的事，要么挪到客户端，要么拆成多批。
- **按最紧的平台设计**（CF 的 10 ms 是已知最紧），EdgeOne 上只会更宽裕。

## ⚠️ 环境与工具约定

- **npm registry**：本机默认指向已废弃的 `registry.npm.taobao.org`，证书过期会让 install 直接失败。装包必须显式指定 `--registry=https://registry.npmmirror.com`，或先 `export npm_config_registry=https://registry.npmmirror.com`。
- 运行环境：Windows + Git Bash；`/tmp` 映射到 `C:\Users\BoYan\AppData\Local\Temp`。
- **版本控制**：项目原无 git。2026-09-11 已 `git init`，基线提交 `f7aa488`，tag **`v1-legacy`**（改造前原始状态，55 个文件）。回滚：`git reset --hard v1-legacy`。

## 托管平台免费额度（2026-09 核实）

- **Cloudflare**：Workers 100,000 请求/天 + **CPU 10 ms/请求**；KV 100,000 读/天 · **1,000 写/天** · 1 GB · 单值 25 MB；Pages 无限带宽。
- **EdgeOne Makers**：静态流量/请求不限量；Edge Functions 300 万请求/月；KV 1 GB 且**仅 Edge Functions 可调用**；有中国大陆节点。
- **Vercel**：Hobby 100 GB 带宽/月，额度最紧且禁商业用途，**无自带 KV**。**不作为目标平台**。
- 两家 KV 均为**最终一致**（边缘缓存最长 60 s）→ 设计上必须「写后不回读 + 乐观更新 + `rev` 冲突检测」。
- **国内访问 → EdgeOne Makers 首选；海外 → Cloudflare 首选**（决定因素是中国大陆节点，不是额度）。

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
11. 站点设置被大量写死：`index.html` 的 title/favicon/色板、`App.tsx` 的 `INITIAL_SITE_CONFIG` 与上游仓库地址、侧栏 logo 兜底字符 `"C"`、8 个 localStorage key 名、`types.ts` 的 `DEFAULT_CATEGORIES` 与 **`INITIAL_LINKS`（5 条写死的示例链接）**、各 Modal 的界面文案、`vite.config.ts` 的端口、API 层散落 4 个文件的 KV 绑定名与 key 名。

## 体积归因（实测，改造前后对比基线）

- 改造前：单 chunk 1,579 KB raw / gzip 348 KB / **brotli 280 KB**，且构建产物中**没有任何 CSS 文件**。
- 280 KB 的构成：lucide 全量 146 KB + `@google/genai`&`jszip` 75.8 KB + React 57.9 KB ≈ 279.7 KB（业务代码占比接近 0）。
- 关键单依赖实测：lucide 全量 `import *` 146.0 KB → 具名导入 8.5 KB；`@google/genai` 49.4 KB；`jszip` 26.3 KB；`zod` 74.0 KB。
- **图标方案实测**（20 个图标，生产构建 + brotli）：引图标库 5.82 KB vs 自绘 SVG path 数据 0.52 KB（+ 约 0.3 KB 渲染组件）。**自绘省约 5 KB**，所以新方案不装任何图标库，改为 `AppIcon.vue` 自绘约 20 个 SVG。
- 框架运行时基线（brotli）：Vue 3.5 = 18.9 KB / Svelte 5 = 13.4 KB / React 19 = 57.9 KB / Next.js 16 = 150.6 KB。
- 目标首屏 JS ≤ 45 KB brotli（预计实际约 28 KB）。

