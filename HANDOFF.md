# TimeAmber 公开前台重构交接

## 本次目标

在保留 TimeAmber 现有内容、认证、后台、同步、备份、Supabase 和 Docker 架构的前提下，
把公开前台重构为接近 `aibrium.cn` 的暖色内容站：大图 Hero、叠加搜索、三栏首页、圆角内容卡片和移动抽屉导航，并让所有品牌与公开展示字段可以从
管理员后台编辑。

本次 `03021bf` 在首页之外补齐了公共归档、分类、友链、关于和文章页的暖色公共皮肤；文章正文和文章数据保持不变。参考站的音乐、照片、说说、假统计等内容没有复制，右栏使用 TimeAmber 真实的站点概览、发布日历、分类/标签与友链数据。

## 架构决策

- 前台仍是 React 19 + TanStack Start/Router，未引入第二套 Next.js。
- 文章、分类、标签、友链和媒体仍来自 PostgreSQL/Supabase；首页只取轻量字段和聚合结果。
- 公开设置复用 `public.app_config` 的 `key = 'site'` JSONB，在其中增加 `publicSite` 子对象。
- `public-site-settings.ts` 负责默认值、版本、深度合并和 Zod 校验；敏感配置不进入该对象。
- 保存通过管理员会话和 `profiles.role = 'admin'` 校验，并写入 `audit_logs`。
- 背景只接受同源路径或 http(s) 资源；默认背景是本地渐变，状态文字使用单一 CSS 动画层。
- 渲染层再次限制头像、背景、导航、社交和文章封面/外链的协议，拒绝危险协议；运行天数在 hydration 后计算，日期固定按上海时区输出。

## 参考映射

| 参考视觉模块   | TimeAmber 实现                                           |
| -------------- | -------------------------------------------------------- |
| 个人资料卡     | 真实文章/标签/分类统计 + 现有作者资料与社交链接          |
| 最新文章       | `loadHomeData()` 的 12 篇轻量文章索引，保留站内/外链行为 |
| 站点概览       | 数据库文章、友链、最新更新时间和可选运行天数             |
| 发布日历       | 服务端按月日期聚合，客户端切换月份时只请求日期数量       |
| 分类/标签      | 现有 taxonomy SQL 聚合和 `/categories` 路由              |
| 友链入口       | 现有 `friends` 表和 `/friends` 路由                      |
| 背景/导航/页脚 | `publicSite` 配置，不复制参考站个人内容或资源            |

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
- `src/lib/theme.ts`、`tests/theme.test.ts`（无偏好用户默认亮色；已有 Cookie/localStorage 偏好优先）

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
- 针对本次文件的 ESLint：0 error
- `npm test`：34/34 通过
- `npm run build` 与 `docker compose build timeamber-app`：通过；仅有已有的大 chunk 和 TanStack 外部导入提示
- 临时验证容器：`timeamber-browser`，同 `timeamber_default` 网络，端口 `49288`，验收后已删除
- 桌面 1440×1000：首页 Hero、搜索胶囊、三栏布局、8 篇真实文章、统计与无外部参考资源请求
- 移动 390×844：无横向溢出，右侧橙色菜单和乳白抽屉可开关，搜索入口可见
- reduced motion：状态文字动画为 `none`，移动端无横向溢出
- 公开路由 `/`、`/archive`、`/categories`、`/friends`、`/about`、真实文章：HTTP 200，无错误页
- 未登录 `/admin`：客户端重定向 `/auth?redirect=%2Fadmin`，未显示后台侧栏
- 生产部署：基于 `03021bf` 重建并仅重启 `timeamber-app`，`49287` healthy，HTTP 200；Worker、Supabase、Cloudflare Tunnel 容器 ID 未变化
- 公网入口：`https://timeamber.com/` HTTP 200，首页结构、亮色主题、真实文章和 `TimeAmber` 品牌正常；无 `aibrium.cn` 资源请求
- 管理员 E2E：使用目标管理员账号登录成功，打开“公开站点”，保存接口 HTTP 200，提示保存成功，刷新后配置指纹一致
- 部署前备份：`/opt/docker/timeamber-deploy-backups/20260804-03021bf-pre`

## 2026-08-04 增量：IP 天气、落叶与首页分页

在 `03ccaa7` 增加并部署了本轮首页体验：

- 移除首页热门更新/热门分类/热门标签模块；保留真实站点基础统计，文章内容与数据不变。
- 右栏增加 IP 估算天气卡片：Cloudflare 地理请求头优先，缺失时服务端回退 `ipwho.is`，天气由服务端请求 Open-Meteo；浏览器只访问同源 Server Function，不采集 GPS、不返回原始 IP。
- 增加 8 个固定数量的 CSS 落叶，移动端隐藏，`prefers-reduced-motion` 下停止动画；没有随机数、RAF 或交互拦截。
- 首页文章改为 SSR `?page=N` 分页，每页 8 篇，稳定排序、越界归一化和第 1 页 canonical；分页后首页显示对应的第 9–16 篇等真实文章。
- 后台根容器已有 `admin-shell`，新增暖色表面、边框、输入和侧栏变量，保持后台导航密度，不把前台大卡片布局扩散到后台。
- 日历月份请求增加请求序号保护，旧响应不会覆盖新月份；用户可管理 URL 额外拒绝反斜杠路径绕过。

