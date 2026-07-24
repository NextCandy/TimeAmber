## 背景与边界

原仓库 `NextCandy/TimeAmber` 是：
- **前端**：React 19 SPA + Vite + Tailwind v4 + shadcn/ui + `wouter` 路由
- **后端**：Hono + Drizzle ORM + PostgreSQL 16，Docker 部署在树莓派（不是群晖，README 里没有群晖配置）
- **内容**：所有文章/剪藏存在 Postgres 里；`/cdn/vsdo-html/{id}/index.html` 是反代到同机 `vs.do` 服务的原始 HTML 快照
- **当前样式**：`client/src/globals.css` 单文件 2464 行，深色用 OKLCH `hue 220`，字体 Space Grotesk + Work Sans

**这版要做什么**：在当前 Lovable 项目（TanStack Start + Tailwind v4，已经预装 shadcn）里重建一套**前端展示层**，包含首页、归档、关于、友链、文章详情，使用**示例数据**做演示。完成后你可以把 `globals.css` 的 token、`src/components/*` 和各页面组件**直接复制粘贴**回原仓库的 `client/src/`（两边都是 React 19 + Tailwind v4 + shadcn，迁移成本低）。

**这版不做什么**：
- 不重建 Hono 后端 / Postgres / 管理后台（admin、editor、settings 等 50KB+ 大文件不在重做范围）
- 不接入你真实的 1853 篇文章数据（用示例数据演示视觉）
- 不动你的 Docker / 部署配置
- 不会用你给的后台密码 **— 请尽快改掉**

---

## 视觉方向（深色琥珀，更精致）

保留 TimeAmber 的核心识别：深背景 + 琥珀橙强调色 + 简洁中文字号层级。改进点：

- **配色**：深背景从纯黑→暖色深栗 `oklch(0.16 0.012 50)`，琥珀色统一到 `oklch(0.74 0.16 60)`，加一档微妙的「光晕色」用于 hover 和卡片描边渐变。整套用 OKLCH 在 `src/styles.css` 的 `@theme inline` 里定义。
- **字体**：英文标题 Space Grotesk（保留原项目选择），正文 Inter，中文走 system-ui 回退 `PingFang SC / 苹方 / 思源黑体`。用 `<link>` 加载，遵循 Tailwind v4 规范（不用 CSS @import）。
- **Hero**：保留原站「居中大 T logo + TimeAmber 标题 + 时光琥珀副标 + 一句话」的结构，加微弱的径向光晕和首屏 fade-in。
- **文章卡片**：原版每张卡左边一个大色块汉字首字（"A"、"用"、"免"…），保留这个特色但改用：渐变底色（按 hash 取色）+ 半透明 grain 纹理 + 右侧元信息与标题层级更清晰；hover 时整张卡有 1px 琥珀色描边和轻微上移。
- **右侧栏**：作者卡、标签云、分类列表 — 重新设计成更轻量的「卡片堆」，去掉多余分隔线，标签用胶囊样式，hover 反相。
- **导航**：保留顶部 首页 / 归档 / 关于 / 友链 + 搜索 + 主题切换图标。改进：滚动后导航栏加 backdrop-blur 玻璃效果。
- **细节**：圆角统一 `0.625rem`，所有交互元素 150ms cubic-bezier 过渡，cookie 提示条改成右下角更优雅的小卡片。

不引入花哨的 3D / 视差 / Three.js — 风格定位是「克制的高级感」（Linear / Vercel 博客的密度感）。

---

## 路由结构（对齐原仓库）

```text
src/routes/
  __root.tsx        # 已有 — 加全局字体 link、Navbar、Footer、主题切换
  index.tsx         # 首页：Hero + 文章列表 + 右侧栏
  archive.tsx       # 归档：按年/月分组的时间线
  about.tsx         # 关于
  friends.tsx       # 友链
  posts.$slug.tsx   # 文章详情：Markdown 正文 + TOC + 阅读控制
```

每个路由各自的 `head()` meta（title / description / og:title / og:description）按 SEO 最佳实践写齐。

---

## 组件清单

