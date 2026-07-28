<div align="center">

<img src="./public/brand/icon-512.png" width="96" height="96" alt="TimeAmber" />

# TimeAmber

**时光成珀，字字如初**

[![TanStack Start](https://img.shields.io/badge/TanStack_Start-v1-6d6ee8)](https://tanstack.com/start)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev)
[![Tailwind](https://img.shields.io/badge/Tailwind-v4-38bdf8)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-self--hosted-3ecf8e)](https://supabase.com)

</div>

TimeAmber 是部署在群晖 NAS 上的个人博客、剪藏归档和内容管理系统。项目使用
TanStack Start 构建前后台，数据、认证和媒体由自托管 Supabase 提供，独立 worker
负责 Notion、web-archive（VS.DO）、备份和定时任务。

生产站点：[timeamber.com](https://timeamber.com)

## 功能

- **首页**：顶栏（首页 / 归档 / 关于 / 友链居中，搜索、后台、主题切换为图标）→
  三列 4:3 封面文章网格 → 开放式主理人区 → 页脚，真实内容由服务端直出
- 文章、归档、分类、标签、友链页
- **服务端 Markdown 渲染**：GFM（表格、任务列表、脚注）+ Shiki 语法高亮 + rehype-sanitize，
  代码块外框与复制按钮由服务端直出，客户端只做事件委托与图片放大
- **⌘K / Ctrl+K 全站搜索**：一次命中文章、分类与标签
- **分类页** `/categories`：按文章数排序的分类卡片与标签云，支持 `?c=` / `?tag=` 筛选
- **归档按年折叠**，避免上千篇文章一次铺开
- **sitemap.xml 与 RSS**：sitemap 覆盖全部已发布文章（带 lastmod），RSS 输出最新 50 篇
- **SEO head**：canonical、Open Graph、Twitter Card、`article:published_time`，
  描述统一去除 Markdown 语法
- Supabase Auth 管理员登录与 HttpOnly 加密会话
- Markdown 文章和 HTML 跳转文章
- Notion 数据源增量导入与图片修复
- NAS web-archive / VS.DO 增量导入
- Supabase Storage 媒体库、同源媒体代理和上传
- 自动备份、保留策略、通知、运行诊断和审计记录
- PostgreSQL advisory lock，防止自动任务与手动任务并发写入
- 自定义品牌图、favicon、默认文章首图和本地字体

## 架构

```text
Internet
  |
  v
timeamber.com
  |
  v
timeamber-app :49287
  |-- TanStack Start SSR / Admin
  |-- /supabase/storage/... -> Supabase Kong
  |
  +--> timeamber-worker :3001
  |      |-- Notion sync
  |      |-- web-archive sync
  |      `-- backup jobs
  |
  `--> Supabase
         |-- PostgreSQL
         |-- Auth
         |-- PostgREST
         |-- Storage
         |-- Realtime
         |-- Studio
         `-- Kong
```

NAS 项目目录：

```text
/volume1/docker/timeamber
```

应用容器与 Supabase 使用同一个 Compose 项目和网络。生产应用映射
`49287:3000`，Supabase API 只绑定本机地址，不应直接暴露到公网。

## 目录

```text
src/                         TanStack Start 前后台
src/lib/markdown.server.ts   服务端 Markdown 管线（GFM + Shiki + sanitize + 代码块外框）
src/lib/home.functions.ts    首页取数（最新文章、封面 + 归档总数）
src/components/home/         首页区块：编辑式文章卡片、主理人区
src/lib/feeds.server.ts      sitemap.xml / rss.xml 生成
src/lib/strip-markdown.ts    meta description 与 RSS 共用的去语法工具
server/                      Node 生产入口、静态资源和媒体代理
worker/                      Notion、web-archive、备份任务
supabase/migrations/         数据库结构、RLS 和 Storage 策略
deploy/supabase/             Supabase + TimeAmber Compose
public/brand/                Logo、favicon、PWA 图标和默认首图
public/fonts/                本地字体
Dockerfile                   Web 应用镜像
Dockerfile.worker            Worker 镜像
```

## 视觉系统与主题

TimeAmber 使用 Tailwind CSS v4 的语义 token 统一控制前后台视觉。所有主题颜色都定义在
`src/styles.css` 的 `:root` 与 `.dark` 中，再通过 `@theme inline` 映射到
`bg-background`、`text-foreground`、`border-border` 等工具类。组件不保存独立主题色，
因此换色不会改变路由、内容、数据或交互逻辑。

### 主题切换

站点支持亮色、暗色和跟随系统三种偏好：

| 偏好     | 根元素状态             | 行为                                 |
| -------- | ---------------------- | ------------------------------------ |
| 亮色     | `<html class="light">` | 固定使用暖色纸张主题，也是默认偏好   |
| 暗色     | `<html class="dark">`  | 固定使用深色纸张主题                 |
| 跟随系统 | `.light` 或 `.dark`    | 根据 `prefers-color-scheme` 实时解析 |

偏好同时写入 `ta-theme` Cookie 和浏览器本地存储。首屏 bootstrap 脚本在样式表与 React
水合前设置 `.light`/`.dark`，避免主题闪烁；切换机制集中在 `src/lib/theme.ts` 与
`src/components/layout/ThemeToggle.tsx`，修改视觉 token 时不应改动它们。

### Editorial token

当前主题恢复上一版字体与暖色纸张背景，同时保留新版编辑网格和品红强调色：

| Token                  | 亮色                    | 暗色                   |
| ---------------------- | ----------------------- | ---------------------- |
| `--background`         | `oklch(0.962 0.006 95)` | `oklch(0.18 0.008 95)` |
| `--foreground`         | `oklch(0.18 0.008 95)`  | `oklch(0.94 0.006 95)` |
| `--card`               | `oklch(0.985 0.004 95)` | `oklch(0.23 0.008 95)` |
| `--primary` / `--ring` | `#ff00bc`               | `#ff00bc`              |
| `--border`             | 暖灰 16%                | 浅灰 17%               |
| `--input`              | 暖灰 28%                | 浅灰 30%               |
| `--muted-foreground`   | 中性暖灰                | 浅暖灰                 |

- 全局 `--radius: 0`，token 化的卡片、按钮、输入框、图片和代码块均为直角。
- 正文和标题恢复 Geist / Manrope 字体栈，并提供 Noto Sans CJK SC、思源黑体和系统中文字体回退；
  代码继续使用本地 `JetBrains Mono`。
- 正文标题使用 650 字重，h1/h2/h3 行高分别为 1.05、1.10、1.15。
- 品红只作为“墨水”使用：品牌标记、导航底线、链接、焦点环和缺图封面的细线；文章标题悬停和文字选区不再显示彩色条带。
- 标签胶囊、头像、状态点等明确使用 `rounded-full` 的元素仍保持圆形，不受 `--radius` 影响。

### 文章列表密度

首页文章卡片为无边框、无背景、无阴影的纵向结构：4:3 封面 → 完整中文日期 → 标题。
首页直接读取 `posts.cover_image`；真实封面按 4:3 裁切，没有自定义封面或仍使用默认封面时，
按标题稳定生成黑白编辑纹理与细品红线。首页一次加载最新 18 篇，移动端 1 列、平板 2 列、
桌面 3 列；标题最多两行，日期固定按上海时区输出，避免服务端与浏览器水合结果不一致。
早期 VS.DO 等剪藏若把站内 HTML 地址保存在 `timeamber-offline-html` 正文标记中，首页、归档和
文章直达页会兼容解析该标记并跳转到 `/cdn/.../index.html`，无需手工补齐旧记录的类型字段。

### 可访问性约束

正文始终保持高对比；`#ff00bc` 不承担长正文颜色，只用于较粗链接、底线和图标。普通控件
保留清晰焦点轮廓，文章卡片使用细中性灰焦点线，并尊重 `prefers-reduced-motion` 关闭非必要动效。

## 本地验证

要求 Node.js 22 和 npm。

```bash
npm ci
npm test
npx tsc --noEmit
npm run build
```

开发模式：

```bash
npm run dev
```

## 环境配置

复制示例文件后填写实际值，不要提交 `.env`。

```bash
cd deploy/supabase
cp .env.example .env
```

关键配置：

| 变量                         | 用途                                                                        |
| ---------------------------- | --------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`          | Supabase PostgreSQL 密码                                                    |
| `JWT_SECRET`                 | Supabase JWT 密钥                                                           |
| `ANON_KEY`                   | 浏览器和匿名 API 密钥                                                       |
| `SERVICE_ROLE_KEY`           | 服务端管理密钥                                                              |
| `SESSION_SECRET`             | TimeAmber HttpOnly 会话加密                                                 |
| `TIMEAMBER_SECRET_KEY`       | 第三方配置加密                                                              |
| `WORKER_SECRET`              | App 调用 worker 的内部鉴权                                                  |
| `SUPABASE_PUBLIC_URL`        | 公开 Supabase 基础地址                                                      |
| `LEGACY_MEDIA_PATH`          | NAS 历史媒体目录                                                            |
| `NOTION_TOKEN`               | Notion 集成令牌                                                             |
| `NOTION_DATA_SOURCE_ID`      | Notion 数据源 ID                                                            |
| `VS_DO_BASE_URL`             | web-archive 服务地址                                                        |
| `VS_DO_TOKEN`                | web-archive API 令牌                                                        |
| `AI_BASE_URL`                | OpenAI-compatible API 基础地址（可填写 `/v1` 或完整 Chat Completions 地址） |
| `AI_API_KEY`                 | Ask TimeAmber 服务端 API Key                                                |
| `AI_MODEL`                   | Ask TimeAmber 使用的模型名称                                                |
| `KNOWLEDGE_INDEX_BATCH_SIZE` | worker 每批补全 web-archive 知识索引的数量，默认 100                        |

`AI_API_KEY` 只注入 `timeamber-app` 的运行时环境，不是 Docker build arg，也不能使用
`VITE_` 前缀。未配置 AI Provider 时，Ask TimeAmber 会显示未配置状态，站点其他功能继续正常运行。

## Ask TimeAmber

Ask TimeAmber 位于管理员后台 `/admin/ask`，复用现有 Supabase Auth 与 HttpOnly 管理员会话。
它不会把私人正文写入客户端静态文件；浏览器只收到最终回答和有限的来源摘要。

### 前台开放（默认关闭）

前台 `/ask` 提供同一套问答能力，但**默认不对外**，开关在 `/admin/settings` 的「前台功能」区块
（`settings.askPublicEnabled`）。关闭时前台页面只显示「站内问答暂未开放」，导航里也不会出现入口。

开放后每次提问都会消耗所配置的 `AI_API_KEY`，因此内置了成本闸门：

- 全站维度限流：每分钟 6 次、每天 300 次（给成本一个硬上限）。
- 问题长度 2–1000 字。
- 检索与作答逻辑与后台版完全一致，没有足够资料时同样不会编造。

之所以是全站限流而不是按 IP：站点部署在反向代理/隧道之后，转发头可伪造，
与其做一个能被绕过的按 IP 限流，不如把全局闸门收紧。

检索层继续使用现有 PostgreSQL：

- `simple` Full Text Search 与 `pg_trgm` 混合排序，不引入额外向量数据库。
- `public.knowledge_documents` 开启 RLS，仅管理员可读取。
- 博客文章和 Notion 内容由 `posts` 触发器增量更新索引。
- web-archive 同步时从离线 HTML 提取可读正文并增量写入索引。
- `knowledge-index` worker 任务只补全缺失的历史归档，不会在每次启动时全量重建。

应用新 migration 后，可在 Ask TimeAmber 页面补全历史归档，或通过受 `WORKER_SECRET`
保护的 worker 入口运行 `knowledge-index` 任务。所有回答的 Sources 都来自实际检索结果；没有足够
资料时不会调用模型编造答案。

管理员密码通过 Supabase Auth 管理，不写入仓库或 Compose 文件。

## NAS 部署

生产目录为 `/volume1/docker/timeamber`。发布前先确认工作区没有会被覆盖的本地改动，
保存当前提交号，并备份源码与数据库。生产机如果通过 Git 管理源码，应使用
`git pull --ff-only` 更新已审核的发布分支；如果使用发布包，则只替换受版本控制的源码，
保留 `.env`、`deploy/supabase/.env`、媒体、备份和数据库卷。

发布前检查：

```bash
cd /volume1/docker/timeamber
git status --short
git rev-parse HEAD
```

纯 CSS、前端或服务端 Web 改动只需要重建 `timeamber-app`，不要重启 worker 或 Supabase：

```bash
cd /volume1/docker/timeamber

docker compose \
  --env-file .env \
  -f docker-compose.yml \
  build timeamber-app

docker compose \
  --env-file .env \
  -f docker-compose.yml \
  up -d --no-deps timeamber-app
```

当前生产容器的 Compose working directory 和 config file 分别是
`/volume1/docker/timeamber` 与根目录 `docker-compose.yml`；增量发布必须沿用这一项目，
避免创建第二套同名容器。`deploy/supabase/docker-compose*.yml` 是模块化的新环境部署模板，
不用于替换已运行的根 Compose 项目。

只有 `worker/`、`Dockerfile.worker` 或 worker 依赖发生变化时，才追加构建和更新
`timeamber-worker`。数据库 migration 必须使用下文独立的 tools profile，不能通过普通
Web 发布隐式执行。

查看状态：

```bash
docker ps --filter name=timeamber
docker inspect --format '{{.State.Health.Status}}' timeamber-app
docker logs --tail 100 timeamber-app
curl --fail --show-error --head http://127.0.0.1:49287/
curl --fail --show-error --head https://timeamber.com/
```

生产验收至少覆盖：首页和一篇文章、亮暗主题切换、移动端首屏、阅读字号控制、浏览器
console，以及静态资源是否来自新构建。容器状态必须为 `healthy`，公网与本机入口都应返回
2xx。两个生产容器都配置了健康检查和 `restart: unless-stopped`。

## 数据库初始化

首次部署时运行迁移：

```bash
cd /volume1/docker/timeamber

docker compose \
  --env-file .env \
  -f docker-compose.yml \
  --profile tools run --rm timeamber-migrate
```

迁移会创建文章、分类、标签、媒体、同步记录、配置、审计、通知和诊断表，
并启用 RLS。写入操作只允许管理员或 service role。

## 自动导入

生产 worker 使用 `SYNC_ENABLED=true`。

- Notion 增量同步：读取保存的 cursor，分批处理页面
- Notion repair：补写正文图片和缺失字段
- web-archive：按页读取 VS.DO，使用 `source + source_id` 去重
- 所有任务写入 `public.sync_runs`
- advisory lock 防止同一任务并发执行

后台可在“备份与同步”中查看状态并手动触发。命令行诊断：

```bash
docker exec supabase-db psql -U postgres -d postgres -c \
  "select * from public.sync_runs order by id desc limit 20;"
```

出现 `already running` 表示自动任务与手动任务重叠，锁已阻止重复写入；等待当前
任务结束后，下一周期会继续运行。

## 媒体库

媒体对象存放在 Supabase Storage 的 `media` bucket。数据库只保存站内相对地址：

```text
/supabase/storage/v1/object/public/media/<object-path>
```

应用服务器把该路径代理到内部 Supabase Kong，因此浏览器不依赖 NAS 的旧预览端口。
后台媒体库分离加载最近 500 条记录，缩略图使用懒加载、异步解码和
`content-visibility`，避免一次打开页面同时读取大量文件。

检查媒体数据：

```bash
docker exec supabase-db psql -U postgres -d postgres -c \
  "select count(*) from public.media_items;"
```

## 品牌资源

品牌文件位于 `public/brand/`：

- `timeamber-logo.png`：完整 Logo
- `timeamber-default-cover.png`：文章默认首图，1200x630
- `favicon.ico`、`favicon-16x16.png`、`favicon-32x32.png`
- `apple-touch-icon.png`
- `icon-192.png`、`icon-512.png`

本地字体位于 `public/fonts/`，由 `src/styles.css` 的 `@font-face` 引用，不依赖临时
或第三方资源地址。

## 备份与回滚

部署前建议备份源码和数据库：

```bash
tar --exclude=node_modules --exclude=dist --exclude=deploy/supabase/.env \
  -czf backups/source-$(date +%Y%m%d-%H%M%S).tar.gz .

docker exec supabase-db pg_dump -U postgres -d postgres -Fc \
  > backups/postgres-$(date +%Y%m%d-%H%M%S).dump
```

回滚应用时切换到上一镜像或恢复源码备份，再执行 Compose `up -d`。数据库回滚前
必须先停止 app 和 worker，避免恢复过程中继续写入。

## 排障

### 网站打开慢

```bash
uptime
ps -eo pid,ppid,stat,%cpu,%mem,etime,comm,args --sort=-%cpu | head
docker stats --no-stream
```

重点区分 CPU 负载与磁盘 I/O。不要直接杀死用途不明的群晖系统服务或计划任务。

### 媒体无法显示

确认 URL 以 `/supabase/` 开头，并检查：

```bash
curl -I \
  http://127.0.0.1:49287/supabase/storage/v1/object/public/media/<object-path>
```

### 自动导入失败

```bash
docker logs --tail 200 timeamber-worker
docker exec supabase-db psql -U postgres -d postgres -c \
  "select id, source_key, status, error from public.sync_runs order by id desc limit 20;"
```

### 登录失败

管理员账号在 `auth.users`，角色在 `public.profiles`。使用 Supabase Admin API 重置
密码，不要直接写明文或手工修改 `encrypted_password`。

## 安全

- `.env`、令牌、密码和数据库备份不得提交 Git
- service role 只用于服务端
- 管理会话使用 HttpOnly cookie
- 第三方配置使用 `TIMEAMBER_SECRET_KEY` 加密
- 公网只发布应用反向代理入口
- 定期检查容器健康、同步失败记录和备份可恢复性
