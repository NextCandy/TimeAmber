import { formatChineseDate } from "@/lib/date";

export type PostStatus = "draft" | "published";
export type PostType = "markdown" | "html";
export type OpenIn = "_blank" | "_self";

export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
  publishAt: string; // ISO date
  readingMinutes: number;
  source?: string; // original URL for clippings
  content?: string; // markdown
  status?: PostStatus; // defaults to "published" for legacy rows
  cover?: string; // data URL or absolute URL; falls back to logo gradient when missing
  type?: PostType; // "html" posts open externalUrl directly
  externalUrl?: string; // required when type === "html"
  openIn?: OpenIn; // for html posts; defaults to "_blank"
  notionId?: string; // source-of-truth ID for incremental Notion sync
  notionLastEdited?: string; // ISO from Notion last_edited_time
};

export const CATEGORIES = [
  { name: "剪藏", count: 671 },
  { name: "VS.DO 剪藏", count: 597 },
  { name: "松果先森", count: 274 },
  { name: "NAS 笔记", count: 168 },
  { name: "流年的 Agent", count: 143 },
] as const;

export const TAGS = [
  "剪藏",
  "VS.DO",
  "松果先森",
  "github",
  "淘金",
  "流年的Agent",
  "进阶技术客栈",
  "谢同学的NAS笔记",
] as const;

export const FRIENDS = [
  { name: "VS.DO", url: "https://vs.do", desc: "网页剪藏，永久保存" },
  { name: "松果先森", url: "https://example.com/pine", desc: "独立开发者博客" },
  { name: "进阶技术客栈", url: "https://example.com/inn", desc: "工程师成长笔记" },
  { name: "谢同学的 NAS 笔记", url: "https://example.com/nas", desc: "家庭服务器与自建服务" },
  { name: "流年的 Agent", url: "https://example.com/agent", desc: "AI Agent 工程实践" },
  { name: "Lovable", url: "https://lovable.dev", desc: "用对话搭网站" },
];

