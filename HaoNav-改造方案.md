# HaoNav 改造方案（v4 实施版）

> 2026-09-11 ｜ 本版相对 v3 的变化：**删除历史论证与科普内容（约 30%）**、**补齐 15 处实现遗漏**、**新增「部署与首次配置」与「实现陷阱清单」两章**。所有的选型与取舍均为已确认结论。
>
> 详细缺陷分析过程存档在 `.workbuddy/memory/2026-09-11.md`，本文只保留实施所需的结论。

---

## 0. 目标与结论

把当前「套模板的 React 玩具 + 三套互相打架的后端」重写为：**前台纯只读的高性能导航页 + 后台功能完整的编辑端 + 一份代码多平台部署**。

| 层 | 结论 |
|---|---|
| 前端 | **Vue 3.5 + Vite**，多入口（`index.html` 前台 / `admin.html` 后台） |
| 样式 | **Tailwind v4 构建时产出**（彻底弃用 `cdn.tailwindcss.com`） |
| 校验 | **手写轻量校验**（不用 zod —— 实测 74 KB brotli，双杀包体与 CPU 预算） |
| 后端 | **Hono 单一 API**，业务逻辑零平台依赖，平台差异收进 ≤10 行 adapter |
| 存储 | **只用 KV**（主文档 + 图标 + 快照），不用 R2/Blob，不用数据库 |
| 部署 | **EdgeOne Makers（国内首选）/ Cloudflare（海外首选）**，一份代码 |

### 性能预算（上线前必须达标）

| 指标 | 改造前 | 目标 |
|---|---|---|
| 首屏 JS（brotli） | 280 KB（单 chunk） | **≤ 45 KB**（预计约 28 KB） |
| 首屏 CSS（brotli） | 0（依赖 123 KB gzip 阻塞脚本现场编译） | **≤ 12 KB，构建时产出** |
| 首屏第三方请求 | Tailwind CDN + 1000+ favicon + qrserver | **0 个** |
| 1000 链接时首屏请求数 | 1 + 1000+ | **≤ 4** |
| LCP（移动端 4G，二次访问） | 白屏 1–3 s | **< 400 ms** |
| 首屏实际参与渲染的节点数 | ~12,000 | **< 1,500** |
| 搜索 5000 条 | 每次 render 全量 filter | **< 10 ms（防抖后）** |
| **单请求 CPU 时间** | 未受约束 | **< 10 ms**（免费版硬上限） |

---

## 1. 背景与基线（为什么必须重写）

### 1.1 三处致命缺陷

1. **数据正在丢失** —— 仓库里有三套互不兼容的后端（`functions/` 用 `CLOUDNAV_KV`、`edgefunctions/` 与 `api/` 用 `HaoNav_KV`），且 `functions/api/link.ts` 写 `app_data`、网页端读 `haonav_links`。**Chrome 扩展存的书签永远不会出现。** 更糟的是 `IS_EDGEONE_ENV = hostname.includes('edgeone.app')` 在 EdgeOne 实际域名下恒为 false，导致**在 EdgeOne 上部署时登录永远失败、数据永不上云**，且静默降级为纯本地。
2. **访问密码是假的** —— GET 分支写着 `password ? verify(...) : true`，**不传密码就放行**；叠加 `Access-Control-Allow-Origin: *`，任意网页都能读走整个书签库。而 `verifyPassword()` 在 KV 无密码时会"把传入密码存下来并返回 true"，**首个请求者成为站长**。
3. **WebDAV 备份假成功** —— 后端只实现"存取配置"，从未实现任何 PROPFIND/PUT/GET 代理，导致 `check`/`upload` 恒返回成功、`download` 恒返回 null。**用户以为有备份，其实从来没有。**

### 1.2 实测基线（改造前后对比用）

```
$ npx vite build
dist/assets/index-*.js   1,579 KB raw │ gzip 348 KB │ brotli 280 KB   ← 单 chunk，零分割
dist 中的 CSS 文件数量：0
```

| 项目 | 实测 | 处理 |
|---|---|---|
| lucide 全量（`import * as`） | **146.0 KB brotli** | 新架构不装 lucide，改为自绘 SVG（见 5.3） |
| `@google/genai` | **49.4 KB brotli** | 随 AI 功能删除 |
| `jszip` | **26.3 KB brotli** | 唯一用途是打包扩展文件，随插件功能删除 |
| React 19 + ReactDOM | **57.9 KB brotli** | 换 Vue（18.9 KB），省 39 KB |
| `cdn.tailwindcss.com` | 407 KB / gzip 123 KB 阻塞脚本 | 改构建时 Tailwind |
| 根目录非源码资产 | 1.16 MB（10 张 PNG + docx + SVG） | 移出仓库 |

**关键推论**：构建产物里**没有任何 CSS**（全站样式来自运行时 CDN）。这个 CDN 一旦被墙、被 CSP 拦或故障，站点会退化成没有样式的纯文本 —— 这是可用性缺陷，不是优化项。

---

## 2. 目录结构

```
haonav/
├── index.html                  # 前台入口（含 %SITE_NAME% / %ICON% / %ACCENT% 构建期占位符）
├── admin.html                  # 后台入口
├── vite.config.ts              # 多入口 + dev 期 API 中间件
├── site.config.json            # ★ 出厂默认设置的唯一来源（见 3.3）
├── scripts/
│   └── gen-secrets.mjs         # 可选：生成哈希版密码（见 10.1）
├── web/                        # 前台（Vue 3）
│   ├── main.ts
│   ├── App.vue
│   ├── components/
│   │   ├── SidebarNav.vue      # 左目录（全部链接 / 分类 + 计数徽章 + 底部外链）
│   │   ├── TopBar.vue          # 搜索 / 主题切换 / 卡片视图切换
│   │   ├── SearchBox.vue       # 站内/站外切换 + 引擎下拉
│   │   ├── PinnedSection.vue   # 全局置顶区
│   │   ├── CategorySection.vue # 分类区块
│   │   ├── LinkCard.vue        # 三档视图共用
│   │   ├── ContextMenu.vue     # 只读三项
│   │   ├── ShareModal.vue      # 二维码
│   │   ├── Toast.vue
│   │   └── AppIcon.vue         # 自绘 SVG 图标表（见 5.3）
│   ├── stores/nav.ts           # 唯一状态源（reactive + 派生数据预计算）
│   ├── lib/
│   │   ├── api.ts              # 只依赖 fetch
│   │   ├── cache.ts            # localStorage 缓存 + 版本化 key 前缀（见 10.3）
│   │   ├── settings.ts         # L1 ⊕ L2 合并
│   │   ├── theme.ts            # 写入 CSS 变量 --accent / 暗色 class
│   │   ├── search.ts           # 预建索引 + 防抖
│   │   ├── brandIcon.ts        # 品牌图标 → favicon 派生（letter/emoji → SVG data URI）
│   │   └── order.ts            # base-62 有序字符串
│   └── styles/app.css          # Tailwind v4 + @theme
├── admin/                      # 后台（Vue 3，独立 bundle）
│   ├── main.ts
│   ├── App.vue
│   ├── panels/
│   │   ├── LinksPanel.vue      # 表格 + 多选批量 + 拖拽排序
│   │   ├── CategoriesPanel.vue # 分类增删改 / 排序 / 合并
│   │   ├── DataPanel.vue       # 导入 / 导出 / 快照 / 重复检测 / 死链检测
│   │   └── SettingsPanel.vue   # 12 项配置
│   ├── lib/importParse.worker.ts   # ★ Web Worker 解析书签 HTML
│   └── lib/importParse.ts          # Worker 的调用封装
├── api/
│   ├── core.ts                 # ★ Hono app，零平台依赖
│   ├── auth.ts                 # HMAC 会话 + 常量时间比较 + 内存限速
│   ├── validate.ts             # 手写轻量校验（约 40 行）
│   ├── keys.ts                 # ★ KV key 名与文档结构常量（唯一允许硬编码处）
│   ├── store.ts                # Store 接口 + 3 个实现（CF KV / EdgeOne KV / 内存）
│   └── adapters/
│       ├── edgeone.ts          # EdgeOne Edge Functions 入口
│       ├── cloudflare.ts       # Cloudflare Workers 入口
│       └── dev.ts              # Vite 中间件 + 文件存储（本地开发）
├── shared/
│   └── types.ts                # ★ 只共享 TypeScript 类型（编译期，运行时 0 字节）
└── migrate/
    └── v0-to-v1.ts             # 读旧 KV 的 haonav_* + app_data → 合并去重 → 新文档
```