验证：`npx tsc --noEmit` 通过；`npm test` 37/37 通过；`npm run build` 与 `docker compose build timeamber-app` 通过。生产只重建并重启 `timeamber-app`，其端口仍为 `49287 -> 3000`，Worker 与 Cloudflare Tunnel 容器 ID 未变化；本机与公网 `/`、`/?page=2`、`/archive`、`/admin` 均返回 200，未登录后台按预期跳转登录页。Chrome/Playwright 验收确认桌面 8 篇、天气就绪、8 个落叶、分页可跳转，390px 无横向溢出，减弱动效下落叶动画为 `none`，浏览器未直连天气供应商或 `aibrium.cn`。

本轮备份：`/opt/docker/timeamber-deploy-backups/20260804-pagination-weather-pre`。本轮回滚标签：`timeamber-timeamber-app:rollback-before-20260804-pagination-weather`，指向已保留的稳定回滚镜像 `rollback-before-03021bf`；运行容器原内容层已被 Docker 回收，原容器引用已写入备份。

## 2026-08-04 增量：前台体验修正

在后续修正中：

- 移除顶部导航、导航卡和页脚的 RSS 入口；旧的 `publicSite.navigation` 配置即使仍含 `/rss.xml` 也不会再渲染。XML 端点保留以避免旧书签或外部订阅突然失效。
- 落叶层移出背景堆叠上下文，放到前台内容层上方（仍为 `pointer-events: none`）；桌面端可见，移动端和 reduced-motion 继续降级。
- 首页分页状态变化后滚动到 `#latest-posts`，不再回到 Hero 顶部。
- 顶部后台图标直接打开 `/auth?redirect=%2Fadmin`，登录页先立即渲染邮箱/密码表单，再后台检查已有会话；未登录用户可直接输入，已登录用户自动进入后台，不把账号密码写入前端。

验证：线上首页 RSS 文本计数为 0；落叶节点 8 个，实际 `display:block`、动画 `public-leaf-fall`、可见透明度约 0.56；点击下一页后 URL 为 `?page=2`、文章区距视口顶部约 88px；后台图标直达登录页且邮箱/密码输入框各 1 个。生产只重启 `timeamber-app`，本轮备份为 `/opt/docker/timeamber-deploy-backups/20260804-rss-scroll-auth-leaves-pre`，回滚标签为 `timeamber-timeamber-app:rollback-before-20260804-rss-scroll-auth-leaves`。

## 2026-08-05 增量：文章区密度校准

针对与 `aibrium.cn` 的首屏对比，在 `2026-08-05` 调整了首页纵向节奏：

- 首页分页从 8 篇调整为 5 篇，与示例站当前分页分组一致。
- 文章卡片改为约 9rem 基线高度，图片列从 38% 收紧到 31%，标题最多两行，摘要最多一行，并移除文章卡片内的标签胶囊。
- 对比测量：示例站卡片约 146–191px；TimeAmber 调整后 4/5 张卡片为 146px，最长标题卡片约 203px；中心列与左栏底部差约 94px，页面总高度从约 3113px 降至约 1976px。

验证：`npx tsc --noEmit`、`npm test` 37/37、`npm run build`、`docker compose build timeamber-app` 均通过；生产 `timeamber-app` healthy，公网 HTTP 200，Worker 与 Cloudflare Tunnel 未重启。本轮备份为 `/opt/docker/timeamber-deploy-backups/20260805-density-pre`，回滚标签为 `timeamber-timeamber-app:rollback-before-20260805-density`。

仍未完成的项目级检查：全量 lint 继续受仓库原有部署/Edge 文件的 Prettier/CRLF 报错影响；GitHub
HTTPS remote 没有非交互凭据，因此未推送分支或创建 Pull Request。

## 部署与回滚

本次已完成生产部署。部署前保存了旧容器/镜像检查信息、Compose 快照，并保留镜像标签
`timeamber-timeamber-app:rollback-before-03021bf`（复用已有稳定回滚镜像
`rollback-before-a08c590`；当前旧容器的内容摘要层已被 Docker 回收，无法重新打旧摘要标签）。后续部署应：

1. 备份数据库与 Compose 配置。
2. 记录当前镜像、分支和容器状态。
3. 在备份确认后构建 `Dockerfile`，仅更新 `timeamber-app`；Worker 无依赖变化无需重建。
4. 检查健康状态、首页、文章、后台、RSS、sitemap、媒体和 Cloudflare Tunnel。

回滚时切回上一 commit 或旧 app 镜像，再按现有 Compose 流程启动；不要删除数据库卷。
`publicSite` 是 JSONB 子对象，旧应用会忽略它，保留文章、媒体和现有配置兼容性。

## Git 状态

- 分支：`redesign/aibrium-glass-dashboard`
- 功能 commit：`03021bf`（feat: align public ui with aibrium layout）
- 基础设置功能 commit：`a08c590`（feat: redesign public site and add editable appearance settings）
- 部署记录 commit：本分支最新 docs commit
- 生产推送 / Pull Request：未执行
- 远程原有未提交改动：`docker-compose.yml` 路径迁移和未跟踪 `docker-compose.nas-source.yml`，未纳入本次功能提交