```text
src/components/
  layout/
    Navbar.tsx         # 顶部导航 + 搜索按钮 + 主题切换
    Footer.tsx         # 版权 + 备案占位 + RSS
    ThemeToggle.tsx    # localStorage 持久化的明/暗切换
  home/
    Hero.tsx           # 大 logo + 标题 + 副标
    PostList.tsx       # 卡片列表 + 分页
    PostCard.tsx       # 单卡：渐变首字色块 + 标题 + 摘要 + 元信息
    Sidebar.tsx        # 作者卡 + 标签云 + 分类
  post/
    PostHeader.tsx
    TableOfContents.tsx
    ReadingControls.tsx  # 字号 / 行距（轻量版，不接 API）
  ui/                  # 已有的 shadcn 组件直接复用
```

示例数据放在 `src/lib/sample-posts.ts`，结构对齐原仓库 `posts` 表字段（slug/title/excerpt/category/publishAt/coverImage），方便你之后替换为真实 API 调用。

---

## 设计 Token（写入 `src/styles.css`）

```text
:root (dark, 默认)
  --background: oklch(0.16 0.012 50)
  --foreground: oklch(0.96 0.005 80)
  --card:       oklch(0.20 0.014 50)
  --muted:      oklch(0.24 0.012 50)
  --border:     oklch(0.28 0.014 50)
  --primary:    oklch(0.74 0.16 60)   /* amber */
  --primary-glow: oklch(0.82 0.18 70) /* 用于光晕渐变 */
  --accent:     oklch(0.68 0.14 45)
  --radius:     0.625rem

.light
  --background: oklch(0.985 0.003 80)
  --foreground: oklch(0.20 0.014 50)
  /* 对应反相 */
```

---

## 技术细节

- **TanStack Start 注意点**：所有页面是文件路由；`createFileRoute("/posts/$slug")` 字符串必须和文件名匹配；导航用 `<Link to params>` 而不是 `<a href>`。
- **字体加载**：在 `__root.tsx` 的 `head().links` 里加 Google Fonts `<link>`，**不在 CSS 里 `@import`**（Tailwind v4 + Lightning CSS 会报错）。
- **主题切换**：root 上加 `class="dark"` 时走深色，去掉时走浅色。已有的 `@custom-variant dark (&:is(.dark *))` 直接复用。默认深色。
- **当前模板的占位 index.tsx**：会被完全替换为真实首页。
- **示例数据规模**：12–15 篇假文章（涵盖 剪藏 / VS.DO / NAS 笔记 / 流年的Agent 等原站分类），让首页、归档、详情都能演示。

---

## 交付步骤（按这个顺序实施）

1. 在 `src/styles.css` 写入新的 OKLCH token 集 + Space Grotesk/Inter 字体声明
2. `__root.tsx` 加字体 link、Navbar、Footer、主题切换、QueryClientProvider 已有
3. 建 `src/lib/sample-posts.ts` 示例数据 + 工具函数（按首字取渐变色、分组归档）
4. 建首页组件（Hero / PostList / PostCard / Sidebar），替换 `index.tsx`
5. 加 `archive.tsx`、`about.tsx`、`friends.tsx`、`posts.$slug.tsx` 路由
6. 每个路由配 head meta、errorComponent、notFoundComponent
7. 浏览器预览跑一遍，截屏对比，调细节

---

## 完成后你能做什么

- 直接在 Lovable 预览里看到新视觉效果
- 把 `src/styles.css` 的 `:root` 部分整段复制到原仓库 `client/src/globals.css`
- 把 `src/components/home/*.tsx` 复制到原仓库 `client/src/components/`，把里面的 `<Link>` 从 TanStack Router 换成 `wouter` 的 `<Link>`（接口几乎一致），数据来源从 `sample-posts.ts` 换成 `api.ts` 里的 `fetchPosts()` 调用
- 旁边可以挂 PR 让 Lovable / 你 review，再 push 到 GitHub，群晖那边 docker compose pull && up 就更新了

---

确认这个方案就开干。如果你希望我**先生成 3 个不同的视觉方向预览**让你挑（而不是直接按上述描述实现），告诉我，我改流程。