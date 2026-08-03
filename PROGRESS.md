# 改造进度

> 每完成一个阶段就更新本文件。分支命名 `feat|fix/p{n}-{slug}`，单独交付，
> 跑 `tsc --noEmit` + `eslint` + `prettier --check` 并贴结果。
>
> 主机地址、账号与密钥一律不写进本文件，见部署机上的私有交接文档。

## 构建与部署要点

| 项       | 说明                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 部署     | `docker compose build timeamber-app && docker compose up -d timeamber-app`（只动 app，Supabase 全家桶不碰）                                                   |
| 类型检查 | 部署机不装 `node_modules`，借构建镜像跑：`docker run --rm -v $PWD/src:/app/src:ro -v $PWD/tsconfig.json:/app/tsconfig.json:ro <build-image> npx tsc --noEmit` |
| 回滚     | 保留上一版 app 镜像打 tag，`docker compose up -d` 切回即可                                                                                                    |

**两个坑**：

1. `npm run build`（vite build）**不做类型检查**，类型错误不会阻断构建，必须单独跑 `tsc --noEmit`。
2. 构建要后台跑再轮询日志（`setsid ... > build.log 2>&1 < /dev/null &`）。直接挂在 SSH 通道里，
   通道一断会留下孤儿构建进程，两个并发构建会互相卡死。完整构建约 4–6 分钟。

## 任务进度

| 阶段  | 任务                                                  | 状态      |
| ----- | ----------------------------------------------------- | --------- |
| P0-1  | 文章正文 Markdown 渲染（GFM + Shiki 高亮 + 表格修复） | ✅ 已上线 |
| P0-1b | 正文客户端增强（图片放大 / 代码复制）                 | ✅ 已上线 |
| P0-2  | 首页「近 7 天访问」空卡片                             | ✅ 已上线 |
| P1    | Hero 瘦身 + 卡片修复 + 阴影 token 化                  | ✅ 已上线 |
| P2    | 分类页 / Cmd+K 搜索 / 侧栏死链                        | ✅ 已上线 |
| P3    | sitemap / RSS / SEO head / 归档折叠                   | ✅ 已上线 |
| P4    | 后台概览访问卡片 / Ask 前台化                         | ✅ 已上线 |

## P5–P7 精修任务

| 任务 | 内容                                             | 状态                                |
| ---- | ------------------------------------------------ | ----------------------------------- |
| T21  | 全局动效 token 化，移除路由整页过渡              | ✅ 2026-08-03                       |
| T22  | 按压反馈与统一 focus-visible 环                  | ✅ 2026-08-03                       |
| T23  | 暗色模式噪点、琥珀光晕与主题切换质感             | ✅ 2026-08-03                       |
| T24  | 文章卡片 hover 提升                              | ✅ 2026-08-03                       |
| T25  | 首页、归档、友链间距审计                         | ✅ 2026-08-03                       |
| T26  | 空状态、无结果与骨架屏统一                       | ✅ 2026-08-03                       |
| T27  | 主题切换图标 morph                               | ✅ 2026-08-03                       |
| T28  | 搜索对话框开合与遮罩动效                         | ✅ 2026-08-03                       |
| T29  | 回到顶部与阅读进度条动效                         | ✅ 2026-08-03                       |
| T30  | 移动端抽屉节奏与退出对称                         | ✅ 2026-08-03                       |
| T31  | Toast 进入/退出与语义图标                        | ✅ 2026-08-03                       |
| T32  | 首屏文章列表 stagger                             | ✅ 2026-08-03                       |
| T33  | 罕见场景 delight 预算                            | ✅ 2026-08-03                       |
| T34  | hydration payload 与后台重复请求治理             | ✅ 2026-08-03                       |
| T35  | robots.txt 指向 sitemap                          | ✅ 2026-08-03                       |
| T36  | eslint 构建上下文清理                            | ✅ 2026-08-03                       |
| T37  | createServerFn 校验 API 与当前 TanStack 版本统一 | ✅ 2026-08-03                       |
| T38  | 后台登录后浏览器实测                             | ⏳ 需管理员会话（未登录边界已验收） |

## 各阶段实测结果

- **P0-1b**：文章页 5 个 `.code-block` + 复制按钮 + 语言标签，26 张图全部挂上 `medium-zoom-image`；
  复制实测写入 160 字符与代码块内容一致。
  两个根因：① 正文由 `dangerouslySetInnerHTML` 注入，React 重新提交该节点会重设 innerHTML、
  抹掉客户端插入的 DOM，所以外框结构必须服务端直出、客户端只用事件委托；
  ② `@shikijs/rehype` 把高亮结果作为**嵌套 root 片段**插回（hast 类型里 `Root.children` 不含 `Root`），
  且写的是 `class` 而非 `className`，自定义 rehype 插件遍历时两点都要照顾。
