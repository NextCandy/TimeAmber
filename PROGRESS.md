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

| 任务 | 内容                                             | 状态          |
| ---- | ------------------------------------------------ | ------------- |
| T21  | 全局动效 token 化，移除路由整页过渡              | ✅ 2026-08-03 |
| T22  | 按压反馈与统一 focus-visible 环                  | ✅ 2026-08-03 |
| T23  | 暗色模式噪点、琥珀光晕与主题切换质感             | ✅ 2026-08-03 |
| T24  | 文章卡片 hover 提升                              | ✅ 2026-08-03 |
| T25  | 首页、归档、友链间距审计                         | ✅ 2026-08-03 |
| T26  | 空状态、无结果与骨架屏统一                       | ✅ 2026-08-03 |
| T27  | 主题切换图标 morph                               | ✅ 2026-08-03 |
| T28  | 搜索对话框开合与遮罩动效                         | ✅ 2026-08-03 |
| T29  | 回到顶部与阅读进度条动效                         | ✅ 2026-08-03 |
| T30  | 移动端抽屉节奏与退出对称                         | ✅ 2026-08-03 |
| T31  | Toast 进入/退出与语义图标                        | ⏳ 待做       |
| T32  | 首屏文章列表 stagger                             | ⏳ 待做       |
| T33  | 罕见场景 delight 预算                            | ⏳ 待做       |
| T34  | hydration payload 与后台重复请求治理             | ⏳ 待核验     |
| T35  | robots.txt 指向 sitemap                          | ⏳ 待做       |
| T36  | eslint 构建上下文清理                            | ✅ 2026-08-03 |
| T37  | createServerFn 校验 API 与当前 TanStack 版本统一 | ✅ 2026-08-03 |
| T38  | 后台登录后浏览器实测                             | ⏳ 待做       |

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

## 仍然待办

1. **T34 已完成代码治理，仍需用最终生产构建复测 payload**：root loader 只传公共 chrome，
   首页/归档各自加载文章，搜索走服务端索引；`AdminStoreProvider` 仅在后台同步完整状态。
2. **robots.txt 未指向 sitemap**：源站文件尚未补齐，生产 CDN 行为需随最终部署复测。
3. **构建上下文脏**：仓库根目录有多个 `*-backup-*/` 目录会被 `eslint .` 扫到，
   贡献了大部分既有 prettier 报错，建议加进 eslint ignore。
4. **T37 已完成**：当前锁定版本的两个旧 `.validator()` 调用已统一为
   `createServerFn().inputValidator()`，全仓其余调用已是当前 API。
5. **`/admin` 未做浏览器实测**：后台需要登录，本轮只做了类型与构建验证。