**核心设计约束**：`api/core.ts` 里不出现任何平台符号（不写 `env.XXX`、不写 `c.env`、不 import 任何平台 SDK）。平台差异全部由 `store.ts` 的实现类和 adapter 吸收。这是对"三套后端互相打架"的根本解法。

**`shared/types.ts` 只放类型，不放运行时代码** —— 这样前后端共享契约的成本是 0 字节。任何需要在两端执行的逻辑都拆开实现，避免把服务端依赖拖进浏览器包体。

---

## 3. 目标架构

### 3.1 数据模型

```ts
type Doc = {
  schemaVersion: 1;
  rev: number;                  // 乐观并发：每次写入 +1（快照恢复也必须 +1，见 9.4）
  updatedAt: number;
  settings: SiteSettings;       // 见 3.3
  categories: {
    id: string;                 // crypto.randomUUID()
    name: string;
    icon: CategoryIcon;         // 见 5.3
    order: string;              // 有序字符串
  }[];
  links: {
    id: string;
    title: string;
    url: string;
    urlKey: string;             // 规范化 url，用于去重
    desc?: string;
    cat: string;
    order: string;              // 有序字符串
    pinned?: boolean;
    icon?: string;              // 见 5.3：fetched 模式下存 "/api/icon?u=<domain>"
    createdAt: number;
  }[];
};
```

**关键设计说明**

- **`order` 用 base-62 中点字符串**：拖动排序只写被拖动的**那一个**元素，不重排整个数组。实现 `between(a, b)` 取中间串即可，**不需要完整的 LexoRank 桶平衡机制**。
  - 极端情况：相邻两串已无中间值可插时，做一次**该分类内**的重排（会改多条，占 1 次 KV 写，不影响 `rev` 语义）。
- **`urlKey`** 是规范化后的 URL（去末尾斜杠、统一小写 host、剥离常见追踪参数），导入去重从 O(n²) 比对变成 `Set` 查表。
- **撤销不进文档** —— 改为客户端会话内保留最近 10 步快照。理由：撤销几乎总是"刚刚那一下"，跨设备撤销价值极低，而把 `changelog` 放进文档会让它持续膨胀、每次写入都重传全部历史。

### 3.2 设置模型（零硬编码）

**硬性约束：代码里不出现任何"网站设置"的字面值。**

#### 三层配置

| 层 | 存放 | 改动代价 | 内容 |
|---|---|---|---|
| **L1 出厂默认** | `site.config.json` | 改文件 + 重新构建 | 下面 12 项的全部默认值 |
| **L2 运行时设置** | KV 文档的 `settings` 段 | **改后台即秒级生效，无需重新构建** | 与 L1 **完全相同的字段集合** |
| **L3 部署配置** | 平台控制台（不进仓库、不进 KV、不下发前端） | 改部署配置 | **KV 命名空间绑定**（是"绑定"不是"Secret"）+ **2 个 Secret**：管理员密码、会话签名密钥 |

读取时 `settings = { ...siteConfig, ...doc.settings }` —— 没改过的跟随配置文件，改过的持久化在 KV。

#### 12 项配置（9 项站点设定 + 3 项备份）

```ts
type SiteSettings = {
  // ── 品牌 ──
  name: string;                          // 站名：同时用于 <title>、侧栏、分享卡片
  icon: {                                // 品牌图形；favicon 由它自动派生
    type: 'letter' | 'emoji' | 'image';
    value: string;                       // letter：取 name 首字；emoji：字符；image：URL
  };

  // ── 外观 ──
  accent: string;                        // 主色 → CSS 变量 --accent
  themeDefault: 'light' | 'dark' | 'system';
  cardStyle: 'card' | 'compact' | 'icon';   // 站点默认视图；用户可在前台临时覆盖

  // ── 行为 ──
  openInNewTab: boolean;

  // ── 搜索 ──
  searchEngines: SearchEngine[];

  // ── 图标 ──
  iconStrategy: 'letter' | 'fetched';    // 链接卡片图标来源

  // ── 页脚 ──
  footerLinks: { label: string; url: string }[];

  // ── 备份 ──
  backup: {
    mode: 'auto' | 'manual';
    frequency: 'daily' | 'weekly';
    retention: number;                   // 1–30，默认 7
  };
};
```

#### 已合并 / 已裁减的记录（避免以后反复讨论）

| 合并 | 方式 |
|---|---|
| `title` + `navTitle` | → `name`（实际使用中 99% 同值） |
| `logo` + `favicon` | → `icon`（favicon 由它派生：`image` 直接用；`letter`/`emoji` 本地生成 SVG data URI，主流浏览器支持） |
| `theme.default` + `theme.accent` | → 拍平为 `themeDefault` + `accent` |

| 已裁减 | 理由 |
|---|---|
| `description` / `lang` | 个人导航站用不到；`lang` 固定 `zh-CN` 属内部常量 |
| `theme.radius` | 几乎没人改，改它要动多处 Tailwind 类 |
| `density` | `cardStyle` 三档已隐含密度差异，再加一层是过度设计 |
| `stickyCategoryTitle` | 直接默认开启，不给开关 |
| `showPinnedSection` | 置顶是核心功能；无置顶时该区块自然不显示 |
| `defaultCategoryView` | 改为"记住上次选中"（客户端行为，零配置） |
| `defaultSearchMode` | 导航站默认必然是站内搜索 |
| `searchPrefixes` / `texts` | 很少用 / 基本不改 |
| `accessMode` | **站点访问密码已整体删除**（见 3.5） |

#### 分工原则：后台管"站点设定"，前台管"个人偏好"

| | 后台（写 KV，全站生效） | 前台（写 localStorage，仅本机生效） |
|---|---|---|
| 主题 | `themeDefault` | 顶栏按钮，手动切过就记住 |
| 卡片视图 | `cardStyle` | 顶栏按钮，手动切过就记住 |
| 选中分类 | — | 记住上次选中 |
| 站名 / 图标 / 主色 / 引擎 / 页脚 / 备份 | ✅ 只在后台 | — |

优先级：**个人偏好 > 站点默认**。没手动切过任何东西时，看到的就是后台设定的样子。

### 3.3 API 契约

```
GET    /api/data            全量文档。公开可读（无读锁）。Cache-Control: no-cache
                            + ETag；If-None-Match 命中返回 304（响应体 0 字节）。
POST   /api/login           {password} → HMAC 比较 → Set-Cookie 签名会话
                            (HttpOnly, SameSite=Lax, Secure, 30d)。同 IP 限速 5 次/分钟。
POST   /api/logout
PATCH  /api/data            需会话。body: {rev, ops:[...]}
                            rev 不匹配 → 409 + 返回服务端最新版。
POST   /api/import/parse    需会话。接收**单批**（≤200 条）客户端已解析的条目，
                            返回该批的去重结果。客户端分批调用（CPU 约束，见 4）。
POST   /api/import/apply    需会话。确认后按批原子应用。
GET    /api/export?format=html|json   需会话
GET    /api/icon?u=<host>&v=<hash>    favicon 代理；首次抓取后存 KV
                            Cache-Control: public, max-age=31536000, immutable
POST   /api/backup/snapshot 需会话（手动）或由平台 Cron 触发（自动）
POST   /api/backup/restore  需会话。恢复指定快照
GET    /api/health          返回平台标识（取代 hostname 猜测）
```

