
# HaoNav v2 - 智能私有导航站

一个现代化的个人书签导航站。**前台纯浏览（零管理功能、首屏约 35 KB brotli），后台全功能编辑**，数据存边缘 KV，一份代码可部署到 EdgeOne Makers 或 Cloudflare（免费套餐）。

---

## 架构

| 层 | 技术 |
|---|---|
| 前台 | Vue 3 + Vite + Tailwind v4（`web/`，严格只读：浏览 / 搜索 / 复制 / 二维码） |
| 后台 | Vue 3（`admin/`，独立入口，访客不下载）：链接 / 分类 / 搜索 / 数据 / 备份 / 设置 六个面板 |
| API | Hono（`api/core.ts` 零平台依赖，平台差异收在 `api/adapters/`） |
| 存储 | 边缘 KV 单文档（`nav:v1`）+ 图标缓存 + 每日快照（index-aside 枚举） |

**前台严格只读**：所有编辑、配置、导入导出都在 `/admin`。站点设置（站名、品牌图标、主色、卡片视图、搜索引擎等 9 项 + 备份 3 项）全部在后台修改，**秒级生效，无需重新构建**。

---

## 本地开发

```bash
npm install        # 本仓库已配置 .npmrc 指向 npmmirror
npm run dev        # http://127.0.0.1:5173   后台在 /admin
```

- 未配置密码时，dev 环境使用默认密码 `haonav-dev`（控制台会有醒目告警，仅限本地）
- 首次打开是空的：进 `/admin` → 登录 → 「数据」面板 → 导入浏览器书签 HTML，或在「链接」面板手动添加
- 本地数据存放在 `.data/`（已 gitignore），删除即回到全新空态

```bash
npm run typecheck  # vue-tsc --noEmit -p tsconfig.json
npm test           # vitest run
npm run build      # 产出 dist/（前台 index.html + 后台 admin.html 两个入口）
```

---

## 部署

### ⚠️ 部署前必读：控制台会自动识别错这两项

在 EdgeOne Makers 控制台里连接 Git 仓库后，平台会**自动识别**构建配置。**它一定会认错**，必须在部署前手动改正，否则站点打不开：

| 字段 | 控制台自动识别（❌ 错的） | 必须改成（✅） |
|---|---|---|
| **框架预设** | `Hono` | **`Vite`** |
| **输出目录** | `public` | **`dist`** |
| 根目录 | `./` | `./`（保持默认） |
| 编译命令 | `npm run build` | `npm run build`（保持默认） |
| 安装命令 | `npm install` | `npm install`（保持默认） |

**为什么平台会认错**：它在 `package.json` 的 dependencies 里看到 `hono`，就猜成 Hono 预设，并把输出目录默认成 `public`。

**为什么填错就打不开**：本项目是 **Vite 多入口**（`index.html` 前台 + `admin.html` 后台），`vite build` 的产物在 **`dist/`**。仓库里**根本没有 `public/` 这个目录** —— 上传一个空目录，站点自然 404 / 空白页。

> 💡 仓库根目录的 [`edgeone.json`](./edgeone.json) 已经把 `buildCommand` / `outputDirectory` 写好了。
> 但**如果控制台里已经保存过 `public` / `Hono`，控制台的值优先级更高，必须手动改回来**。改完重新部署。
>
> ⚠️ 框架标签（那个"Hono"字样）**不在 `edgeone.json` 里改**，该字段平台不支持；它来自平台对
> `package.json` 依赖的自动检测。要改只有两条路：① 在控制台「项目设置 → 构建与部署配置」里手动覆盖；
> ② 让生产依赖里不再出现 `hono`（见下方「关于 Hono 标签」）。
> 好消息是：**这个标签只影响显示，不影响构建** —— 真正的构建行为由 `edgeone.json` 的
> `buildCommand` + `outputDirectory` 决定，这两项是官方支持的字段。

### 需要配置的东西（共 1 个绑定 + 2 个 Secret）

| 位置 | 名称 | 值 |
|---|---|---|
| 「绑定 / Bindings」（**不是**环境变量区） | `HAONAV_KV` | 你的 KV 命名空间 |
| 「环境变量 / Secrets」 | `HAONAV_ADMIN_PASSWORD` | **你自己定的后台登录密码** |
| 「环境变量 / Secrets」 | `HAONAV_SESSION_SECRET` | 32 字节随机串，见下方生成命令 |

```bash
# 生成会话签名密钥（任选其一）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
openssl rand -hex 32
```

> ⚠️ `HAONAV_SESSION_SECRET` **必须用密码学随机数生成，不能随便填** —— 它是会话 cookie 的签名密钥，被猜出就能伪造登录态。它不需要你记住，也不需要备份：换了它只需重新登录一次。
>
> ⚠️ 密码只能放在平台 Secret 里，**不要**写进 `site.config.json`（那个文件会提交进仓库）。

