# TimeAmber

TimeAmber 是部署在群晖 NAS 上的个人博客、剪藏归档和内容管理系统。项目使用
TanStack Start 构建前后台，数据、认证和媒体由自托管 Supabase 提供，独立 worker
负责 Notion、web-archive（VS.DO）、备份和定时任务。

生产站点：[timeamber.com](https://timeamber.com)

## 功能

- 博客首页、文章、归档、分类、标签、友链和全文搜索
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
/volume1/docker/timeamber-next
```

应用容器与 Supabase 使用同一个 Compose 项目和网络。生产应用映射
`49287:3000`，Supabase API 只绑定本机地址，不应直接暴露到公网。

## 目录

```text
src/                         TanStack Start 前后台
server/                      Node 生产入口、静态资源和媒体代理
worker/                      Notion、web-archive、备份任务
supabase/migrations/         数据库结构、RLS 和 Storage 策略
deploy/supabase/             Supabase + TimeAmber Compose
public/brand/                Logo、favicon、PWA 图标和默认首图
public/fonts/                本地字体
Dockerfile                   Web 应用镜像
Dockerfile.worker            Worker 镜像
```

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

```bash
cd /volume1/docker/timeamber-next/deploy/supabase

docker compose \
  --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.timeamber.yml \
  build timeamber-app timeamber-worker

docker compose \
  --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.timeamber.yml \
  up -d --no-deps timeamber-app timeamber-worker
```

查看状态：

```bash
docker ps --filter name=timeamber
docker logs --tail 100 timeamber-app
docker logs --tail 100 timeamber-worker
curl -I http://127.0.0.1:49287/
```

两个生产容器都配置了健康检查和 `restart: unless-stopped`。

## 数据库初始化

首次部署时运行迁移：

```bash
docker compose \
  --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.timeamber.yml \
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
