# TimeAmber 公开前台重构交接

## 本次目标

在保留 TimeAmber 现有内容、认证、后台、同步、备份、Supabase 和 Docker 架构的前提下，
把公开前台重构为接近 `aibrium.cn` 的安静玻璃仪表盘，并让所有品牌与公开展示字段可以从
管理员后台编辑。

## 架构决策

- 前台仍是 React 19 + TanStack Start/Router，未引入第二套 Next.js。
- 文章、分类、标签、友链和媒体仍来自 PostgreSQL/Supabase；首页只取轻量字段和聚合结果。
- 公开设置复用 `public.app_config` 的 `key = 'site'` JSONB，在其中增加 `publicSite` 子对象。
- `public-site-settings.ts` 负责默认值、版本、深度合并和 Zod 校验；敏感配置不进入该对象。
- 保存通过管理员会话和 `profiles.role = 'admin'` 校验，并写入 `audit_logs`。
- 背景只接受同源路径或 http(s) 资源；默认背景是本地渐变，状态文字使用单一 CSS 动画层。

## 参考映射

| 参考视觉模块 | TimeAmber 实现 |
| --- | --- |
| 个人资料卡 | 真实文章/标签/分类统计 + 现有作者资料与社交链接 |
| 最新文章 | `loadHomeData()` 的 12 篇轻量文章索引，保留站内/外链行为 |
| 站点概览 | 数据库文章、友链、最新更新时间和可选运行天数 |
| 发布日历 | 服务端按月日期聚合，客户端切换月份时只请求日期数量 |
| 分类/标签 | 现有 taxonomy SQL 聚合和 `/categories` 路由 |
| 友链入口 | 现有 `friends` 表和 `/friends` 路由 |
| 背景/导航/页脚 | `publicSite` 配置，不复制参考站个人内容或资源 |

没有增加参考站不存在于 TimeAmber 数据模型中的音乐、说说、照片墙、假访问量或 AI 猫咪。

## 主要文件

新增：

- `src/lib/public-site-settings.ts`
- `src/lib/public-site-settings.functions.ts`
- `src/components/public/*`
- `src/components/home/HomeDashboard.tsx`
- `src/components/admin/public-site/PublicSiteSettingsPanel.tsx`
- `tests/public-site-settings.test.ts`

修改：

- `src/routes/__root.tsx`、`src/routes/index.tsx`
- `src/lib/home.functions.ts`、`src/lib/state.functions.ts`、`src/lib/admin-store.tsx`
- `src/components/layout/Navbar.tsx`、`Footer.tsx`、`SearchDialog.tsx`
- `src/routes/archive.tsx`、`categories.tsx`、`friends.tsx`、`about.tsx`、`posts.$slug.tsx`
- `src/styles.css`、管理员侧栏与设置页、`README.md`

## 设置与生效机制

设置入口：`/admin/settings` → “公开站点”。表单不是 JSON 编辑器，支持分区、图片媒体库
入口、开关、链接管理、上移/下移排序、保存、取消（未保存草稿不会写库）和恢复默认。

公开 root loader 通过 `loadPublicChrome()` 一次读取站点外壳；设置失败时回退默认值，
不让公开页面白屏。保存直接更新 `app_config.site.publicSite` 并写审计；没有长缓存，因此刷新
即可生效，不需要构建、部署或重启。现有站点设置保存逻辑会保留 `publicSite`，避免旧表单覆盖新配置。

## 安全与数据保护

- Server Function 保存要求 Supabase HttpOnly 会话和管理员角色。
- Zod 校验 URL 协议、颜色、长度、透明度、轮播间隔、导航和模块重复项。
- 公开 root 只下发公开设置、友链和首页轻量数据，不下发 AI/云盘/SMTP/Worker/数据库密钥。
- 图片字段使用媒体库 URL 或安全路径；不把 service role key 放入浏览器。
- 审计记录只写操作人、时间、版本和区域摘要，不写二进制或密钥。

## 验证记录

在树莓派 `/opt/docker/timeamber` 的 `redesign/aibrium-glass-dashboard` 分支完成：

- `npx tsc --noEmit`：通过
- 针对本次文件的 ESLint：0 error，1 条既有 Fast Refresh warning
- `npm test`：34/34 通过
- `npm run build`：通过；仅有已有的大 chunk 提示和 TanStack 外部导入提示
- 临时验证容器：`timeamber-browser`，同 `timeamber_default` 网络，端口 `49288`
- 桌面 1440×900：首页 SSR、8 个玻璃面板、真实文章/统计、无外部参考资源请求
- 移动 390×844：无横向溢出，抽屉导航可开关，搜索入口可见
- reduced motion：状态文字动画为 `none`，移动端无横向溢出
- 公开路由 `/`、`/archive`、`/categories`、`/friends`、`/about`、真实文章：HTTP 200，无错误页
- 未登录 `/admin`：客户端重定向 `/auth?redirect=%2Fadmin`，未显示后台侧栏
- 生产部署：基于 `a08c590` 重建并仅重启 `timeamber-app`，`49287` healthy，HTTP 200；Worker、Supabase、Cloudflare Tunnel 未重启
- 管理员 E2E：使用目标管理员账号登录成功，打开“公开站点”，保存接口 HTTP 200，提示保存成功，刷新后配置指纹一致
- 部署前备份：`/opt/docker/timeamber-deploy-backups/20260804-a08c590-pre`

仍未完成的项目级检查：全量 lint 继续受仓库原有部署/Edge 文件的 Prettier/CRLF 报错影响；GitHub
HTTPS remote 没有非交互凭据，因此未推送分支或创建 Pull Request。

## 部署与回滚

本次已完成生产部署。部署前保存了旧容器/镜像检查信息、Compose 快照，并保留镜像标签
`timeamber-timeamber-app:rollback-before-a08c590`。后续部署应：

1. 备份数据库与 Compose 配置。
2. 记录当前镜像、分支和容器状态。
3. 在备份确认后构建 `Dockerfile`，仅更新 `timeamber-app`；Worker 无依赖变化无需重建。
4. 检查健康状态、首页、文章、后台、RSS、sitemap、媒体和 Cloudflare Tunnel。

回滚时切回上一 commit 或旧 app 镜像，再按现有 Compose 流程启动；不要删除数据库卷。
`publicSite` 是 JSONB 子对象，旧应用会忽略它，保留文章、媒体和现有配置兼容性。

## Git 状态

- 分支：`redesign/aibrium-glass-dashboard`
- 功能 commit：`a08c590`（feat: redesign public site and add editable appearance settings）
- 部署记录 commit：本分支最新 docs commit
- 生产推送 / Pull Request：未执行
- 远程原有未提交改动：`docker-compose.yml` 路径迁移和未跟踪 `docker-compose.nas-source.yml`，未纳入本次功能提交