- **不包含任何 AI 接口**（功能已删），因此没有外部模型调用、没有密钥托管。
- **CORS 全部去掉**：前后同一域名。写接口额外校验 `Origin`，拒绝跨站写。

#### 几个容易被忽略的契约细节（v3 遗漏）

| 细节 | 规定 |
|---|---|
| **导入的"冲突"定义** | 同一 `urlKey` 已存在且**标题或分类不同**即为冲突。diff 分三类：**新增**（urlKey 不存在）/ **已存在**（urlKey 存在且标题分类都相同）/ **冲突**（urlKey 存在但有差异）。用户可选"冲突项保留新值 / 保留旧值 / 跳过" |
| **导入的 `order` 生成** | 导入的条目**追加到目标分类末尾**，`order` 依次递增（不插入中间，避免与现有项争位） |
| **快照恢复后的 `rev`** | **必须 `rev = 当前 rev + 1`**，不能沿用快照里的旧 rev —— 否则客户端的 `rev` 比对会误判"没有变化"，导致界面一直显示旧数据 |
| **`link.icon` 在 fetched 模式的存法** | 存**相对路径** `/api/icon?u=<domain>&v=<hash>`。`v` 是图标内容的短哈希，只用于击穿浏览器缓存；**KV 的 key 只用 domain**，与 `v` 无关 |
| **死链检测结果不落库** | 只在后台会话内展示，不写进文档。避免文档膨胀，也避免把"临时探测结果"当成长期数据。用户看完自行决定删或留 |
| **`/api/icon` 的 SSRF 防护** | 只允许抓取**已在文档中登记的域名**；校验解析后 IP 不在私网段（`10/8`、`172.16/12`、`192.168/16`、`127/8`、`169.254/16`）；限制重定向次数；超时 3 s；**失败回退本地字母图标** |

### 3.4 安全设计

**读与写彻底分离**：谁都能浏览，只有你能改。

| 项 | 现状 | 新方案 |
|---|---|---|
| 站点访问密码（读锁） | 有，但可一行 curl 绕过 | **整体删除**（已确认）。前台永远公开可读 |
| 写入鉴权 | 密码即令牌，明文存 localStorage、每次请求明文发送、无过期 | **HMAC-SHA256 签名会话**，`HttpOnly` + `SameSite=Lax` + `Secure`，30 天过期；密钥来自部署 secret |
| 密码存储 | 明文存 KV，可被接口读到 | **放部署 Secret，不进 KV、不进仓库**。默认直接用平台 Secret 存密码，登录时做**常量时间比较**；若在意明文落地，可改用 `HMAC(password, pepper)` 哈希版（见 10.1）。两种都不需要注册或用户表 |
| 登录限速 | 无 | 按 IP 的**内存计数器**（best-effort）+ 失败后固定延迟。**不用 KV 计数** —— 会烧掉仅 1,000/天 的写额度 |
| 分类密码锁 | 明文随 JSON 下发，纯装饰 | **删除**。站点若公开，把分类藏起来没意义（接口能拿到）；若整站锁，则所有分类都在锁内 |
| Origin | `Allow-Origin: *` | 同源；写接口校验 `Origin` |
| 密钥泄漏 | `GEMINI_API_KEY` 被 `vite define` 内联进公开 JS | 前端永不出现任何 Key；敏感值全在部署 secret |

#### 认证范围（已确认：只有一个管理员，没有注册）

**没有注册功能，也没有用户体系。** 全局只有**一个**管理员凭证，在部署时设定。

| 有 | 明确没有 |
|---|---|
| 一个密码输入框 → 换取 30 天会话 cookie | ❌ 注册 / 邀请 / 用户管理 |
| 会话过期后重新输入密码 | ❌ 多用户 / 角色 / 权限分级 |
| 改密码 = 改一个环境变量 | ❌ 找回密码 / 邮箱验证 / 验证码 |
| 登录限速（内存计数 + 失败后固定延迟） | ❌ 第三方登录 / OAuth |
| `/api/logout` 清除 cookie | ❌ 密码存储（密码本身不落任何地方） |

**这比"注册登录"体系更简单也更安全**：没有用户表、没有注册接口、没有密码存储位置可供翻阅 —— 攻击面只剩一个受限速保护的登录端点。

**忘记密码怎么办**：因为密码不落任何存储，所以不存在"找回" —— 直接在平台控制台**把那个环境变量改成新密码**即可，数据不受影响。这正是"密码不落存储"的代价与价值所在：不会有任何"重置密码 / 邮箱验证"相关的漏洞面。

**密码绝对不能放的地方**：`site.config.json`（那是要提交进仓库的）、代码、`.env`（除非确认已被 `.gitignore` 覆盖）。**只放平台 Secret。**

**全站只有一个登录入口**：`/admin`。前台完全不需要登录（见 8.2）。

### 3.5 存储：只用 KV

| 数据 | 存放 | 写入频率 |
|---|---|---|
| 主文档 `nav:v1` | KV 单键 | 每次保存 1 次写 |
| 站点图标 | KV 单键（key = domain） | 每个域名一辈子只写 1 次 |
| 每日快照（默认 7 份） | KV 的 7 个 key + **1 个索引 key** | 每天 1 写 + 1 删 |
| 关系型数据 | **不存在** | — |

**额度推算**：一天最多 50 次保存 + 7 次快照相关操作 + 零星图标抓取 ≈ **60 次写/天**，占 Cloudflare 免费版 1,000 写/天 的约 6%。

**三个决定性认知**

1. **KV 的写按 key 计费，不是按条。** 官方文档明确 "per-key basis" —— 「一次 PATCH 改 100 条链接」= **1 次 KV 写**。1,000 写/天 实际等于"每天能保存 1,000 次"。真正会打爆额度的是**"每改一条全量 POST 一次"**这种实现。
2. **KV 最大的陷阱是最终一致（~60 s），不是额度。** 写完立刻回读可能拿到旧值 —— 这正是当前 `saveLinks() = loadAll() + saveAll()` 的真实丢写风险。必须遵守「写后不回读 + 乐观更新 + `rev` 冲突检测」。
3. **数据库的价值在"查询"，而本项目不需要查询。** 数据永远是整份读、整份写。上了 SQL 之后每次读仍要 join 回同一个 JSON 形状，等于白付一次序列化 + 一次网络往返。

**为什么不用 R2 / Blob**：图标靠浏览器 `immutable` 缓存，同一域名一辈子只请求一次，省不出 KV 读取量；快照每天只写 1 次，R2"写入无次数压力"毫无价值。而引入它要多一个绑定、多一处凭证、多一套 SDK、多一层跨平台适配 —— 收益为 0。另外 R2 与 EdgeOne Blob 都需单独开通（CF R2 是否需绑定支付方式请在控制台确认），与"只用免费套餐"冲突。

**什么时候才引入 R2**：新增用户上传附件类功能（自定义图标原图、原始 HTML 归档、导出 zip）／数据总量超 1 GB。
**什么时候才引入 D1**：需要点击量等高频细粒度写入（KV 的 1,000 写/天会立刻被打爆，D1 有 100,000 行/天）／多用户账号体系／服务端查询与分页／链接量级 10,000+ 且需服务端检索／逐条修订历史。

**两个必须守住的约束**

