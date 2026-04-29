<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://i.see.you/2026/04/28/o9fC/TimeAmberPNG-Dark.png">
  <img src="https://i.see.you/2026/04/28/jN4b/TimeAmberPNG.png" width="96" height="96" alt="TimeAmber" />
</picture>

# TimeAmber

**高质感无服务器边缘博客系统**

*极致视觉 · 边缘计算 · 多后端存储 · 零运维成本*

<br/>

[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Hono](https://img.shields.io/badge/Hono-E36002?style=flat-square&logo=hono&logoColor=white)](https://hono.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

<br/>

[**📚 文档**](https://github.com/NextCandy/TimeAmber/wiki) · [**☁️ 在线预览**](https://timeamber.com) · [**🐛 反馈**](https://github.com/NextCandy/TimeAmber/issues) · [**🛡️ 安全**](./SECURITY.md) · [**🔒 隐私**](./PRIVACY.md)

</div>

---

## ✨ 简介

**TimeAmber** 是一套运行在 Cloudflare 全球边缘网络上的现代化博客系统，前后端通过适配器模式解耦，零运维即可获得全球 < 50ms 的访问延迟。

设计哲学：**内容优先 · 边缘原生 · 沉浸式阅读**。

---

## 🌟 核心特性

### ✍️ 创作体验
- **沉浸式编辑器** — Markdown + 实时预览，KaTeX 数学公式，代码高亮一键复制
- **多平台导入** — 一键迁移 WordPress / Ghost / Hexo / Hugo / Jekyll / Halo，支持后台批量导入 Markdown
- **AI 辅助编辑** — 后台可配置 DeepSeek / Gemini / OpenAI Compatible，在文章编辑页查看并应用 AI 修改结果
- **内容编排** — 草稿、定时发布、置顶、系列合集、独立页动态导航
- **友链管理** — 前台独立友链页，后台可维护名称、地址与 Logo

### 🎨 阅读体验
- **暗/亮双主题** — OKLCH 色值系统，过渡顺滑无闪烁
- **主题化品牌图** — Logo / favicon / README 图标支持亮色与暗色模式分别展示
- **稳定文章列表** — 文章卡片固定行高，封面图不会撑破列表布局
- **文章导航** — 自动 TOC、阅读进度条、IntersectionObserver 章节追踪
- **⌘K 全站搜索** — 防抖检索、键盘导航、关键词高亮
- **Reaction 表情** — 文末轻互动，无需登录即可表态

### ⚡ 性能架构
- **边缘原生** — Hono + Cloudflare Workers，无冷启动，全球 < 50ms
- **存储适配** — 数据库 D1 / Turso / PostgreSQL，对象存储 R2 / S3 兼容
- **零运维成本** — 单脚本一键部署，前后端走同一条流水线
- **访客分析** — 内置 D1 `visits` 表轻量统计；**Cloudflare 部署专属**额外解锁 Analytics Engine 增强仪表板（UV/停留时长/浏览器/操作系统/分辨率/语言），其他后端 (Turso / PostgreSQL) 仅基础统计可用

### 🛡️ 安全合规
- **认证与防护** — JWT + 限流，CSP/HSTS 全套头，SSRF 拦截
- **隐私优先** — Cookie 同意横幅，第三方脚本门控，GDPR 数据导出
- **多端备份** — JSON / R2-S3 / WebDAV 自由切换；生产建议优先使用 R2、本地下载或自建 Nextcloud / Synology
- **外链图片托管** — 保存文章或批量导入 Markdown 时，可自动将外部图片上传到 S.EE，并用 `https://i.see.you/...` 直连覆盖正文链接
- **Notion 自动同步** — Cloudflare Worker 可每 10 分钟从指定 Notion 数据库同步文章，首次进入草稿，Notion 更新会同步覆盖站内文章内容，后台发布状态不被覆盖；站内删除的 Notion 文章不会再次创建

### 🤖 智能扩展
- **MCP 工具链** — 配套 [TimeAmber-MCP](https://github.com/NextCandy/TimeAmber-MCP)，让 AI 助手代为写稿、审评、备份
- **SEO 友好** — sitemap、RSS 2.0、JSON-LD、OG/Twitter Card
- **数据洞察** — 浏览量、14 日趋势、热门 Top 10

---

## 🧭 当前项目状态

本仓库当前维护的是 **TimeAmber** 线上站点：[timeamber.com](https://timeamber.com)。旧项目名、旧 Pages 域名和前后台可见的原始项目标识已迁移为 TimeAmber。

### 最近变动记录

- 品牌资源：亮色 Logo 使用 `https://i.see.you/2026/04/28/jN4b/TimeAmberPNG.png`，暗色 Logo 使用 `https://i.see.you/2026/04/28/o9fC/TimeAmberPNG-Dark.png`，README 顶部已使用 `<picture>` 自动切换。
- 默认文章封面：保持空白；没有正文首图时不再自动填入默认配图。
- 文章列表：文章卡片高度固定，封面图被限制在卡片行高内，避免列表跳动。
- 文章正文：发布页内的长链接、原文地址、引用块和表格单元格必须在内容栏内自动换行，不能横向溢出或覆盖右侧目录。
- Markdown 导入：后台支持批量导入 Markdown；导入后默认草稿，可在列表批量发布，也可进入单篇编辑页单独发布。
- 友链：导航栏新增 `/friends` 友链入口，后台 `站点设置 -> 友链` 可自定义名称、地址与 Logo。
- S.EE 图床：后台 `站点设置 -> 图片托管` 可开启自动上传外部图片；已托管的 `i.see.you` / `s.ee` 链接会跳过，S.EE 返回的直连会原样写入文章。
- Notion 同步：后台 `站点设置 -> Notion 同步` 可查看最近同步状态并手动触发；剪藏库默认只读取 `标题`、`摘要`、`原文地址`、`发布日期` 等属性生成草稿，不拉取页面正文块，以避免 Cloudflare Worker 单次 subrequests 超限；文章 slug 固定为 `notion-{pageId}`。站内删除 `notion-*` 文章后会记录删除标记，Notion 中仍存在也不会再次创建；若文章仍存在，Notion 更新会继续同步到站内。
- AI 编辑：后台 `站点设置 -> AI 编辑` 可配置 DeepSeek、Gemini 或 OpenAI Compatible API Key；文章编辑页可预览 AI 修改内容后再应用。
- 访客分析：Cloudflare Analytics Engine 增强分析已接入，依赖 `CLOUDFLARE_ACCOUNT_ID` 与具备 `Account Analytics:Read` 权限的 `CLOUDFLARE_API_TOKEN`。
- SEO 域名：sitemap、robots、RSS 与前后台 SEO 面板使用 `https://timeamber.com`。

### Cloudflare 资源说明

- 生产 Pages 项目：`timeamber-client`
- 生产 Worker：`timeamber-server`
- 现有 D1 / R2 内部资源名可能仍保留 `monolith-*`，这是内部绑定名，不影响前台 SEO 或公开品牌；如需改名需迁移数据和存储对象。
- GitHub Actions `Cloudflare Deploy` 已完成生产验证，会在推送 `main` 后自动部署并清理 SEO 缓存。
- Notion 同步需要 GitHub/Worker secret `NOTION_TOKEN`，并要求 Notion 数据库已分享给对应 Integration；默认 data source ID 为 `22837041-b78c-81d8-9670-000b9d50c21b`，也可在后台设置中覆盖。

---

## 🏗️ 架构

```
                        ┌──────────────────────────────────────────┐
                        │            Cloudflare Edge               │
                        │       (200+ PoPs · global anycast)       │
                        └──────────────────────────────────────────┘
                                          │
        ┌─────────────────────────────────┼─────────────────────────────────┐
        ▼                                 ▼                                 ▼
┌──────────────────┐            ┌──────────────────┐            ┌──────────────────┐
│  Cloudflare      │            │  Cloudflare      │            │  Cloudflare R2   │
│  Pages           │            │  Workers         │            │  (or S3 兼容)    │
│                  │            │                  │            │                  │
│  React SPA       │            │  Hono Router     │            │  上传 / 媒体库    │
│  ├ 阅读端        │  /api/*    │  ├ Public  API   │            │  ├ 文章封面      │
│  ├ ⌘K 搜索       │ ─────────▶ │  ├ Admin   API   │ ─对象存储─▶ │  ├ Markdown 图片 │
│  ├ TOC / 阅读条  │  反向代理  │  ├ Auth (JWT)    │            │  └ 备份归档      │
│  └ 后台 App Shell│            │  └ Importers     │            └──────────────────┘
│                  │            │                  │                      ▲
│  Pages Functions │            │  Storage Factory │                      │
│  ├ /api/*  转发  │            │  ├ IDatabase     │                      │
│  ├ /cdn/*  代理  │            │  │  ├ D1         │                      │
│  └ /rss.xml      │            │  │  ├ Turso      │                      │
└──────────────────┘            │  │  └ Postgres   │ ◀── 参数化 SQL ─┐    │
                                │  └ IObjectStorage│                 │    │
                                │     ├ R2         │ ─────────────────┘    │
                                │     └ S3 兼容    │                       │
                                └──────────────────┘                       │
                                          ▲                                │
                                          │ MCP Protocol                   │
                                          │                                │
                                ┌──────────────────┐                       │
                                │  TimeAmber-MCP    │                       │
                                │  (AI 助手通道)    │                       │
                                │  ├ 写稿 / 审评    │ ──────────────────────┘
                                │  ├ 备份 / 恢复    │   (写入媒体库)
                                │  └ 数据洞察       │
                                └──────────────────┘
```

**分层职责**

| 层级 | 模块 | 关键路径 |
|------|------|---------|
| 边缘网络 | Cloudflare 全球 anycast | 200+ PoPs · 自动 TLS · DDoS 防护 |
| 前端 | React SPA + Pages Functions | `client/src` · `client/functions` |
| 后端 | Hono Workers + Storage Factory | `server/src/index.ts` · `server/src/storage` |
| 持久层 | D1 / Turso / PostgreSQL · R2 / S3 | `server/src/storage/db` · `server/src/storage/object` |
| 智能层 | TimeAmber-MCP（独立仓库） | [NextCandy/TimeAmber-MCP](https://github.com/NextCandy/TimeAmber-MCP) |

**关键设计决策**

- **适配器模式** — 数据库与对象存储均实现统一接口（`IDatabase` / `IObjectStorage`），切换后端零侵入
- **Pages Functions 反向代理** — 前端域名直连 `/api/*`，规避 CORS 复杂度，同步注入安全头
- **Drizzle ORM** — 所有 SQL 参数化，Schema 一处定义、三端同步生成
- **Monorepo 单脚本部署** — `npm run deploy:cloudflare` 串起迁移 → Workers → Pages 全链路

> 详细架构、模块图与设计决策请参阅 [**Wiki · 架构概览**](https://github.com/NextCandy/TimeAmber/wiki/Architecture)。

---

## 🚀 快速开始

```bash
git clone https://github.com/NextCandy/TimeAmber.git && cd TimeAmber
npm install
npm run dev
```

> 完整环境准备、密钥配置与本地数据库初始化请参阅 [**Wiki · 快速开始**](https://github.com/NextCandy/TimeAmber/wiki/Quick-Start)。

## ☁️ 部署

```bash
npx wrangler login          # 首次部署一次即可
npm run deploy:cloudflare   # 远程迁移 → Workers → API_BASE 注入 → Pages
```

支持 Windows / macOS / Linux 三端，脚本启动会自动预检 wrangler 登录态、Token、账户 ID 与 Node 版本。

> 完整部署指南（含 Cloudflare 资源准备、密钥生成、CI 部署、故障排查）请参阅 [**Wiki · 部署指南**](https://github.com/NextCandy/TimeAmber/wiki/Deployment)。

| 方案 | 状态 | 适用场景 |
|------|------|---------|
| 本机 CLI `npm run deploy:cloudflare` | ✅ 生产验证 | 推荐首选 |
| GitHub Actions `Cloudflare Deploy` | ✅ 生产验证 | CI/CD 集成，推送 `main` 后自动部署 |

---

## 📚 文档导航

| 入口 | 内容 |
|------|------|
| [Wiki · 部署指南](https://github.com/NextCandy/TimeAmber/wiki/Deployment) | Cloudflare 部署完整指南（速通 + 进阶 + 排错） |
| [Wiki](https://github.com/NextCandy/TimeAmber/wiki) | 架构、API、二次开发 |
| [SECURITY.md](./SECURITY.md) | 安全策略与漏洞披露 |
| [PRIVACY.md](./PRIVACY.md) | 隐私政策 |
| [LICENSE](./LICENSE) | MIT 开源协议 |

---

## 🤝 贡献

欢迎通过 [Issue](https://github.com/NextCandy/TimeAmber/issues) 反馈问题，或通过 Pull Request 贡献代码。提交前请阅读 [Wiki · 贡献指南](https://github.com/NextCandy/TimeAmber/wiki/Contributing)。

## 📄 License

基于 [MIT License](./LICENSE) 开源发布。

<div align="center">

<sub>Crafted with ♡ on the edge.</sub>

</div>