### 方式一：EdgeOne Makers（国内首选）

1. 控制台 → Pages / Makers → **创建应用** → **连接 Git 仓库**，选中本仓库
2. **展开构建配置，逐项核对上面那张表**（这一步最容易漏）：
   - 框架预设：**`Vite`**（不是 Hono）
   - 根目录：`./`
   - 输出目录：**`dist`**（不是 public）
   - 编译命令：`npm run build`
   - 安装命令：`npm install`
3. 「存储 → KV」**创建命名空间**
4. 回到项目 → 「绑定 / Bindings」→ **绑定**该命名空间，**变量名填 `HAONAV_KV`**
5. 项目「环境变量 / Secrets」添加两个 Secret：`HAONAV_ADMIN_PASSWORD`、`HAONAV_SESSION_SECRET`
6. **部署**
7. **部署后自检**（见下方「部署后自检」一节）—— 务必实际请求一次 `/api/health`

#### 关于 KV 绑定：它是一个「全局变量」，不是环境变量

这是本项目最容易踩的坑，单独说明：

- 在控制台绑定命名空间时填的**变量名 `HAONAV_KV`，会变成 Edge Function 里的一个全局变量**。
- 它**不是**环境变量，**不能**从 `context.env` 读。即：

  ```js
  // ❌ 错：const KV = context.env.HAONAV_KV;
  // ✅ 对：await HAONAV_KV.get('key')      // 变量名 = 你在控制台填的名字
  ```

- 同一条原理适用于 Cloudflare：也是**绑定（Binding）**，不是 Secret。两个平台的「绑定」区和「环境变量/Secret」区在不同位置，别找错地方。

本项目已经在 [`api/adapters/edgeone.ts`](./api/adapters/edgeone.ts) 里做了**三重兜底**（`env` → `globalThis` → 裸标识符），所以只要控制台里变量名填对 `HAONAV_KV` 就行，不需要你改代码。

#### API 入口：`edge-functions/api/[[default]].ts`

EdgeOne Makers **只扫描约定目录 `edge-functions/`，路径即路由**：

```
edge-functions/api/hello.js        →  GET /api/hello
edge-functions/api/[[default]].ts  →  /api/* 下所有未单独定义的路由（catch-all）
```

前台与后台的所有请求都打 `/api/*`（例如 `/api/data`、`/api/login`），因此全部由这个 catch-all 接住，再转调真正的实现 [`api/adapters/edgeone.ts`](./api/adapters/edgeone.ts)（该文件里同时导出 `export default { fetch }` 与 `onRequest`，两种入口形式平台都能识别）。

> ⚠️ 官方提示：dev server 比部署时的 builder 更宽松 —— catch-all 这类路由**部署后必须实际请求复验**一次。

#### `edgeone.json`

仓库根目录的 [`edgeone.json`](./edgeone.json) 就是给平台读的构建配置，**不要改文件名、不要删**：

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

Git 连接部署和 CLI 部署都依赖它。仓库里若出现名字相似的另一份配置（如已删除的 `eop-config.json`），一律以 `edgeone.json` 为准。