- **KV 单值上限 25 MB**。**图标绝不能以 data URL 内联进主文档** —— 那会让每次保存都重传几 MB。图标必须独立成 key。
- **快照枚举必须用 index-aside** —— 把快照索引（`[{key, at, size}]`）存进一个固定 KV key，读列表只读这一个 key。**不要用 `KV.list()`**：免费版 List 请求仅 **1,000 次/天**，且 list 出来的 key 还要逐个再读。

### 3.6 数据实时性

**结论：永远不需要重新构建。** 数据在运行时从 `/api/data` 读取，不嵌入构建产物 —— 构建产物只是代码，内容全在 KV。**改内容 = 一次 KV 写，不触发任何部署。**

| 场景 | 生效时间 | 需要重新构建 |
|---|---|---|
| 后台保存后，后台界面自己 | 立即（乐观更新） | 否 |
| 刷新前台，同城 / 同一边缘节点 | 秒级 | 否 |
| 刷新前台，跨地区边缘节点 | 最长 60 s | 否 |
| **已打开着的前台页面** | **不会自己变**，需刷新 | 否 |

**为什么跨地区最长 60 s**：KV 最终一致 —— 写入只保证"发起写入的那个边缘节点立即可读到新值"。一个人同城使用，实际就是秒级。这是 KV 的固有特性，不是缺陷。

**让"已打开的前台"自动更新（成本极低）**：监听 `visibilitychange` / `focus`，切回页面时比对一次 `rev`，有变化就更新。零轮询成本，体验最好。若需多设备长时间同屏同步，再加 60 s 轮询（约 480 请求/天，额度内）。**不要用 SSE** —— KV 没有变更事件通知，服务端要发现变化也只能自己轮询，白白占着长连接。

**图标的一个注意点**：`/api/icon` 带一年 `immutable` 缓存，所以替换某站点图标时浏览器不会主动更新 —— 前端通过 `link.icon` 里的 `v=<hash>` 参数击穿缓存（见 3.3）。

---

## 4. ⚠️ 平台运行时硬约束（决定实现方式的一章）

**免费套餐的额度不只是"次数"，还有每请求的 CPU 预算。这一条比次数更容易被忽略，而且一旦踩中就是功能完全不可用。**

已核实的 Cloudflare Workers Free 限制：

| 限制项 | Free | Paid | 对本项目的影响 |
|---|---|---|---|
| **CPU 时间 / 请求** | **10 ms** | 5 min（默认 30 s） | ★ 最关键。官方文档："处理认证、SSR 或解析大负载的 worker 通常要 10–20 ms" —— **认证类负载本身就已踩线** |
| 请求数 | 100,000/天 | 无限制 | 充裕 |
| **子请求 / 请求** | **50** | 10,000 | 限制死链检测与图标抓取的批大小 |
| **List 请求 / 天** | **1,000** | 更高 | 决定快照必须用 index-aside |
| KV 写 / 天 | 1,000 | 更高 | 决定写入必须合并成 PATCH |
| Cron Triggers / 账号 | 5 | 250 | 够用（快照只需 1 个） |
| 内存 / isolate | 128 MB | 128 MB | 400 KB 文档毫无压力 |
| Worker 体积 | 3 MB | 10 MB | 充裕 |

> **关键洞察：排队等网络不计 CPU。** KV 读、`fetch()`、子请求都不计入 10 ms。所以"多几次 KV 读"是免费的，"多做几次哈希 / 序列化 / 正则"才要命。

### 四条强制设计决策

| # | 决策 | 为什么 |
|---|---|---|
| 1 | **登录校验绝不用 PBKDF2 等多轮 KDF** | PBKDF2-SHA256 210k 轮在边缘约需 100–300 ms，会直接触发 `Error 1102 Worker exceeded resource limits`，**登录完全不可用**。改为**常量时间字符串比较**（< 1 ms），密码存部署 Secret；若要哈希版则用单次 HMAC-SHA256（同样 < 1 ms）。在线爆破由登录限速挡住 |
| 2 | **书签导入在客户端 Web Worker 解析，服务端只按批（≤200 条）落库** | 服务端解析 1–2 MB 书签 HTML 需几十到上百毫秒 CPU。Worker 既绕开上限、又不卡 UI，比原实现更好 |
| 3 | **不用 zod 做全量校验，改手写轻量校验（约 40 行）** | zod 实测 **74 KB brotli**（`zod/v4-mini` 68.6 KB）。放客户端把首屏从约 28 KB 顶到约 100 KB（翻倍超预算）；放服务端校验 2000 条链接需几十毫秒 CPU |
| 4 | **死链检测、图标抓取都分批** | 子请求上限 50/请求 → 每请求最多探测约 20 个链接，由前端驱动多轮 |

### 一张"能做 / 不能做"对照表

| 操作 | 在 10 ms 内可行？ | 正确做法 |
|---|---|---|
| 读整个文档（JSON.parse 400 KB） | ✅ 1–3 ms | 直接做 |
| 应用一批 PATCH ops（2000 条链接） | ✅ < 1 ms | 直接做 |
| 单次 HMAC 签名 / 验签 | ✅ < 1 ms | 直接做 |
| 轻量结构校验（约 40 行） | ✅ < 1 ms | 直接做 |
| 序列化并写 KV | ✅ 1–3 ms | 直接做 |
| 一次 HEAD 探测 | ✅（网络不计 CPU） | 但受 50 子请求限制 → 每批 ≤20 |
| 抓取一个域名图标 | ✅（网络不计 CPU） | 一次一个域名 |
| **PBKDF2 / scrypt 多轮 KDF** | ❌ | 改单次 HMAC |
| **zod 校验全量文档** | ❌ | 改手写轻量校验 |
| **服务端解析整份书签 HTML** | ❌ | 移到客户端 Worker |
| **服务端全量搜索 / 重排全表** | ❌ | 客户端做，或分片 |

**一句话原则：每次请求都要能在 10 ms 内做完。** 凡"遍历全量数据 + 复杂计算"的事，要么挪到客户端（浏览器无此限制），要么拆成多批。

**设计时按最紧的平台设计** —— Cloudflare 的 10 ms 是已知最紧约束，按它写，EdgeOne 上只会更宽裕。

---

## 5. 读路径与性能

### 5.1 四层优化

```
第 1 次访问                              第 2 次及以后
─────────────                           ─────────────
HTML + CSS 直出（<300ms 可见）            同上
       ↓                                      ↓
localStorage 无缓存                      内联脚本把缓存 JSON 注入 window.__NAV__
       ↓                                      → 首帧直接绘出全部卡片（LCP < 400ms）
请求 /api/data（ETag 协商）                    ↓
       ↓                                  后台拉 /api/data 比对 rev，有变化才更新
写入 localStorage
```

1. **`/api/data` 不做 CDN 缓存，改用 ETag 协商** —— 每次请求都到 Worker（1 次函数调用 + 1 次 KV 读），没变化时返回 304、响应体 0 字节。**这是刻意取舍**：个人站读流量极小，省下的请求量毫无意义，而缓存的代价是"改完要等一两分钟才生效"，直接伤害"编辑方便"。首屏速度由客户端缓存保证。
2. **客户端缓存秒开** —— localStorage 缓存整份文档 + `rev`，配一段内联脚本在首帧前注入。**二次访问接近零网络等待。**
3. **零第三方图标请求** —— 见 5.3。
4. **跳过视口外渲染** —— `content-visibility: auto` + `contain-intrinsic-size`（约 3 行 CSS），浏览器自动跳过视口外内容的渲染 / 布局 / 绘制。1000 链接时**实际参与渲染的节点从 ~12,000 降到 <1,500**。详见 6.4。

### 5.2 首屏三段式（"设置动态化"与"首屏不闪"的张力）

