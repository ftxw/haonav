
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
npm run typecheck  # tsc --noEmit
npm test           # vitest
npm run build      # 产出 dist/（前台 + 后台两个入口）
```

---

## 部署

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

### 方式一：EdgeOne Makers

1. 控制台 → Pages → 创建应用 → 连接 Git 仓库
2. 构建命令 `npm run build`，输出目录 `dist`
3. 「存储 - KV」创建命名空间 → 在项目里**绑定**，变量名 `HAONAV_KV`
4. 项目「环境变量」添加上面两个 Secret
5. 重新部署。Edge Functions 入口为 `api/adapters/edgeone.ts`

### 方式二：Cloudflare Pages / Workers

1. Workers & Pages → 创建 → 连接 Git 仓库，构建命令 `npm run build`，输出目录 `dist`
2. Workers & Pages → KV → 创建命名空间 → 在项目 Bindings 里添加，变量名 `HAONAV_KV`
3. 项目设置 → 环境变量（加密）添加两个 Secret
4. 重新部署。入口为 `api/adapters/cloudflare.ts`（`export default { fetch }`）

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

旧版数据分散在两个 KV key（网页端写 `haonav_*`、扩展写 `app_data`）。

```bash
npx tsx migrate/v0-to-v1.ts --dry-run   # 默认干跑：输出迁移前后对比报告，不写库
npx tsx migrate/v0-to-v1.ts --commit    # 确认无误后写入新 key nav:v1（旧 key 保留不动）
```

脚本会合并两个来源、按规范化 URL 去重（字段级合并 desc/icon/pinned）、重新分配重复 ID、并**移除旧版的分类密码锁**（报告里会列出）。执行前建议先在旧版导出一份 HTML 书签作为兜底。

---

## 说明

- 备份支持**自动**（可在后台配置频率与保留份数，默认每天 / 保留 7 份）与**手动**两种模式
- 快照枚举使用 index-aside（索引存单个 key），不消耗平台的 List 请求额度
- 前台不含任何编辑功能与登录界面；所有写操作由后台会话（HttpOnly cookie，30 天）保护
- 架构与实施细节见 [`HaoNav-改造方案.md`](./HaoNav-改造方案.md)
