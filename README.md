
# HaoNav

个人书签导航站。**前台只读浏览，后台全功能编辑**；数据存边缘 KV，一份代码部署到 EdgeOne Makers。

- 首屏关键路径 **约 19 KB brotli**（实测 18.6 KB）
- 站点设置全部在后台改，**保存即生效，无需重新构建**
- 无注册、无用户体系，只有一个管理员密码

## 技术栈

| 层 | 技术 |
|---|---|
| 前台 | Vue 3 + Vite + Tailwind v4（`web/`）· 浏览 / 搜索 / 复制 / 二维码，无写操作、无登录入口 |
| 后台 | Vue 3 独立入口（`admin/`），访客不下载 · 7 面板：链接管理 / 分类管理 / 搜索引擎 / 导入导出 / 链接检测 / 系统设置 / 备份管理 |
| API | Hono（`api/core.ts` 零平台符号，平台差异收在 `api/adapters/`） |
| 存储 | 边缘 KV 单文档 `nav:v1` + 快照 `nav:snap:*`（单键索引枚举，不耗 List 额度） |

## 本地开发

```bash
npm install        # .npmrc 已指向 npmmirror
npm run dev        # http://127.0.0.1:5173    后台 /admin
npm run typecheck  # vue-tsc
npm test           # vitest run
npm run build      # 产出 dist/（index.html 前台 + admin.html 后台）
```

- 未配密码时 dev 用默认密码 `haonav-dev`（仅本地；生产用同一默认值会被拒绝登录）
- 数据存 `.data/`（已 gitignore），删掉即回到空态
- 首次打开是空的：`/admin` 登录 → 「导入导出」导入浏览器书签 HTML

## 部署

### 1. 控制台必改两项（不改打不开）

连上 Git 仓库后平台会自动识别构建配置，**框架预设和输出目录一定会认错**：

| 字段 | 自动识别 ❌ | 必须改成 ✅ |
|---|---|---|
| 框架预设 | `Hono` | **`Vite`** |
| 输出目录 | `public` | **`dist`** |
| 根目录 / 编译命令 / 安装命令 | `./` · `npm run build` · `npm install` | 保持默认 |

仓库根目录没有 `public/`，`vite build` 产物在 `dist/` —— 填错等于上传空目录。

> 那个 `Hono` 只是显示用的框架标签，**不影响构建**，也不在 `edgeone.json` 里；它来自平台扫 `package.json` 依赖。

### 2. 配置：1 个绑定 + 2 个 Secret

| 位置 | 名称 | 值 |
|---|---|---|
| 绑定 / Bindings（**不是**环境变量区） | `HAONAV_KV` | 你的 KV 命名空间 |
| 环境变量 / Secrets | `HAONAV_ADMIN_PASSWORD` | 你自己定的后台密码 |
| 环境变量 / Secrets | `HAONAV_SESSION_SECRET` | 随机串，**≥32 字符** |

```bash
openssl rand -hex 32
# 或 node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- ⚠️ 三项必须配齐且合规。不合规时 `/api/login` 与 `/api/session` **直接返 503 并说明原因**（宁可不给登录，也不放行弱配置）。已知会触发 503 的情况：密钥缺失、密钥 <32 字符、密钥用了 `dev-insecure-session-secret`、密码用了 `haonav-dev`。
- ⚠️ 密码只放 Secret，**不要**写进 `site.config.json`（那个文件进仓库）。
- **KV 是「绑定」不是「环境变量」**：控制台填的变量名 `HAONAV_KV` 会变成边缘函数里的**全局变量**，不能从 `context.env` 读。本项目已做三级兜底，名字填对即可。

### 3. EdgeOne Makers 步骤（国内首选）

1. 控制台 → Pages / Makers → 创建应用 → **连接 Git 仓库**
2. 展开构建配置，**按上表逐项核对**（最容易漏）→ 框架 `Vite`、输出 `dist`
3. 「存储 → KV」创建命名空间
4. 回项目 → 「绑定」→ 绑定该命名空间，变量名填 **`HAONAV_KV`**
5. 「环境变量 / Secrets」加 `HAONAV_ADMIN_PASSWORD`、`HAONAV_SESSION_SECRET`
6. 部署

> 🔴 **上线只能靠推 Git 触发部署。** `edgeone makers deploy` CLI 仅支持「直接上传型」项目，本项目是 Git 连接型 —— 硬跑只会新建一个独立项目并换掉域名，不会更新现有站点。
>
> API 入口是 `edge-functions/api/[[default]].ts`（catch-all，接住全部 `/api/*`）。平台**只扫 `edge-functions/` 目录**，别改名。
>
> 仓库根目录的 `edgeone.json` 已写好 `buildCommand` / `outputDirectory`，别改名、别删。

## 支持功能

| 功能 | 位置 |
|---|---|
| 浏览 / 搜索 / 复制链接 / 二维码 | 前台（只读） |
| 白天黑夜、卡片视图切换 | 前台顶栏（个人偏好，只影响本机） |
| 链接增删改、置顶、拖拽排序、批量操作 | 后台「链接管理」 |
| 分类增删改与拖拽排序 | 后台「分类管理」 |
| 站外搜索引擎管理 | 后台「搜索引擎」 |
| 导入浏览器书签 HTML / JSON，导出完整数据与标准书签文件 | 后台「导入导出」 |
| 重复链接、失效链接检测与一键清理 | 后台「链接检测」 |
| 自动 / 手动备份快照，恢复历史版本 | 后台「备份管理」 |
| 站点全局设定（见下） | 后台「系统设置」 |

### 可配置项

「系统设置」（保存即生效）：`name` 站名 · `icon` 品牌图标 · `accent` 主色 · `themeDefault` 默认主题 · `cardStyle` 卡片视图 · `openInNewTab` 新标签打开 · `searchEngines` 搜索引擎 · `iconStrategy` 图标策略 · `iconApi` 图标服务地址 · `footerLinks` 页脚外链

「备份管理」：`mode` 自动/手动 · `frequency` 频率 · `retention` 保留份数（默认每天 / 保留 7 份）

出厂默认写在 `site.config.json`；后台改动存 KV，**优先级更高**，不必重新构建。

### 图标

图标由**前端直连图标服务**（默认 `https://api.xinac.net/icon/?url=`），不经本站边缘函数 —— Makers 禁止边缘函数写 CDN 缓存（`cache.put()` 抛 `forbidden cdn cache`），代理拿不到缓存、只徒增计算。

- `fetched`（默认）：自定义图标 → 图标服务 → 失败回退本地字母
- `letter`：纯本地字母，零请求
- 服务地址在「系统设置」可改（`iconApi`），非 `http(s)://` 开头的值会被丢弃
- 图标服务自带 `Cache-Control: public, max-age=604800` + CORS `*` → 浏览器缓存 7 天，零 KV

### 其他

- 所有写操作由后台会话保护（HttpOnly cookie，**30 天**）
- 快照枚举用单键索引，不用平台 List 接口（免费版仅 1,000 次/天）
- 改密码：密码不存任何地方，**只能重设不能找回** —— 控制台改 `HAONAV_ADMIN_PASSWORD` 后重新部署，数据不受影响