设置改成运行时可变后，标签标题、favicon、主题色若必须等 KV 返回才能确定，会出现明显闪烁。解法：

1. **构建时** —— Vite 把 `site.config.json` 的 `name` / `icon` / `accent` 注入 `index.html`（替换 `%SITE_NAME%` / `%ICON%` / `%ACCENT%`）。**首次访问就是正确的，零闪烁。**
2. **解析前** —— `index.html` 保留约 15 行内联脚本，从 localStorage 缓存读取并覆盖一次。**二次访问也是正确的。**
3. **网络返回后** —— KV settings 到达后如有变化再更新一次（只发生在"你刚改完设置"的极少数情况）。

> **主题色走 CSS 变量 `--accent`**，所以改主色是纯运行时行为：**不需要重新构建，也不需要改 Tailwind 配置**。

**首屏加载态**：不设全屏 loading 遮罩（当前实现是 `#root` 默认 `display:none`、等 React 挂载后用 `setTimeout(300)` 揭开，这在移动端造成 1–3 秒白屏）。新做法是 **HTML + CSS 直接渲染骨架**（侧栏轮廓 + 卡片占位块），数据到达后替换。有 localStorage 缓存时几乎看不到骨架。

**读失败的降级**：`/api/data` 失败时用 localStorage 缓存渲染，并在顶栏显示一个"数据可能不是最新"的轻提示（不弹窗、不阻断浏览）。

### 5.3 图标策略（v3 遗漏，本节补齐）

项目里有**三类完全不同的图标**，v3 只写了其中一类，这是明显遗漏。

#### ① 界面图标（搜索、齿轮、图钉、关闭…）

**不引入任何图标库**，改为 `web/components/AppIcon.vue` 里自绘 SVG 图标表。

- 实际需要的 20 个：搜索、关闭、太阳、月亮、菜单、图钉、网格、列表、复制、二维码、外链、下箭头、右箭头、勾选、加号、上传、下载、垃圾桶、铅笔、警告
- **实测对比**（同样 20 个图标，生产构建 + brotli）：

  | 方案 | raw | gzip | **brotli** |
  |---|---|---|---|
  | 引图标库（具名导入） | 18.00 KB | 6.60 KB | **5.82 KB** |
  | 自绘 SVG path 数据 | 0.95 KB | 0.58 KB | **0.52 KB** |

- 加上约 0.3 KB 的渲染组件，自绘总计约 **0.8 KB brotli**，**比引库省约 5 KB**，且零依赖
- 图标数量少于 30 个时，自绘在体积和可控性上都占优 —— 这是本项目少数几个"手写比引库更好"的地方

#### ② 分类图标

- 类型：`CategoryIcon = { type: 'letter' } | { type: 'emoji', value: string }`
- **默认 `letter`**：用分类名首字生成色块（色相由分类 id 哈希得出，保证稳定），与链接图标风格统一、**零依赖零请求**
- 可选 `emoji`：后台输入一个 emoji 字符
- **不做图标库选择器** —— 那会引入依赖、增加后台复杂度，而分类总共十几个，字母块 + emoji 已足够

#### ③ 链接卡片图标（`iconStrategy` 控制）

| 策略 | 行为 | 请求数 |
|---|---|---|
| **`letter`（默认）** | 用链接标题首字生成 SVG data URI 色块，色相由域名哈希得出 | **0** |
| `fetched` | 走 `/api/icon?u=<domain>&v=<hash>`，首次抓取后 KV 长缓存 | 每域名 1 次（之后浏览器缓存命中） |

- 在 `fetched` 模式下，抓取失败的域名**回退到字母块**，不留空
- **品牌图标与 favicon 派生**：`settings.icon` 为 `letter`/`emoji` 时，用同一套生成逻辑产出 SVG data URI 写进 `<link rel="icon">`；为 `image` 时直接用该 URL

> **`icon` 纯图标卡片视图与 `iconStrategy` 的联动**：`letter` 时纯图标模式看到的是首字母色块（很像浏览器起始页）；想要真实站点图标就设为 `fetched`。

---

## 6. 界面方案

### 6.1 布局：零 JavaScript

```css
.app { display: grid; grid-template-columns: 16rem 1fr; height: 100dvh; }
.content { overflow-y: auto; }
```

不用 JS 计算尺寸、不用 `ResizeObserver`。移动端抽屉用 `transform: translateX(-100%)`（GPU 合成，不触发重排）。

### 6.2 导航逻辑（已确认）

**保留「全局置顶区」，它在每个视图顶部都显示。置顶的写入只在后台，前台只读。**

| 左侧选中 | 右侧渲染 |
|---|---|
| **全部链接**（默认） | **置顶区**（全部置顶链接）+ 所有分类的 section |
| **某个分类** | **置顶区**（跨分类的全部置顶链接）+ **仅该分类**的 section |

- 置顶区在两个视图**都显示**，内容都是**跨分类的全部置顶链接** —— 这正是"全局置顶"的含义
- 置顶链接**同时出现在置顶区和它所属的分类里**（沿用现有行为）
- 站内搜索时：只显示命中的分类 section（无命中的整体隐藏），且**置顶区隐藏**。分类 section 内**仍显示命中的置顶链接**（它就是分类内容的一部分）
- 左侧当前项高亮；「全部链接」视图下滚动时用 `IntersectionObserver` 联动高亮对应分类（单分类视图只有一个 section，无需联动）
- **前台不提供「置顶 / 取消置顶」** —— 由后台「链接」面板设置

### 6.3 卡片三档视图（已确认）

| 档位 | 样子 | 网格列数 | 备注 |
|---|---|---|---|
| `card` **正常卡片** | 图标 + 标题 + 描述（两行） | 2 / md:4 / lg:6 / xl:8 | 沿用现有 detailed |
| `compact` **简洁** | 图标 + 标题（单行，无描述） | 2 / md:5 / lg:8 / xl:10 | 沿用现有 simple |
| `icon` **纯图标** | 只有图标，无文字；悬停显示标题 | 3 / md:6 / lg:10 / xl:14 | 新增 |

**为什么保留三档而不是两档**：现有项目已有"简洁"档，砍掉它是功能倒退 —— 它比纯图标信息多（能看到标题），比正常卡片密。

> ⚠️ **实现陷阱**：**绝不能用 `grid-cols-${n}` 这种模板拼接生成类名**，Tailwind 的静态扫描会把它 purge 掉，导致线上没有网格布局。必须写成完整的类名字符串常量数组，例如：
> ```ts
> const GRID: Record<CardStyle, string> = {
>   card:    'grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8',
>   compact: 'grid-cols-2 md:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10',
>   icon:    'grid-cols-3 md:grid-cols-6 lg:grid-cols-10 xl:grid-cols-14',
> };
> ```

### 6.4 分区渲染策略

| 区域 | 渲染策略 | 1000 链接时规模 |
|---|---|---|
| 左侧目录 | 全量渲染 + `:key` 复用，不做虚拟化 | 10–100 项，不参与滚动性能问题 |
| 右侧「置顶」区 | 全量渲染（通常 ≤ 20 项） | ≤ 20 张卡片，成本可忽略 |
| 右侧分类 section | 容器全量渲染 + `content-visibility` 跳过视口外内容 | DOM 约 12,000 节点，**实际参与渲染的 < 1,500** |
| 卡片内部 | 纯 CSS，无 JS 参与布局；加 `contain: layout style paint` 进一步隔离 | — |
| 浮层（右键菜单 / 分享弹窗） | 按需挂载（`v-if`） | 现状 14 个弹窗常驻挂载；新前台只剩 2 个 |

#### `content-visibility` 的两个必须知道的副作用