- **P0-2**：SSR 直出 1058 PV + 7 根真实柱子（原本是空容器 + `...`，全靠客户端异步填）。
- **P1**：Hero 从 `pt-28`+7xl 收到 `pt-16`+5xl，首屏直接见文章；修掉无标签文章并排显示
  两个相同分类 chip 的 bug；6 处硬编码 `oklch` 阴影收敛成 `--shadow-glow` 等 token。
- **P2**：`/categories` 从 404 到可用（5 分类 / 360 标签）；Cmd+K 搜索命中分类、标签与文章；
  Navbar 放大镜与侧栏分类此前都是「能点没反应」的死交互。
- **P3**：`/sitemap.xml` 1926 个 URL、`/rss.xml` 50 条且描述已去 Markdown 语法；
  文章页补齐 canonical / og:url / og:image / article:published_time / twitter:card；
  归档页 SSR 从 1921 篇降到 398 篇（按年折叠，条件渲染而非 `hidden`）。
  **首页 hydration payload 1,042,677 → 875,846 字符（-16%），`void 0` 空占位 9710 → 0。**
- **P4**：后台概览新增近 7 天访问卡片；`/ask` 前台问答**默认关闭**，
  开关在 `/admin/settings` 的「前台功能」区块，附全站限流（每分钟 6 次、每天 300 次）。

## 最终生产验收（2026-08-03）

- `docker compose build timeamber-app` 成功；`timeamber-app` 重建后为 `healthy`，端口映射保持 `49287 -> 3000`。
- 生产路由返回：`/`、`/archive`、`/categories`、`/about`、`/friends`、`/robots.txt`、`/sitemap.xml`、`/rss.xml`、文章页、`/admin` 均为 200；未登录访问 `/admin` 最终跳转 `/auth?redirect=%2Fadmin`，登录表单可见。
- `robots.txt` 生产响应已包含 `Allow: /`、`Disallow: /admin`、`Disallow: /auth` 与 `Sitemap: /sitemap.xml`。
- 浏览器验收使用默认桌面视口与 390×844 临时移动视口：首页、归档、分类、关于、友链、文章页均无横向溢出；文章页长代码片段导致的 443px 内容撑宽已通过外层 `min-w-0 w-full` 修复。
- 交互验收：搜索对话框打开 / Escape 关闭、主题明暗切换、移动端导航抽屉打开 / 关闭均通过；浏览器控制台无应用错误。

### 最终生产 payload 记录

以下为 2026-08-03 生产域名实测；`HTML` 为 UTF-8 字节数，`gzip` 为本地 GZip 重算值，`$tsr` 为 stream barrier 脚本正文 UTF-8 字节数。

| 路由          |     HTML |     gzip | `$tsr` hydration |
| ------------- | -------: | -------: | ---------------: |
| `/`           | 48,497 B |  8,899 B |          7,609 B |
| `/archive`    | 27,196 B |  6,187 B |          3,068 B |
| `/categories` | 46,896 B | 11,906 B |         16,923 B |
| `/about`      | 17,145 B |  5,445 B |          2,149 B |
| 文章页        | 61,897 B | 13,441 B |         21,983 B |

P3 阶段此前记录的首页 hydration 口径为 `1,042,677 → 875,846` 字符（-16%）；本次补充记录了最终生产 `$tsr`、完整 HTML 与压缩后的可复测值，作为后续回归基线。

### 树莓派运行快照

- 已运行 33 天 17 小时；load average `3.04 / 3.33 / 3.63`。
- 内存 `15 GiB`，已用 `5.9 GiB`，可用 `9.9 GiB`；交换区已用 `384 MiB`。
- 根盘 `1.8 TiB`，已用 `58%`，可用 `734 GiB`。
- `timeamber-app`、`timeamber-worker`、Supabase 相关容器均在运行；当前没有名称匹配 `nextcloud` 的容器。

## 仍然待办

1. **T38 仍需管理员会话**：本轮已完成未登录跳转与登录表单浏览器验收；需要真实管理员会话才能进入后台并验证备份、设置、媒体、GitHub 等页面。
2. **T37 已重新完成迁移**：活动应用源文件中的 45 处
   `createServerFn().inputValidator()` 已统一迁移为官方当前写法
   `createServerFn().validator()`；历史 `.bak-*` 快照不参与构建与 lint，保留原样以便追溯。
3. **既有 lint warning**：ESLint 为 0 errors、11 warnings，均为 Fast Refresh 导出规则与备份页既有 hook 依赖提示；未扩大本轮范围。