export const POSTS: Post[] = [
  {
    slug: "ai-vpn-5min",
    title: "AI 全自动搭建 VPN：0 基础小白仅需五分钟",
    excerpt:
      "用一段 Prompt 让 Claude 帮你从买 VPS 到部署 Sing-Box 全程托管，文末附带可直接复用的脚本模板与排错指南。",
    category: "VS.DO 剪藏",
    tags: ["剪藏", "VS.DO"],
    publishAt: "2026-06-10",
    readingMinutes: 6,
    source: "https://x.com/lance012210/article/2063495440796877120",
    status: "published",
    type: "markdown",
  },
  {
    slug: "vps-ladder-tutorial",
    title: "用 VPS 自建梯子教程（超详细，小白也能看）",
    excerpt:
      "从选机房、买域名、签 TLS 证书到 Reality + Hysteria2 双协议落地，全套截图和命令，照抄即用。",
    category: "VS.DO 剪藏",
    tags: ["剪藏", "VS.DO"],
    publishAt: "2026-06-10",
    readingMinutes: 12,
    source: "https://x.com/naiyue777/article/2063317041952510368",
    status: "published",
    type: "markdown",
  },
  {
    slug: "free-gemma4",
    title: "免费无限使用 Gemma 4",
    excerpt:
      "Google AI Studio 最近静默开放了 Gemma 4 的免费额度，本文整理 API Key 申请、速率、以及在 Cherry Studio 里的对接方法。",
    category: "VS.DO 剪藏",
    tags: ["剪藏", "VS.DO"],
    publishAt: "2026-06-10",
    readingMinutes: 4,
    status: "published",
    type: "markdown",
  },
  {
    slug: "delete-digital-footprint",
    title: "删除你在网络上 99.8% 的数字足迹",
    excerpt:
      "GDPR、CCPA 时代的隐私清理清单：从 Google 历史、社媒授权、数据经纪商到 Have I Been Pwned 的全流程操作。",
    category: "剪藏",
    tags: ["剪藏", "进阶技术客栈"],
    publishAt: "2026-06-10",
    readingMinutes: 9,
    status: "published",
    type: "markdown",
  },
  {
    slug: "residential-ip-tutorial",
    title: "搭建「纯净度 100%」的海外静态住宅 IP 保姆级教程",
    excerpt:
      "市面上动态住宅代理已经被广泛标记，本文示范如何用 Surfshark + 自建中转拿到长期干净的家庭 IP。",
    category: "剪藏",
    tags: ["剪藏", "VS.DO"],
    publishAt: "2026-06-10",
    readingMinutes: 11,
    status: "published",
    type: "markdown",
  },
  {
    slug: "claude-spreadsheet-60s",
    title: "现在使用 Claude，你可以在 60 秒内创建一张专业电子表格",
    excerpt:
      "Claude Skills 上线之后，电子表格是表现最稳定的能力之一，本文用三个真实需求演示对话式建表。",
    category: "VS.DO 剪藏",
    tags: ["剪藏", "VS.DO"],
    publishAt: "2026-06-10",
    readingMinutes: 5,
    status: "published",
    type: "markdown",
  },
  {
    slug: "synology-docker-best-practice",
    title: "群晖 Docker 最佳实践：从目录规划到自动备份",
    excerpt:
      "DS923+ 一年的踩坑总结，包含 Container Manager、Watchtower、自动快照与外部 Postgres 的协同方案。",
    category: "NAS 笔记",
    tags: ["谢同学的NAS笔记", "github"],
    publishAt: "2026-05-28",
    readingMinutes: 14,
    status: "published",
    type: "markdown",
  },
  {
    slug: "agent-tools-2026",
    title: "流年的 Agent · 2026 上半年工具清单",
    excerpt:
      "本季度淘汰了 6 个工具、保留了 4 个、新增了 3 个，分享我对 Agent 工具选型的心智模型与避坑要点。",
    category: "流年的 Agent",
    tags: ["流年的Agent", "进阶技术客栈"],
    publishAt: "2026-05-21",
    readingMinutes: 8,
    status: "published",
    type: "markdown",
  },
  {
    slug: "pinecone-vs-pgvector",
    title: "松果先森：Pinecone 与 pgvector 的真实成本对比",
    excerpt:
      "把同一份 200 万条向量同时部署到 Pinecone 与 Supabase pgvector，记录 30 天的延迟、成本与运维体验。",
    category: "松果先森",
    tags: ["松果先森", "github"],
    publishAt: "2026-05-12",
    readingMinutes: 10,
    status: "published",
    type: "markdown",
  },
  {
    slug: "github-actions-cache-trick",
    title: "GitHub Actions 缓存的一个反直觉技巧",
    excerpt:
      "为什么 actions/cache 在 monorepo 里总是 miss？答案藏在 key 的拼接顺序里，附可直接复用的 workflow 模板。",
    category: "剪藏",
    tags: ["github", "进阶技术客栈"],
    publishAt: "2026-04-30",
    readingMinutes: 7,
    status: "published",
    type: "markdown",
  },
  {
    slug: "nas-photo-pipeline",
    title: "NAS 上构建一条「拍完即归档」的照片流水线",
    excerpt:
      "Immich + rclone + 自建 OCR，让手机一关 WiFi 就把照片整理好元数据，存进按年月命名的目录。",
    category: "NAS 笔记",
    tags: ["谢同学的NAS笔记", "剪藏"],
    publishAt: "2026-04-22",
    readingMinutes: 9,
    status: "published",
    type: "markdown",
  },
  {
    slug: "amber-design-notes",
    title: "时光琥珀：关于这个站的视觉笔记",
    excerpt:
      "为什么主色定在 oklch(0.78 0.16 65)，为什么放弃了纯黑背景，记录一次为内容服务的克制设计。",
    category: "松果先森",
    tags: ["松果先森"],
    publishAt: "2026-04-10",
    readingMinutes: 6,
    status: "published",
    type: "markdown",
    content: `# 时光琥珀

> 时光成珀，字字如初。

这是一个克制的深色博客。所有视觉决定都围绕**「让文字最舒服」**展开。

## 为什么是琥珀色

琥珀是树脂在时间里固化的产物 —— 这正好对应了写作把瞬间封存下来的感受。

- 主色 \`oklch(0.78 0.16 65)\` 在深色背景上有充足的对比度
- 副色 \`oklch(0.85 0.18 70)\` 用于 hover 与渐变光晕
- 不再使用纯黑 \`#000\`，背景统一改为偏暖的深栗 \`oklch(0.16 0.012 50)\`

## 字体

英文走 Space Grotesk + Inter，中文回退到 PingFang SC / 思源黑体。
正文字号 17px，行高 1.75 —— 长文阅读时眼睛不累。

## 不做的事

- 没有视差滚动
- 没有粒子背景
- 没有自动播放的动画
- 没有「订阅我的 newsletter」弹窗

写得好的内容自己会说话。`,
  },
];

export function postsByYear(posts: Post[]) {
  const map = new Map<string, Post[]>();
  for (const p of posts) {
    const year = p.publishAt.slice(0, 4);
    if (!map.has(year)) map.set(year, []);
    map.get(year)!.push(p);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([year, list]) => ({
      year,
      posts: list.sort((a, b) => (a.publishAt < b.publishAt ? 1 : -1)),
    }));
}

export function gradientFor(seed: string): { from: string; to: string } {
  const code = seed.codePointAt(0) ?? 65;
  const hueOffset = (code % 60) - 30;
  const from = `oklch(0.58 0.16 ${55 + hueOffset})`;
  const to = `oklch(0.38 0.12 ${30 + hueOffset})`;
  return { from, to };
}

export function firstChar(title: string) {
  return Array.from(title)[0] ?? "·";
}

export function formatDate(iso: string) {
  return formatChineseDate(iso);
}

export function isPublished(p: Post) {
  return (p.status ?? "published") === "published";
}