```css
.cat-section {
  content-visibility: auto;
  contain-intrinsic-size: auto 640px;
  scroll-margin-top: 4rem;        /* 规避吸顶标题遮挡 */
}
```

1. **`contain-intrinsic-size` 必须给合理的高度估值**，否则滚动条会跳动。估值偏差越大越明显。
2. **点击左侧目录跳转到远处分类时，落点可能不准** —— 目标 section 尚未真正渲染，浏览器只按估值定位。缓解：跳转前给目标 section 临时加 `content-visibility: visible` 强制渲染，滚动完成后再移除。
3. 一个**不可修复的固有限制**：浏览器 Ctrl+F 无法在未渲染的 section 里找到内容。对导航站影响很小（有站内搜索），但需要知情。

#### 可选升级（先不做）

**section 级懒挂载**：给 section 挂 `IntersectionObserver`，进入视口前只渲染前 12 张卡片。只在实测发现滚动仍不流畅时启用（典型触发条件是单个分类超过 500 条）。`content-visibility` 已覆盖 99% 的场景，过早优化只增加复杂度。

### 6.5 具体规格

- 侧栏宽 `16rem`、顶栏高 `4rem` —— 与现状一致
- 断点 `lg`(1024px) 以下侧栏转抽屉 + 遮罩
- 主题：`<html class="dark">` + CSS 变量，无 JS 参与渲染
- 保留：**全局置顶区**、分类 section（图标 + 标题 + 下分割线）、**卡片三档**、右键菜单（只读）、复制 Toast、二维码弹窗、全部动效与圆角
- 顶栏两个切换：**白天/黑夜**、**卡片视图**（个人偏好，写 localStorage）

### 6.6 顺手补上的低成本增强

- **分类标题 `sticky` 吸顶** —— 长列表滚动时始终知道在哪个分类，成本为 0
- **左侧分类项显示链接数徽章** —— 一眼看出哪个分类内容多
- **键盘快捷键** —— `/` 聚焦搜索、`Esc` 清空，约 10 行
- **二维码库动态 `import()`** —— 只在打开分享弹窗时才加载（不进首屏）
- 去掉侧栏硬编码的 Fork 按钮（改为 `footerLinks` 配置），去掉只为 README 服务的根目录图片与 docx

### 6.7 验收

- **视觉** —— 改造前对关键状态（浅色首页 / 深色首页 / 三档卡片 / 移动端抽屉 / 右键菜单 / 后台表格 / 空态）截图存档作为**设计参照**。因为本次是重写而非搬迁，**不追求逐像素一致**，但色板、尺寸、圆角、动效必须与现状对齐。
- **性能** —— Lighthouse 移动端 Performance ≥ 95；滚动与输入期间无长任务（> 50 ms）。
- **回归** —— Playwright 覆盖导航逻辑（两个视图的渲染内容）、搜索、三档切换、排序、导入去重。
- **零硬编码** —— `grep` 全仓搜站名字符串与硬编码 URL，命中数应为 0（`site.config.json` 与 `api/keys.ts` 除外）。

---

## 7. 后台方案

**入口隔离**：`admin.html` 是独立构建产物，访客的首屏预算里不含任何后台代码。

### 面板划分（4 个）

| 面板 | 包含 | 合并说明 |
|---|---|---|
| **链接** | 表格视图（按分类/置顶/有无描述/域名筛选）+ 多选批量（改分类、删、置顶）+ 拖拽排序 | 排序并入表格，不再单独做"排序模式" |
| **分类** | 改名 / 改图标 / 排序 / 删除 / 合并两个分类 | ★ 从 3 处收敛到 1 处：现项目有 `CategoryEditModal` + `CategoryManagerModal` + `CategorySortModal` 三个重叠入口（后两个还是死代码） |
| **数据** | ① 导入书签（Worker 解析 + diff 预览）② 导出 JSON ③ 导出 HTML 书签 ④ 快照（存 / 恢复 / 下载）⑤ 重复链接检测 ⑥ 死链检测 | ★ 四合一：原计划的 Import / Export / Snapshot 三个独立面板本质都是"数据的进出与体检" |
| **设置** | 12 项配置 + 搜索引擎管理 | 引擎管理并入设置 |

**不做成独立面板的**：撤销 → 全局快捷键 `Ctrl/Cmd+Z`；同步状态 → 顶栏小指示器。

### 并发冲突的处理（v3 遗漏）

`PATCH` 返回 409 时（`rev` 不匹配，说明另一个窗口/设备改过）：

1. **不静默覆盖**，弹出一个明确的对话框：「数据已在别处被修改」
2. 给出三个选项：**查看差异** / **放弃我的改动并刷新** / **强制用我的版本覆盖**
3. 默认选「放弃并刷新」—— 对个人使用来说，这是最不容易造成数据丢失的默认值
4. 冲突期间禁止继续编辑，避免产生更复杂的合并

### 快照

配置项见 3.2。三个操作：

| 操作 | 行为 |
|---|---|
| **存一份快照** | 立即把当前文档存成带时间戳的 KV key（1 次 KV 写） |
| **恢复** | 列表选一份 → 二次确认 → 覆盖。**恢复前自动把当前状态也存一份**（防误操作），且**恢复后 `rev` 必须 +1** |
| **下载备份文件** | 完整 JSON（可一键还原）+ 导出 Netscape HTML 书签 |

触发方式：`mode='auto'` 时优先用平台 Cron（Cloudflare Cron Triggers 免费版可用 5 个/账号）。**EdgeOne 是否提供等价的定时触发需在控制台确认**；若无，退化为**懒触发** —— 在"当天首次写操作"或"管理员登录"时顺带做一次，并记 `lastSnapshotDate`。`mode='manual'` 时完全不自动触发。

---

## 8. 功能取舍清单

### 8.1 全部删除（已确认）

| 删除项 | 连带影响 | 体积收益（实测） |
|---|---|---|
| **AI 全部**（补描述 / 猜分类 / AI 设置 UI） | 删 `services/geminiService.ts`、`@google/genai`、`types.ts` 的 `AIConfig`/`AIProvider`、`App.tsx` 的 `aiConfig` 与 `AI_CONFIG_KEY`、`LinkModal` 的 `aiConfig` prop。"浏览器明文 Key + 前端直连模型"的安全问题一并消失 | **49.4 KB brotli** |
| **浏览器插件全部**（扩展生成器） | 删 `SettingsModal` 内约 660 行扩展模板与 zip 打包；删 `jszip`（它唯一的使用点就是打包扩展文件） | **26.3 KB brotli** |
| **WebDAV 备份** | 从未真正工作过还"假报成功"。`KV 快照 + 导出`完全覆盖其价值 | — |
| **分类密码锁** | 明文随 JSON 下发，纯装饰 | — |
| **站点访问密码（读锁）** | 前台公开可读；写操作仍由后台登录保护 | — |
| `CategoryManagerModal` / `CategorySortModal` | 无入口的死代码（合计 575 行） | — |
| 三套后端中的两套 | 保留一个 `api/core.ts` + adapter | — |
| `functions/api/health.ts` / `metadata.json` / importmap / 重复的内联脚本 | 历史残留 | — |
| `uuid` / `buffer` / `@dnd-kit`(3 包) / `lucide-react` | 未使用 / 用原生 Pointer Events 替代 / 改自绘 SVG | 约 7 KB |
| `api.qrserver.com` | 改本地生成 | — |
| 根目录 10 张 PNG + docx + screenshots（1.16 MB） | 移出仓库 | — |

**合计净省 75.8 KB brotli（仅 AI + 插件两项），且不需要写任何替代代码。**

> **设置弹窗瘦身**：`SettingsModal.tsx` 现在 1,092 行，含 `site` / `ai` / `tools` 三个 tab，后两个全删，**预计剩约 230 行（原 1/5）**。