> ⚠️ **没有顶层 `framework` 字段**。官方文档（[edgeone.json](https://edgeone.ai/document/162316940304400384)）
> 支持的顶层键只有：`name` / `buildCommand` / `installCommand` / `outputDirectory` /
> `nodeVersion` / `redirects` / `rewrites` / `headers` / `cloudFunctions` / `schedules` / `agents`。
> 曾经写过的 `"framework": "vite"` 是**无效配置**，平台直接忽略 —— 这正是它一直显示 Hono 的原因。
> `framework` 只作为 `agents.framework` 存在，且仅用于 AI Agent 的 `context.store` / `context.tools` 适配。

### 方式二：Cloudflare Pages / Workers

1. Workers & Pages → 创建 → 连接 Git 仓库
2. 构建命令 `npm run build`，**输出目录 `dist`**
3. Workers & Pages → KV → 创建命名空间 → 在项目 **Bindings** 里添加，变量名 **`HAONAV_KV`**
4. 项目设置 → 环境变量（加密）添加两个 Secret：`HAONAV_ADMIN_PASSWORD`、`HAONAV_SESSION_SECRET`
5. 重新部署。入口为 [`api/adapters/cloudflare.ts`](./api/adapters/cloudflare.ts)（`export default { fetch }`）

> ⚠️ **Cloudflare 路径的 API 目前还没接线 —— 建议现阶段优先用 EdgeOne Makers。**
>
> 仓库里只有一个函数入口目录 `edge-functions/`，那是 **EdgeOne Makers 的约定**。Cloudflare Pages 认的是 `functions/` 目录，两者不通用。所以直接拿这份代码去 Cloudflare 部署，得到的是一个**纯静态站点**：前台页面能打开，但 `/api/*` 全部 404，读不到数据。
>
> 要在 Cloudflare 上跑通，需要把 [`api/adapters/cloudflare.ts`](./api/adapters/cloudflare.ts) 接到 Cloudflare 自己的入口约定上（例如新增 `functions/api/[[path]].ts` 转调它，与 `edge-functions/api/[[default]].ts` 的做法一致），并把 `HAONAV_KV` 以 **Binding** 形式绑到 Pages 项目。

### 部署后自检

```bash
# 1) API 是否挂上（最关键）—— 期望 {"status":"ok","platform":"edgeone",...}
curl -s https://<你的域名>/api/health

# 2) 前台是否出得来（期望 200 + HTML）
curl -sI https://<你的域名>/

# 3) 后台入口是否存在（期望 200 + HTML；登录功能需要两个 Secret 已配）
curl -sI https://<你的域名>/admin
```

`platform` 字段会告诉你当前跑在哪个平台（`edgeone` / `cloudflare` / `dev`）。**如果 `/api/health` 返回 404，说明 `edge-functions/` 入口没被识别**（见排障表）。

> `GET /api/health` 在 **KV 未绑定**时仍会返回 `200`，并多一个 `kvBound` 字段（正常绑定时不出现，绑好了就是 `GET /api/data` 等接口能正常用）。所以它是排障第一入口：`kvBound:false` ⇒ 去控制台补 KV 绑定。

### 故障排查

| 现象 | 原因 | 修法 |
|---|---|---|
| 部署成功但打开是 404 / 空白页 | 输出目录填成了 `public`（仓库里不存在），或框架预设被自动选成了 Hono | 输出目录改 `dist`，框架预设改 **Vite**，重新部署 |
| 页面能打开但一条链接都没有、顶栏报错 | `edge-functions/` 入口没被识别，`/api/*` 全部 404 | 确认 `edge-functions/api/[[default]].ts` 存在且已提交；确认它所在的 `edge-functions/` 是仓库根目录下的（不是 `edgefunctions/`） |
| 页面能打开但顶栏报错，`/api/*` 返回 `{"error":"KV 命名空间未绑定"}`（或旧版只显示 `script error`） | KV 命名空间没绑定到**本项目**，或绑定时变量名不是 `HAONAV_KV` | 控制台 → 项目 → KV 存储 → 绑定命名空间，**变量名填 `HAONAV_KV`**，重新部署。可用 `GET /api/health` 看 `kvBound` 快速判断 |
| 打不开 `/admin` 或登录不上 | `HAONAV_ADMIN_PASSWORD` / `HAONAV_SESSION_SECRET` 没配 | 补上两个 Secret 后重新部署；改密码也是同样操作 |
| 登录后一刷新就掉登录态 | 用的是 http 访问，浏览器不保存 `Secure` cookie | 通过 https 域名访问（平台默认域名就是 https） |
| 前台能看到数据但「保存设置」后几十秒才生效 | KV 最终一致（跨边缘节点最长约 60 s） | 属正常现象，同城/同节点是秒级；刷新前台即可 |

### 首次使用

1. 打开站点（前台是空的，这是正常的 —— **不带任何预置示例数据**）
2. 打开 `/admin` → 输入你设定的密码
3. 「分类」面板建几个分类 → 「数据」面板导入浏览器书签 HTML（在浏览器里解析，不会卡）
4. 「设置」面板改站名 / 主色 / 卡片视图等，保存后前台刷新即生效

### 日常使用

| 操作 | 位置 |
|---|---|
| 加 / 改 / 删 / 置顶 / 排序链接 | 后台「链接」 |
| 分类管理 | 后台「分类」 |
| 搜索引擎管理 | 后台「搜索」 |
| 导入书签 / 重复检测 / 死链检测 | 后台「数据」 |
| 备份（快照 + 下载 JSON/HTML） | 后台「备份」 |
| 改站名 / 主色 / 卡片视图默认值 | 后台「设置」 |
| 切换白天黑夜 / 卡片视图 | **前台**顶栏（个人偏好，只影响本机） |

### 改密码 / 忘记密码

密码不存在任何存储里，**只能重设不能找回**：在平台控制台把 `HAONAV_ADMIN_PASSWORD` 改成新值即可，数据不受影响。

---

## 从 v1 旧版迁移

旧版数据分散在两个 KV key（网页端写 `haonav_*`、扩展写 `app_data`）。迁移脚本是一个**离线转换器**：把旧数据的导出文件转成新的 `nav:v1` 文档，人工确认后再导入 KV。

**准备**：在旧版控制台把下列 key 的值导出成一个 JSON 文件（值可以是字符串或已解析的 JSON）：

```json
{
  "haonav_links": "...",
  "haonav_categories": "...",
  "haonav_settings": "...",
  "haonav_search_engines": "...",
  "app_data": "..."
}
```

> 只导 `haonav_*` 或只导 `app_data` 都会丢一半数据 —— 两个来源都要导。

**干跑（默认，不写任何东西，只打印对比报告）**：

```bash
node --experimental-strip-types migrate/v0-to-v1.ts --in old-data.json
```

**确认无误后提交**（把结果写进内存库并导出为新文档文件）：

```bash
node --experimental-strip-types migrate/v0-to-v1.ts --in old-data.json --commit --out new-doc.json
```

然后把 `new-doc.json` 的内容作为 KV key **`nav:v1`** 写入新项目的 KV（旧 key 一律不动，随时可回滚）。

脚本会合并两个来源、按规范化 URL 去重（**字段级合并** `desc` / `icon` / `pinned`）、重新分配重复 ID、并把旧版的分类密码锁**移除**（报告里会逐条列出）。报告同时给出「迁移前 vs 迁移后」的链接数 / 分类数、只在 `app_data` 里出现的条数（即"扩展存的书签"救回了多少）。执行前建议先在旧版导出一份 HTML 书签作为兜底。

---

## 说明

- 备份支持**自动**（可在后台配置频率与保留份数，默认每天 / 保留 7 份）与**手动**两种模式
- 快照枚举使用 index-aside（索引存单个 key），不消耗平台的 List 请求额度
- 前台不含任何编辑功能与登录界面；所有写操作由后台会话（HttpOnly cookie，30 天）保护
- 图标策略默认 `fetched`（后台可切成 `letter` 走本地字母图标）
- 架构与实施细节见 [`HaoNav-改造方案.md`](./HaoNav-改造方案.md)

### ⚠️ 图标接口的缓存路径（Makers 平台约束，已实测）

图标代理按 `workers.js` 的 `handleIconProxy` 逐行对齐，但 **Makers 的默认缓存策略对
`URI Path starts with /api/` 一律 `Bypass Cache`**（官方文档原话），带来两个实测后果：

1. `/api/*` 的响应永不进 CDN（响应无 `Age` 头）；
2. 边缘函数里调 `cache.put()` 直接抛 `err:forbidden cdn cache`
   （预览域名 `*.edgeone.cool` 与绑定的正式域名均复现，与代码 / 响应头 / 域名无关）。

→ 只要图标接口顶着 `/api/` 前缀，`caches.default` 就**永远写不进去**，表现为「一直 MISS」。

**对策（方案 A）**：把图标接口从 `/api/icon` 挪到 `/icon`（非 `/api/` 路径）。
Makers 只对 `/api/*` 强制 Bypass Cache，非 api 路径不走该策略，因此 `/icon` 有望解锁
CDN 缓存与 Cache API 写入。旧路径 `/api/icon` 保留向后兼容（仍处 `/api/*` 下，天然不缓存）。
前端 `LinkCard`、后台列表等已全部切到 `/icon`。新的边缘函数入口：`edge-functions/icon.ts`
（只把 `api/adapters/edgeone` 的两种导出透出去，逻辑仍在 `api/core.ts`，零平台耦合）。

**实时诊断**（看响应头即可，无需查日志）：
- `X-Icon-Cache-Status`：`HIT`(命中边缘缓存) / `MISS`(已回源并写入) / `DEFAULT`(上游失败，回退内置 SVG)
- `X-Icon-Cache-Put`：`ok`(caches.default 写入成功) / `err:<msg>`(被平台拒绝) / `no-cache-api`(运行时未注入 caches)
- `X-Icon-WaitUntil`：`yes` / `no`（waitUntil 是否可用）

**部署后实测结论**（curl 复验，见 `X-Icon-Cache-Put`）：
- `/icon` 路由本身可达：✅（确认 `edge-functions/icon.ts` 被 Makers 按 path=route 正确挂载）
- `/icon` 下的 `cache.put`：⏳ 以本轮部署的 curl 实测为准

> 若 `/icon` 下 Makers **仍**禁止 `cache.put`，则退化为 **方案 B：直连 `api.xinac.net`**
> （去掉代理，前端直接 `<img src="https://api.xinac.net/icon/?url=...">`）。该服务本身返回
> `Cache-Control: public, max-age=604800, stale-while-revalidate=2592000`，浏览器缓存 7 天，
> 零 KV、零边缘函数开销 —— 对个人站体验无差别。
