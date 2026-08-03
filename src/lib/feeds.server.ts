// sitemap.xml / rss.xml 的服务端生成。
//
// 走 src/server.ts 的 fetch 拦截而不是文件路由：这两个响应是 XML 而非 HTML，
// 且需要一次性吐全部 1921 篇，用页面路由绕不开 SSR 外壳。
// 通过 *.server.ts 命名约定与客户端 bundle 隔离（Vite 强制）。
import postgres from "postgres";

import { stripMarkdown } from "@/lib/strip-markdown";

type FeedPost = {
  slug: string;
  title: string;
  excerpt: string;
  publishAt: Date;
  cover?: string;
};

let database: ReturnType<typeof postgres> | undefined;

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  // 独立于 state.functions 的小连接池：feed 只在爬虫来访时命中，不需要 8 条连接。
  database ??= postgres(url, {
    max: 2,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return database;
}

// 爬虫可能高频回源，而文章表分钟级才变一次，缓存足够。
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; body: string }>();

function cached(key: string, build: () => Promise<string>): Promise<string> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.body);
  return build().then((body) => {
    cache.set(key, { at: Date.now(), body });
    return body;
  });
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function listPosts(limit?: number): Promise<FeedPost[]> {
  const sql = db();
  const rows = limit
    ? await sql`
        select slug, title, excerpt, cover_image, coalesce(publish_at, created_at) as published_at
        from public.posts
        where published = true and (publish_at is null or publish_at <= now())
        order by coalesce(publish_at, created_at) desc
        limit ${limit}
      `
    : await sql`
        select slug, title, excerpt, cover_image, coalesce(publish_at, created_at) as published_at
        from public.posts
        where published = true and (publish_at is null or publish_at <= now())
        order by coalesce(publish_at, created_at) desc
      `;
  return rows.map((row) => ({
    slug: String(row.slug),
    title: String(row.title ?? ""),
    excerpt: String(row.excerpt ?? ""),
    cover: row.cover_image ? String(row.cover_image) : undefined,
    publishAt:
      row.published_at instanceof Date ? row.published_at : new Date(String(row.published_at)),
  }));
}

const STATIC_PATHS: Array<{ path: string; priority: string; changefreq: string }> = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/archive", priority: "0.6", changefreq: "weekly" },
  { path: "/categories", priority: "0.6", changefreq: "weekly" },
  { path: "/ask", priority: "0.4", changefreq: "monthly" },
  { path: "/about", priority: "0.4", changefreq: "monthly" },
  { path: "/friends", priority: "0.3", changefreq: "monthly" },
];

export function buildSitemap(origin: string): Promise<string> {
  return cached(`sitemap:${origin}`, async () => {
    const posts = await listPosts();
    const entries = [
      ...STATIC_PATHS.map(
        (item) =>
          `  <url>\n    <loc>${xmlEscape(origin + item.path)}</loc>\n` +
          `    <changefreq>${item.changefreq}</changefreq>\n    <priority>${item.priority}</priority>\n  </url>`,
      ),
      ...posts.map(
        (post) =>
          `  <url>\n    <loc>${xmlEscape(`${origin}/posts/${post.slug}`)}</loc>\n` +
          `    <lastmod>${post.publishAt.toISOString().slice(0, 10)}</lastmod>\n` +
          `    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`,
      ),
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
  });
}

const RSS_LIMIT = 50;

// RSS enclosure 需要可抓取的绝对图片地址；data: URL 与无法定位的相对路径直接略过。
function feedImage(cover: string | undefined, origin: string): string | null {
  if (!cover) return null;
  if (cover.startsWith("http")) return cover;
  if (cover.startsWith("/")) return origin + cover;
  return null;
}

function guessImageMime(u: string): string {
  const s = u.toLowerCase().split("?")[0];
  if (s.endsWith(".jpg") || s.endsWith(".jpeg")) return "image/jpeg";
  if (s.endsWith(".webp")) return "image/webp";
  if (s.endsWith(".gif")) return "image/gif";
  if (s.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
}

export function buildRss(origin: string): Promise<string> {
  return cached(`rss:${origin}`, async () => {
    const posts = await listPosts(RSS_LIMIT);
    const items = posts.map((post) => {
      const link = `${origin}/posts/${post.slug}`;
      const summary = stripMarkdown(post.excerpt).slice(0, 300);
      const img = feedImage(post.cover, origin);
      // content:encoded 走 CDATA；防止正文里出现 ]]> 提前闭合。
      const encoded = (
        `<p>${xmlEscape(summary)}</p>` + `<p><a href="${xmlEscape(link)}">阅读全文 →</a></p>`
      ).replace(/]]>/g, "]]&gt;");
      return (
        `    <item>\n      <title>${xmlEscape(post.title)}</title>\n` +
        `      <link>${xmlEscape(link)}</link>\n      <guid isPermaLink="true">${xmlEscape(link)}</guid>\n` +
        `      <dc:creator>TimeAmber</dc:creator>\n` +
        `      <pubDate>${post.publishAt.toUTCString()}</pubDate>\n` +
        (img ? `      <enclosure url="${xmlEscape(img)}" type="${guessImageMime(img)}"/>\n` : "") +
        `      <description>${xmlEscape(summary)}</description>\n` +
        `      <content:encoded><![CDATA[${encoded}]]></content:encoded>\n    </item>`
      );
    });
    const updated = posts[0]?.publishAt ?? new Date(0);
    return (
      `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">\n  <channel>\n` +
      `    <title>TimeAmber · 时光琥珀</title>\n` +
      `    <link>${xmlEscape(origin)}</link>\n` +
      `    <description>时光成珀，字字如初。最新剪藏、自建服务与 AI Agent 笔记。</description>\n` +
      `    <language>zh-CN</language>\n` +
      `    <lastBuildDate>${updated.toUTCString()}</lastBuildDate>\n` +
      `    <atom:link href="${xmlEscape(`${origin}/rss.xml`)}" rel="self" type="application/rss+xml"/>\n` +
      `${items.join("\n")}\n  </channel>\n</rss>\n`
    );
  });
}