### 8.2 前台 / 后台职责划分（已确认）

**前台完全零写操作** —— 因此**不需要登录入口、不需要登录弹窗**，无会话态、无"未登录"交互分支。

**前台保留**：浏览（左目录切换 / 滚动 / 滚动联动）、搜索（站内过滤 + 站外跳转）、打开链接、复制、二维码分享、主题切换、卡片视图切换。

**前台去掉**（全部迁往后台）：添加/编辑链接、删除确认、分类增删改与排序、分类密码解锁、导入、备份、站点设置、引擎管理、**置顶操作**、排序模式。

**收益**：前台组件从 14 个降到约 6 个，应用代码从约 15 KB 降到 8–10 KB，**首屏预算从 34 KB 宽松到约 28 KB**。

**前台右键菜单只剩三项**：复制链接 / 二维码分享 / 在新标签打开（由 `openInNewTab` 决定是否显示）。

### 8.3 新增（服务"编辑方便"）

`/admin` 四个面板 · 多选批量操作 · 重复链接检测与合并 · 死链检测 · 导入 diff 预览 · 全局撤销快捷键 · 手动快照与一键恢复 · 下载备份文件

---

## 9. 迁移方案（数据零丢失）

**风险最高的一步，必须干跑验证。**

1. **先备份** —— 用现有站点导出 HTML 书签；从控制台把 KV 里所有 key 导出为 JSON。
   **两个 key 都要导出**：`haonav_*`（网页端写的）**和** `app_data`（扩展写的）。只导一个就会丢数据。
2. **盘点** —— 只读脚本统计两个 key 各自条数、去重后真实条数、有多少条只在 `app_data` 里。这能直接量化"扩展存的书签"丢了多少。
3. **迁移脚本**（`migrate/v0-to-v1.ts`，**只读旧数据，写到新 key**）：
   - 合并两个来源 → 按 `urlKey` 去重（保留字段最全的那条，`desc` / `icon` / `pinned` 做**字段级合并**而非整条取舍）
   - 补齐 `order`（按原数组下标生成初始有序字符串）、`id`（原来 `Date.now()` 生成的重复 ID 重新分配）
   - 丢弃 `Category.password`（在报告里说明哪个分类的锁被移除）
   - 输出到新 key `nav:v1`，**旧 key 保留不动**
4. **干跑对比** —— 先输出"迁移前 vs 迁移后"的条数、分类数、去重明细报告，人工确认无误再写入。
5. **回滚** —— 旧 key 不删；代码层面已有 `git tag v1-legacy` 可整体回滚。
6. **灰度** —— 先部署到预览环境 / 新域名验证，旧站保持在线。

---

## 10. 部署与首次配置（v3 完全缺失，本节补齐）

### 10.1 首次部署步骤

**① 绑定 KV 命名空间**

在平台控制台创建 KV 命名空间，再**绑定**到项目，变量名填 `HAONAV_KV`。

> ⚠️ **这是「绑定」，不是「环境变量」** —— 值的类型是命名空间本身，不是字符串。它在控制台的「绑定 / Bindings」区域配置，**不在**「环境变量 / Secrets」区域。这两个区域在不同位置，别找错。代码里通过 `env.HAONAV_KV` 读取（改绑定名只需改 adapter 里这一处）。

**② 配置 2 个 Secret**

| 名称 | 值 | 你要记住吗 | 必须随机吗 |
|---|---|---|---|
| `HAONAV_ADMIN_PASSWORD` | **你定的登录密码** | ✅ 要记住 | 建议强一些，但得人能记住 |
| `HAONAV_SESSION_SECRET` | 随机串（64 个 hex 字符） | ❌ **不用记、也不用知道** | ✅ **必须密码学随机** |

**`HAONAV_SESSION_SECRET` 到底是什么**：它是**会话 cookie 的签名密钥** —— 服务端用它签发和验证那个 `HttpOnly` cookie。**你永远不会"输入"它，也不需要记住它**，它只是服务端内部的一把钥匙。

**为什么不能随便输入**（比如 `abc123`、`mysecret`）：这个值一旦被猜出，攻击者就能**自己伪造一个合法的会话 cookie，直接拿到后台权限，完全绕过密码**。所以必须用密码学随机数生成：

```bash
# Git Bash / Linux / macOS（任选其一）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
openssl rand -hex 32
```

```powershell
# Windows PowerShell
[Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

生成一次、粘贴一次，之后不用再管。

- **不需要备份它** —— 它不是数据，丢了重新生成一个即可（代价只是要重新登录一次）
- **更换它的唯一后果是你需要重新登录**（旧 cookie 验签失败），数据完全不受影响。所以怀疑 cookie 泄漏时可以直接换掉
- ⚠️ 不要复用别处已有的密钥，也不要把它提交进仓库

**③（可选）不想让密码明文落在 Secret 里？**

改用哈希版：多配两个 Secret 替代 `HAONAV_ADMIN_PASSWORD`，登录时改为比较 `HMAC(输入, pepper)`。

```bash
node scripts/gen-secrets.mjs "你的密码"    # 输出 HAONAV_PEPPER 与 HAONAV_PASSWORD_HASH
```

> **我的建议是不必。** 理由：
> - 平台的 Secret 写入后**无法读回明文**；
> - **更关键的是会话签名密钥就在同一个 Secret 存储里** —— 攻击者一旦拿到 Secret，可以直接伪造会话 cookie，**根本不需要密码**。也就是说在"Secret 已被攻破"这个场景下，密码哈希不提供任何额外保护；
> - 它唯一的价值是防密码明文意外泄漏到日志或错误回显里，而那靠代码纪律就能解决（见附录 B）。
>
> 代价倒是实在的：改密码要重跑脚本并更新两个 Secret。

**④ 构建与部署**

```bash
npm run build      # 产出 dist/（前台 + 后台两个入口）
```

- **Cloudflare**：静态资源交给 Pages/Workers Assets，`api/adapters/cloudflare.ts` 作为入口
- **EdgeOne Makers**：静态资源交给 Pages，`api/adapters/edgeone.ts` 作为 Edge Function 入口
- 两家都部署时，**同一份 `dist/` + 换一个 adapter import**

**⑤ 验证**

访问 `/api/health` 应返回平台标识；访问 `/admin` 应能登录。

### 10.2 首次使用

全新部署后**不带任何种子数据**（当前项目会硬塞 5 条 GitHub/React/Tailwind 示例链接 —— 既是"写死"，也是"一眼看出是套模板"的痕迹）。推荐流程：

1. 打开前台 → 显示空态："还没有内容"
2. 打开 `/admin` → 登录 → 「数据」面板 → 导入浏览器书签 HTML
3. 或先在「分类」面板建几个分类，再在「链接」面板手动添加

`site.config.json` 里可选配一个**最小种子**（如 3 个空分类），让首次打开就不是全空 —— 默认留空。

### 10.3 localStorage key 清单（版本化前缀）

统一用 `haonav.v1.<field>` 形式，避免升级时读到旧结构：

| key | 内容 |
|---|---|
| `haonav.v1.doc` | 缓存的文档 + 其 `rev`（首屏秒开用） |
| `haonav.v1.theme` | 个人主题偏好（`light`/`dark`/`system`） |
| `haonav.v1.cardStyle` | 个人卡片视图偏好 |
| `haonav.v1.activeCat` | 上次选中的分类 |

> 升级 `schemaVersion` 时同步提升前缀版本号，旧 key 直接忽略（不迁移缓存，反正会重新拉取）。

---

## 11. 实施路线图

| 阶段 | 内容 | 验收标准 |
|---|---|---|
| **P1 · 地基** | `shared/types.ts`（只放类型）；`api/core.ts` + `auth.ts` + `validate.ts` + `keys.ts` + `store.ts` + `adapters/dev.ts`；`scripts/gen-secrets.mjs`；`migrate/v0-to-v1.ts`；Vitest 覆盖迁移 / 去重 / 有序字符串 | 迁移脚本**干跑**输出对比报告，人工确认；API 单测全绿；`grep` 确认 `core.ts` 无平台符号 |
| **P2 · 前台** | Vue 3 重写前台（6 个组件 + 自绘图标 + 三档卡片 + `content-visibility`） | 首屏 JS ≤ 45 KB brotli；Lighthouse 移动端 ≥ 95；与存档截图对齐（色板 / 尺寸 / 动效） |
| **P3 · 后台** | 4 个面板 + Worker 导入 + 重复与死链检测 + 全局撤销 + 冲突处理 | 改一条链接 ≤ 3 次点击；批量改 50 条分类 ≤ 2 次操作；导入 1000 条不卡 UI、不超 CPU |
| **P4 · 平台适配** | Cloudflare adapter + EdgeOne Edge Function adapter，各部署一次 | 同一份代码在两家平台跑通；实测两家首屏耗时做 A/B，据此定正式平台 |
| **P5 · 切换** | 灰度到预览域名 → 验证 → 切正式域名 → 观察 1 周 → 旧站下线 | 旧 KV key 保留 30 天再清理 |

---

## 12. 风险与注意事项

| 风险 | 说明 | 应对 |
|---|---|---|
| **CPU 10 ms 超限** | 免费版最易忽略的硬约束；PBKDF2、zod 全量校验、服务端大文件解析都会触发 `Error 1102` | 见第 4 章的四条强制决策 |
| **迁移丢数据** | 数据分散在两个不同 key（`haonav_*` 与 `app_data`） | 干跑对比 + 旧 key 不删 + 灰度 + `git tag v1-legacy` |
| **KV 写入额度** | Cloudflare 免费版 1,000 写/天 | 写入合并成 PATCH + 防抖；避免任何"逐条保存" |
| **KV 最终一致** | 边缘缓存 ≤60 s，写完立刻回读可能拿到旧值 | 乐观更新 + 写后不回读；`rev` 冲突检测在服务端做 |
| **Tailwind 动态类名被 purge** | `grid-cols-${n}` 会被静态扫描漏掉，线上没有网格 | 用完整类名字符串常量表（见 6.3） |
| **`content-visibility` 副作用** | Ctrl+F 搜不到未渲染内容；跳远处分类落点可能不准 | 见 6.4：跳转前临时强制渲染；导航站有站内搜索，影响可接受 |
| **设置动态化 vs 首屏闪烁** | 标题/favicon/主题色若等 KV 返回才定，会明显闪烁 | 见 5.2 的三段式 |
| **配置项膨胀** | `settings` 字段越加越多会推高文档体积、复杂化后台 | 已有 10 项裁减记录（见 3.2）；文档体积上限设 1 MB 并在校验里卡住 |
| **视觉漂移** | 重写 14 个组件（含命令式右键菜单 / 点击外部关闭逻辑） | 以现有视觉为基准重建 + 截图存档比对 + 分阶段切换 |
| **后台暴露** | `/admin` 是公开路径 | 写操作一律需会话；可选加路径混淆或 Cloudflare Access |
| **快照存储占用** | 每份是完整文档副本，占用 ≈ `retention × 文档大小` | 2000 条链接约 400 KB，保留 30 份约 12 MB，在 1 GB 内；链接量上万时下调 `retention` |

---

## 附录 A：决策速查

| 项 | 结论 |
|---|---|
| 框架 | Vue 3 + Vite（实测 18.9 KB brotli） |
| 样式 | Tailwind v4 构建时；**禁用 CDN** |
| 校验 | 手写轻量（**禁用 zod**） |
| 图标 | 界面图标自绘 SVG（约 20 个）；分类图标字母/emoji；链接图标 `letter` 默认、`fetched` 可选 |
| 后端 | Hono，`core.ts` 零平台依赖 |
| 存储 | 只用 KV：主文档 + 图标 + 快照（index-aside 枚举） |
| 密码 | 常量时间字符串比较，密码存部署 Secret（**禁用 PBKDF2 等多轮 KDF**）；可选哈希版 |
| 读权限 | 公开（**读锁已删**） |
| 写权限 | 需会话，仅后台 |
| 前台 | 严格只读，6 个组件，无需登录 |
| 后台 | 4 个面板，12 项配置 |
| 导航 | 全局置顶区（每视图顶部）+ 全部链接 / 单分类 |
| 卡片 | 三档：card / compact / icon |
| 主题与卡片偏好 | 前台可切，写 localStorage，优先于站点默认 |
| 备份 | 自动（可配频率与份数）或手动；快照 + 下载文件 |
| 撤销 | 客户端会话内最近 10 步，`Ctrl/Cmd+Z` |
| 部署 | Cloudflare / EdgeOne Makers 各一份，A/B 定正式平台 |
| 回滚 | `git tag v1-legacy` |

## 附录 B：实现陷阱清单

按"最容易踩"排序，实施时逐条对照。

| # | 陷阱 | 正确做法 |
|---|---|---|
| 1 | **Tailwind 动态类名被 purge** | 网格 / 颜色等动态类名必须写完整字面量常量表，不能模板拼接 |
| 2 | **KV 写后立刻回读拿到旧值** | 乐观更新本地状态 + 写新 `rev` 进缓存，**不发回读请求** |
| 3 | **快照恢复沿用旧 `rev`** | 恢复后 `rev = 当前 rev + 1`，否则客户端误判"无变化" |
| 4 | **用 `KV.list()` 枚举快照** | 用 index-aside（索引存单个 key）。List 免费额度仅 1,000/天 |
| 5 | **PBKDF2 / zod 上服务端** | 登录用常量时间比较（或单次 HMAC）；校验用手写轻量版。10 ms CPU 上限 |
| 6 | **服务端解析整份书签 HTML** | 客户端 Web Worker 解析 + 分批（≤200 条）提交 |
| 7 | **`shared/` 里放运行时代码** | 只放类型。否则服务端依赖会被打进浏览器包体 |
| 8 | **图标以 data URL 内联进文档** | 独立 KV key。否则每次保存重传数 MB，逼近 25 MB 单值上限 |
| 9 | **`core.ts` 里 import 平台 SDK** | 平台符号只能在 `adapters/` 与 `store.ts` 出现 |
| 10 | **`Order` 中值耗尽后不重排** | 相邻两串无中间值可插时，做一次该分类内重排 |
| 11 | **导入时把新条目插到中间** | 一律追加到目标分类末尾，`order` 递增 |
| 12 | **`/api/icon` 未做 SSRF 校验** | 只允许已登记域名；禁私网 IP 段；限重定向；超时 3 s；失败回退字母图标 |
| 13 | **读失败时白屏** | 用 localStorage 缓存渲染 + 顶栏轻提示，不阻断浏览 |
| 14 | **首屏用全屏 loading 遮罩** | CSS 直出骨架；有缓存时几乎看不到骨架 |
| 15 | **localStorage key 不带版本** | 统一 `haonav.v1.<field>`，升级 schema 时提版本号 |
| 16 | **把 `env` 打日志或回显给前端** | 绝不 `console.log(env)`、绝不把 `env` 放进错误响应。错误只返回通用消息（当前项目就在 `details` 字段里回显内部错误） |
| 17 | **把密码写进 `site.config.json` 或提交 `.env`** | 密码**只放平台 Secret**。`site.config.json` 是要提交进仓库的出厂默认配置，绝不能放敏感值 |
| 18 | **登录失败时不区分原因** | 统一返回"密码错误"，不透露是格式问题还是长度问题；失败后加固定延迟，避免枚举
