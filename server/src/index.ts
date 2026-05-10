/* ──────────────────────────────────────────────
   TimeAmber 博客后端 API
   路由层 — 只依赖 IDatabase / IObjectStorage 接口
   底层实现通过环境变量 DB_PROVIDER / STORAGE_PROVIDER 切换
   ────────────────────────────────────────────── */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { sign, verify } from "hono/jwt";
import { createDatabase, createObjectStorage } from "./storage/factory";
import type { IDatabase } from "./storage/interfaces";
import { writeAnalyticsPoint, isWebsiteAllowed } from "./analytics/ae-tracker";
import { queryAEAnalytics } from "./analytics/ae-query";
import { getArchiveSyncStatus, syncArchiveSources } from "./archive-sync";
import { getNotionSyncStatus, rememberDeletedNotionSlugs, syncNotionPosts } from "./notion-sync";
import type { Bindings, Variables } from "./types";
import { triggerWebhook } from "./utils/webhook";
import { publicCachedJson } from "./utils/cache";
import { escapeXml } from "./utils/html";
import {
  extractFirstImage, normalizeCoverImage, extractExternalImageUrls,
  isSafeImageUrl, rewriteExternalImagesToSee,
} from "./utils/image";
import { normalizeSlug, uniqueSlug } from "./utils/slug";
import aiRoutes from "./routes/ai";
import backupRoutes from "./routes/backup";
import importRoutes from "./routes/import";
import publicPages, { adminPages } from "./routes/pages";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/* ── 全局中间件 ────────────────────────────── */
app.use("*", cors({
  origin: (origin) => origin || "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

app.use("*", async (c, next) => {
  await next();
  const headers = c.res.headers;
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (c.req.url.startsWith("https://")) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
});

// 注入存储实例到上下文（每次请求创建 — 在边缘环境中是无状态的）
app.use("*", async (c, next) => {
  c.set("db", await createDatabase(c.env as unknown as Record<string, unknown>));
  c.set("storage", createObjectStorage(c.env as unknown as Record<string, unknown>));
  await next();
});

// 边缘缓存策略：针对公开 API 的 GET 请求应用缓存
app.use("*", async (c, next) => {
  await next();
  const path = c.req.path;
  
  // 排除非 GET 请求、后台接口、以及请求失败的情况
  if (c.req.method !== "GET" || c.res.status !== 200 || path.startsWith("/api/admin")) return;
  
  // 仅对未设置 Cache-Control 的 /api/ 开始的公开端点设置缓存
  if (path.startsWith("/api/") && !c.res.headers.has("Cache-Control")) {
    c.res.headers.set("Cache-Control", "public, max-age=15, s-maxage=60, stale-while-revalidate=30");
  }
});

/* ── Webhook / 缓存 / 图片工具已提取至 utils/ ── */

/* ── 健康检查端点 ──────────────────────────── */
app.get("/api/health", async (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

/* ── 访客埋点端点（CF 专属，AE 不可用时静默 204） ─────────── */
// POST /api/track  body: { website?, path, referer?, screen?, language?, visitorId?, duration? }
// 公开端点，受白名单 + Origin 校验保护，不写 D1（避免高频写穿）
app.post("/api/track", async (c) => {
  // 白名单校验：通过 Origin 头判断站点合法性
  const origin = c.req.header("Origin") || c.req.header("Referer") || "";
  if (!isWebsiteAllowed(origin, c.env.ANALYTICS_WEBSITE_WHITELIST)) {
    return c.json({ error: "origin not allowed" }, 403);
  }

  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch { return c.json({ error: "invalid json" }, 400); }

  const path = typeof body.path === "string" ? body.path : "";
  if (!path || path.length > 256) return c.json({ error: "invalid path" }, 400);

  // AE 不可用（Turso/PG 部署）→ 直接 204，前端无感
  if (!c.env.AE) {
    c.status(204);
    return c.body(null);
  }

  writeAnalyticsPoint(
    {
      website: typeof body.website === "string" ? body.website : "default",
      path,
      referer: typeof body.referer === "string" ? body.referer : c.req.header("Referer"),
      screen: typeof body.screen === "string" ? body.screen : "",
      language: typeof body.language === "string" ? body.language : c.req.header("Accept-Language")?.split(",")[0],
      visitorId: typeof body.visitorId === "string" ? body.visitorId : "",
      duration: typeof body.duration === "number" ? body.duration : 0,
    },
    {
      ae: c.env.AE,
      userAgent: c.req.header("User-Agent"),
      country: c.req.header("CF-IPCountry") || "XX",
    },
  );
  c.status(204);
  return c.body(null);
});

/* ── 公开 API ──────────────────────────────── */

// 获取文章列表（仅已发布，支持分页）
app.get("/api/posts", async (c) => {
  const db = c.get("db");
  const rawLimit = c.req.query("limit");
  const rawOffset = c.req.query("offset");
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;
  const parsedOffset = rawOffset ? Number.parseInt(rawOffset, 10) : undefined;
  const limit = parsedLimit && parsedLimit > 0 ? Math.min(parsedLimit, 200) : undefined;
  const offset = parsedOffset && parsedOffset >= 0 ? parsedOffset : undefined;

  // 分页模式：返回 { posts, total, hasMore }
  if (limit && offset !== undefined) {
    return publicCachedJson(c, { maxAge: 60, sMaxAge: 300, staleWhileRevalidate: 600 }, async () => {
      const allPosts = await db.getPublishedPosts();
      const total = allPosts.length;
      const paged = allPosts.slice(offset, offset + limit);
      return { posts: paged, total, hasMore: offset + limit < total };
    });
  }

  // 兼容模式：返回数组
  return publicCachedJson(c, { maxAge: 300, sMaxAge: 1800, staleWhileRevalidate: 3600 }, () => db.getPublishedPosts(limit));
});

// 搜索文章
app.get("/api/search", async (c) => {
  const query = c.req.query("q") || "";
  if (!query.trim()) return c.json([]);
  let limit = parseInt(c.req.query("limit") || "20", 10);
  if (isNaN(limit) || limit <= 0) limit = 20;
  limit = Math.min(limit, 50);
  const db = c.get("db");
  const results = await db.searchPosts(query.trim(), limit);
  return c.json(results);
});

// 获取单篇文章（同时异步递增浏览量）
app.get("/api/posts/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = c.get("db");
  const post = await db.getPostBySlug(slug);
  if (!post) return c.json({ error: "文章未找到" }, 404);
  c.header("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");

  // 异步递增浏览量 + 记录日访问量——不阻塞响应
  try {
    const viewPromise = db.incrementViewCount(slug);
    const dailyPromise = db.recordDailyView();

    // 采集访客信息
    const country = c.req.header("CF-IPCountry") || "XX";
    const referer = c.req.header("Referer") || "";
    let refererDomain = "";
    try { if (referer) refererDomain = new URL(referer).hostname; } catch { /* */ }
    const ua = (c.req.header("User-Agent") || "").toLowerCase();
    const deviceType = /bot|crawl|spider|slurp/i.test(ua) ? "bot"
      : /mobile|android|iphone/i.test(ua) ? "mobile"
      : /tablet|ipad/i.test(ua) ? "tablet" : "desktop";
    const visitPromise = db.recordVisit({ path: `/posts/${slug}`, country, refererDomain, deviceType });

    // CF 专属：同步双写 Analytics Engine（Workers 环境零成本）
    writeAnalyticsPoint(
      { website: "default", path: `/posts/${slug}`, referer },
      { ae: c.env.AE, userAgent: c.req.header("User-Agent"), country },
    );

    // 边缘环境中使用 waitUntil 确保异步任务完成
    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(viewPromise);
      c.executionCtx.waitUntil(dailyPromise);
      c.executionCtx.waitUntil(visitPromise);
    } else {
      viewPromise.catch(() => {});
      dailyPromise.catch(() => {});
      visitPromise.catch(() => {});
    }
  } catch {
    /* 浏览量统计失败不影响文章返回 */
  }

  return c.json(post);
});

// 获取同系列文章列表
app.get("/api/series/:slug", async (c) => {
  const seriesSlug = c.req.param("slug");
  const db = c.get("db");
  const seriesPosts = await db.getSeriesPosts(seriesSlug);
  return c.json(seriesPosts);
});

// 获取所有标签
app.get("/api/tags", async (c) => {
  const db = c.get("db");
  return publicCachedJson(c, { maxAge: 300, sMaxAge: 1800, staleWhileRevalidate: 3600 }, () => db.getAllTags());
});

// 获取所有分类
app.get("/api/categories", async (c) => {
  const db = c.get("db");
  return publicCachedJson(c, { maxAge: 300, sMaxAge: 1800, staleWhileRevalidate: 3600 }, () => db.getCategories());
});

// 获取文章评论（仅已审核，不暴露邮箱）
app.get("/api/posts/:slug/comments", async (c) => {
  const slug = c.req.param("slug");
  const db = c.get("db");
  const comments = await db.getApprovedComments(slug);
  const safe = comments.map(({ author_email, authorEmail, ...rest }: any) => rest);
  return c.json(safe);
});

// 提交评论（公开接口，需审核后才显示）
app.post("/api/posts/:slug/comments", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json<{
    authorName: string;
    authorEmail?: string;
    content: string;
    _hp?: string; // honeypot 反垃圾字段
  }>();

  // Honeypot 反垃圾：如果隐藏字段被填写，静默拒绝
  if (body._hp) return c.json({ success: true, message: "评论已提交，等待审核" });

  if (!body.authorName?.trim() || !body.content?.trim()) {
    return c.json({ error: "昵称和评论内容不能为空" }, 400);
  }
  if (body.content.length > 2000) {
    return c.json({ error: "评论内容不能超过 2000 字" }, 400);
  }

  const db = c.get("db");
  try {
    await db.addComment({
      postSlug: slug,
      authorName: body.authorName.trim(),
      authorEmail: body.authorEmail?.trim() || "",
      content: body.content.trim(),
    });
    
    // 异步触发评论提醒邮件（Resend/Webhook）
    const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const resendKey = (c.env as any).RESEND_API_KEY;
    const adminEmail = (c.env as any).ADMIN_EMAIL;
    if (resendKey && adminEmail) {
      const emailPromise = fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "TimeAmber Bot <onboarding@resend.dev>", // Resend 测试域名或需要替换为自有域名
          to: adminEmail,
          subject: `[TimeAmber] 新评论待审核: ${slug}`,
          html: `<p><strong>${escHtml(body.authorName.trim())}</strong> 刚刚在文章 <code>${escHtml(slug)}</code> 提交了评论：</p>
                 <blockquote style="border-left: 4px solid #eee; padding-left: 10px; color: #555;">${escHtml(body.content.trim())}</blockquote>
                 <p>邮箱: ${escHtml(body.authorEmail?.trim() || "无")}</p>
                 <p><a href="https://${new URL(c.req.url).hostname}/admin/comments">前往后台审核</a></p>`
        })
      }).catch(() => {});
      
      if (c.executionCtx?.waitUntil) {
        c.executionCtx.waitUntil(emailPromise);
      }
    }

    return c.json({ success: true, message: "评论已提交，等待审核" });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "提交失败" }, 400);
  }
});

// 获取文章表情反应统计
app.get("/api/posts/:slug/reactions", async (c) => {
  const slug = c.req.param("slug");
  const db = c.get("db");
  const reactions = await db.getReactions(slug);
  return c.json(reactions);
});

// 切换表情反应（无需登录，IP 去重）
app.post("/api/posts/:slug/reactions", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json<{ type: string }>();

  const validTypes = ["like", "heart", "celebrate", "think"];
  if (!validTypes.includes(body.type)) {
    return c.json({ error: "无效的反应类型" }, 400);
  }

  // IP hash 去重（使用环境变量盐值，避免源码泄露后可反推）
  const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown";
  const reactionSalt = c.env.REACTION_SALT || "timeamber-reaction-default";
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + ":" + reactionSalt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const ipHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

  const db = c.get("db");
  const result = await db.toggleReaction(slug, body.type, ipHash);
  const reactions = await db.getReactions(slug);
  return c.json({ ...result, reactions });
});

// 公开：获取前台需要的设置（不含敏感信息）
app.get("/api/settings/public", async (c) => {
  const db = c.get("db");
  return publicCachedJson(c, { maxAge: 300, sMaxAge: 1800, staleWhileRevalidate: 3600 }, async () => {
    const all = await db.getSettings();
    return {
    site_title: all.site_title || "TimeAmber",
    site_description: all.site_description || "",
    site_tagline: all.site_tagline || "",
    footer_text: all.footer_text || "",
    author_name: all.author_name || "TimeAmber",
    author_title: all.author_title || "",
    author_bio: all.author_bio || "",
    author_avatar: all.author_avatar || "",
    github_url: all.github_url || "",
    twitter_url: all.twitter_url || "",
    email: all.email || "",
    social_links: all.social_links || "",
    rss_enabled: all.rss_enabled || "true",
    friend_links: all.friend_links || "[]",
    custom_header: all.custom_header || "",
    custom_footer: all.custom_footer || "",
    };
  });
});

// 公开流量统计（侧边栏折线图）
app.get("/api/stats/traffic", async (c) => {
  const db = c.get("db");
  return publicCachedJson(c, { maxAge: 120, sMaxAge: 600, staleWhileRevalidate: 1800 }, async () => {
    const [chart, stats] = await Promise.all([
      db.getDailyViews(14),
      db.getViewStats(1),   // 只取 top1 即可，主要用 totalViews
    ]);
    return {
      totalViews: stats.totalViews,
      totalPosts: stats.topPosts.length > 0 ? undefined : 0, // 前端已有文章数，无需重复传
      chart,
    };
  });
});

// RSS 2.0 XML feed
app.get("/rss.xml", async (c) => {
  const db = c.get("db");

  // 检查 RSS 是否开启
  const rssEnabled = await db.getSetting("rss_enabled");
  if (rssEnabled === "false") return c.text("RSS 未开启", 404);

  // 读取站点信息
  const settings = await db.getSettings();
  const siteTitle = settings.site_title || "TimeAmber";
  const siteDesc = settings.site_description || "";
  const siteUrl = c.env.SITE_ORIGIN || new URL(c.req.url).origin;

  // 获取最新 20 篇文章
  const allPosts = await db.getRecentPublishedPosts(20);

  const escXml = escapeXml;

  const items = allPosts.map((p) => `    <item>
      <title>${escXml(p.title)}</title>
      <link>${siteUrl}/posts/${p.slug}</link>
      <guid isPermaLink="true">${siteUrl}/posts/${p.slug}</guid>
      <description>${escXml(p.excerpt || "")}</description>
      <pubDate>${new Date(p.createdAt).toUTCString()}</pubDate>
    </item>`).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escXml(siteTitle)}</title>
    <link>${siteUrl}</link>
    <description>${escXml(siteDesc)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
});

// sitemap.xml — 动态站点地图
app.get("/sitemap.xml", async (c) => {
  const db = c.get("db");
  const siteUrl = c.env.SITE_ORIGIN || new URL(c.req.url).origin;

  const allPosts = await db.getRecentPublishedPosts(1000);
  const allPages = await db.getPublishedPages();

  const escXml = escapeXml;

  const urls: string[] = [];

  // 首页
  urls.push(`  <url>
    <loc>${escXml(siteUrl)}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`);

  // 归档页
  urls.push(`  <url>
    <loc>${escXml(siteUrl)}/archive</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`);

  // 文章
  for (const post of allPosts) {
    urls.push(`  <url>
    <loc>${escXml(siteUrl)}/posts/${escXml(post.slug)}</loc>
    ${(() => { const d = new Date(post.updatedAt || post.createdAt); return `<lastmod>${Number.isNaN(d.getTime()) ? new Date().toISOString().split("T")[0] : d.toISOString().split("T")[0]}</lastmod>`; })()}
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`);
  }

  // 独立页面
  for (const page of allPages) {
    urls.push(`  <url>
    <loc>${escXml(siteUrl)}/pages/${escXml(page.slug)}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`);
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new Response(sitemap, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
});

// robots.txt — 爬虫规则
app.get("/robots.txt", (c) => {
  const siteUrl = c.env.SITE_ORIGIN || new URL(c.req.url).origin;
  const txt = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/admin

Sitemap: ${siteUrl}/sitemap.xml
`;
  return new Response(txt, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
});

/* ── 登录速率限制 ─────────────────────────── */
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const LOGIN_RATE_LIMIT = 5;       // 最多 5 次
const LOGIN_RATE_WINDOW = 15 * 60 * 1000; // 15 分钟窗口

/* ── 认证 API ──────────────────────────────── */

// 登录
app.post("/api/auth/login", async (c) => {
  c.header("Cache-Control", "no-store");
  const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown";

  // 速率限制
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (record && record.count >= LOGIN_RATE_LIMIT && (now - record.firstAttempt) < LOGIN_RATE_WINDOW) {
    return c.json({ error: "尝试次数过多，请稍后再试" }, 429);
  }
  if (!record || (now - record.firstAttempt) >= LOGIN_RATE_WINDOW) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
  } else {
    record.count++;
  }

  const body = await c.req.json<{ password: string }>();
  const expectedPassword = c.env.ADMIN_PASSWORD?.trim();

  if (!expectedPassword) {
    return c.json({ error: "后台密码未配置，请检查 ADMIN_PASSWORD" }, 500);
  }
  if (!c.env.JWT_SECRET?.trim()) {
    return c.json({ error: "JWT 密钥未配置，请检查 JWT_SECRET" }, 500);
  }

  if (!body.password?.trim() || body.password.trim() !== expectedPassword) {
    return c.json({ error: "密码错误" }, 401);
  }

  // 登录成功后清除速率限制
  loginAttempts.delete(ip);

  const now2 = Math.floor(Date.now() / 1000);
  const token = await sign(
    { sub: "admin", iat: now2, exp: now2 + 60 * 60 * 24 * 7 },
    c.env.JWT_SECRET.trim(),
    "HS256"
  );

  return c.json({ token });
});

// 验证当前登录状态
app.get("/api/auth/me", async (c) => {
  c.header("Cache-Control", "no-store");
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ authenticated: false });
  }
  try {
    await verify(authHeader.slice(7), c.env.JWT_SECRET.trim(), "HS256");
    return c.json({ authenticated: true, user: "admin" });
  } catch {
    return c.json({ authenticated: false });
  }
});

/* ── 管理 API（需要认证）─────────────────── */

// JWT 鉴权中间件
app.use("/api/admin/*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "未认证" }, 401);
  }
  try {
    const payload = await verify(authHeader.slice(7), c.env.JWT_SECRET.trim(), "HS256");
    c.set("jwtPayload", payload as Variables["jwtPayload"]);
    await next();
  } catch {
    return c.json({ error: "认证无效或已过期" }, 401);
  }
});

// 获取所有文章（含未发布，管理后台用）
app.get("/api/admin/posts", async (c) => {
  const db = c.get("db");
  c.header("Cache-Control", "no-store");
  if (c.req.query("include") === "content") {
    return c.json(await db.getAllPosts());
  }

  const pageParam = c.req.query("page");
  if (!pageParam) return c.json(await db.getAllPostSummaries());

  const pageSizeParam = Number.parseInt(c.req.query("pageSize") || "30", 10);
  const pageSize = Number.isFinite(pageSizeParam) ? Math.min(Math.max(pageSizeParam, 10), 100) : 30;
  const page = Math.max(Number.parseInt(pageParam || "1", 10) || 1, 1);
  const status = c.req.query("status") || "all";
  const q = (c.req.query("q") || "").trim().toLowerCase();
  const tag = (c.req.query("tag") || "").trim();
  const normalizedStatus = status === "published" || status === "draft" ? status : "all";
  const includeMeta = c.req.query("meta") !== "0";

  return c.json(await db.getAdminPostSummariesPage({ page, pageSize, status: normalizedStatus, q, tag, includeMeta }));
});

// 阅读统计数据
app.get("/api/admin/stats", async (c) => {
  const db = c.get("db");
  const stats = await db.getViewStats(10);
  return c.json(stats);
});

// 访客分析数据
app.get("/api/admin/analytics", async (c) => {
  let days = parseInt(c.req.query("days") || "7", 10);
  if (isNaN(days) || days <= 0) days = 7;
  const db = c.get("db");
  const analytics = await db.getAnalytics(Math.min(days, 90));
  return c.json(analytics);
});

// 访客分析数据 — AE 增强版（CF 专属，仅在 D1 后端 + 配置好 API Token 时可用）
app.get("/api/admin/analytics/ae", async (c) => {
  // 守卫：仅 D1 后端支持 AE（默认未设 DB_PROVIDER 视为 d1）
  const provider = (c.env.DB_PROVIDER || "d1").toLowerCase();
  if (provider !== "d1") {
    return c.json({
      error: "AE analytics is Cloudflare-only (D1 deployment)",
      provider,
    }, 501);
  }
  if (!c.env.CLOUDFLARE_ACCOUNT_ID || !c.env.CLOUDFLARE_API_TOKEN) {
    return c.json({
      error: "Missing CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN secrets",
    }, 503);
  }

  let days = parseInt(c.req.query("days") || "7", 10);
  if (isNaN(days) || days <= 0) days = 7;

  try {
    const data = await queryAEAnalytics(
      { CLOUDFLARE_ACCOUNT_ID: c.env.CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN: c.env.CLOUDFLARE_API_TOKEN },
      Math.min(days, 31),
    );
    return c.json(data);
  } catch (err) {
    return c.json({
      error: err instanceof Error ? err.message : "AE query failed",
    }, 502);
  }
});

// 获取所有评论（管理后台）
app.get("/api/admin/comments", async (c) => {
  const db = c.get("db");
  const comments = await db.getAllComments();
  return c.json(comments);
});

// 审核评论
app.post("/api/admin/comments/:id/approve", async (c) => {
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ error: "无效 ID" }, 400);
  const db = c.get("db");
  const ok = await db.approveComment(id);
  if (!ok) return c.json({ error: "评论不存在" }, 404);
  return c.json({ success: true });
});

// 删除评论
app.delete("/api/admin/comments/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ error: "无效 ID" }, 400);
  const db = c.get("db");
  const ok = await db.deleteComment(id);
  if (!ok) return c.json({ error: "评论不存在" }, 404);
  return c.json({ success: true });
});


// extractFirstImage, normalizeCoverImage, normalizeSlug, uniqueSlug 已提取至 utils/


app.post("/api/admin/posts", async (c) => {
  const body = await c.req.json();
  const db = c.get("db");
  const settings = await db.getSettings();
  if (typeof body.content === "string") {
    const seeResult = await rewriteExternalImagesToSee(body.content, settings);
    body.content = seeResult.content;
  }
  body.coverImage = normalizeCoverImage(body.coverImage);
  const newPost = await db.createPost(body);
  await triggerWebhook(c, "post_created", newPost);
  return c.json(newPost, 201);
});

// 更新文章（同时创建版本快照如果是自动保存外的核心提交，不过我们可以简化，在每次保存时如果内容变更较大则创建版本，或者直接在保存时暴露保存新版本的选项。这里我们在更新接口本身提供一个 saveVersion 参数，或者每次 updatePost 之后根据是否新建版本保存）
app.post("/api/admin/import/markdown", async (c) => {
  const body = await c.req.json<{
    posts?: {
      slug?: string;
      title?: string;
      content?: string;
      excerpt?: string;
      coverColor?: string;
      coverImage?: string;
      tags?: string[];
      category?: string;
    }[];
  }>();

  if (!Array.isArray(body.posts) || body.posts.length === 0) {
    return c.json({ error: "没有可导入的 Markdown 文章" }, 400);
  }
  if (body.posts.length > 100) {
    return c.json({ error: "一次最多导入 100 篇 Markdown 文章" }, 400);
  }

  const db = c.get("db");
  const settings = await db.getSettings();
  const reserved = new Set<string>();
  const imported = [];
  const baseTime = Date.now();

  for (let i = 0; i < body.posts.length; i++) {
    const item = body.posts[i];
    const title = (item.title || "").trim();
    let content = item.content || "";
    if (!title || !content.trim()) continue;
    content = (await rewriteExternalImagesToSee(content, settings)).content;

    const createdAt = new Date(baseTime - i * 1000).toISOString();
    const slug = await uniqueSlug(db, item.slug || title, reserved);
    const tags = Array.isArray(item.tags)
      ? Array.from(new Set(item.tags.map((tag) => String(tag).trim()).filter(Boolean))).slice(0, 20)
      : [];

    const post = await db.createPost({
      slug,
      title: title.slice(0, 160),
      content,
      excerpt: (item.excerpt || "").trim().slice(0, 300),
      coverColor: item.coverColor || "from-cyan-500/20 to-blue-600/20",
      coverImage: normalizeCoverImage(item.coverImage),
      tags,
      category: (item.category || "").trim().slice(0, 60),
      published: false,
      listed: true,
      pinned: false,
      publishAt: null,
      createdAt,
      updatedAt: createdAt,
    });
    imported.push(post);
  }

  await triggerWebhook(c, "markdown_imported", { count: imported.length, slugs: imported.map((post) => post.slug) });
  return c.json({ success: true, imported: imported.length, posts: imported }, 201);
});

app.put("/api/admin/posts/:slug", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json();
  const db = c.get("db");
  const settings = await db.getSettings();
  if (typeof body.content === "string") {
    const seeResult = await rewriteExternalImagesToSee(body.content, settings);
    body.content = seeResult.content;
  }
  // 封面图默认保持为空；只有用户显式设置时才保存。
  if (body.coverImage !== undefined) {
    body.coverImage = normalizeCoverImage(body.coverImage);
  }
  const updated = await db.updatePost(slug, body);
  if (!updated) return c.json({ error: "文章未找到" }, 404);
  
  if (body.saveVersion) {
    await db.createPostVersion(slug);
  }
  await triggerWebhook(c, "post_updated", updated);
  return c.json(updated);
});

// 获取文章历史版本
app.get("/api/admin/posts/:slug/versions", async (c) => {
  const slug = c.req.param("slug");
  const db = c.get("db");
  const versions = await db.getPostVersions(slug);
  return c.json(versions);
});

// 恢复文章至指定版本
app.post("/api/admin/posts/:slug/versions/:id/restore", async (c) => {
  const slug = c.req.param("slug");
  const idStr = c.req.param("id");
  const db = c.get("db");
  const versionId = parseInt(idStr);
  if (isNaN(versionId)) return c.json({ error: "无效的快照 ID" }, 400);

  // 恢复前先将当前状态建立一个快照，以防后续后悔（保留 Undo 能力）
  await db.createPostVersion(slug);

  const post = await db.restorePostVersion(slug, versionId);
  if (!post) return c.json({ error: "恢复失败，版本或文章不存在" }, 400);
  
  return c.json({ success: true, post });
});

// 批量操作文章：发布 / 撤回发布 / 删除
app.post("/api/admin/posts/batch", async (c) => {
  const { slugs, action } = await c.req.json<{ slugs: string[]; action: "publish" | "unpublish" | "delete" }>();
  if (!["publish", "unpublish", "delete"].includes(action)) {
    return c.json({ error: "非法的批处理操作" }, 400);
  }
  if (!slugs || !Array.isArray(slugs) || slugs.length === 0) {
    return c.json({ error: "参数不正确" }, 400);
  }
  const db = c.get("db");
  const count = await db.batchOperatePosts(slugs, action);
  if (action === "delete" && count > 0) {
    await rememberDeletedNotionSlugs(db, slugs);
  }
  await triggerWebhook(c, "post_batch_operated", { action, slugs, count });
  return c.json({ success: true, count, message: `成功处理 ${count} 篇文章` });
});

// 删除文章
app.delete("/api/admin/posts/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = c.get("db");
  const deleted = await db.deletePost(slug);
  if (!deleted) return c.json({ error: "文章未找到" }, 404);
  await rememberDeletedNotionSlugs(db, [slug]);
  await triggerWebhook(c, "post_deleted", { slug });
  return c.json({ success: true });
});

// 图片工具函数已提取至 utils/image.ts

app.post("/api/admin/posts/:slug/localize-images", async (c) => {
  const slug = c.req.param("slug");
  const db = c.get("db");
  const storage = c.get("storage");

  const post = await db.getPostBySlug(slug);
  if (!post) return c.json({ error: "文章未找到" }, 404);

  const externalUrls = extractExternalImageUrls(post.content);
  if (externalUrls.length === 0) {
    return c.json({ replaced: 0, failed: 0, message: "未发现外链图片" });
  }

  let replaced = 0;
  let failed = 0;
  const errors: string[] = [];
  let content = post.content;

  for (const url of externalUrls) {
    if (!isSafeImageUrl(url)) {
      failed++;
      errors.push(`${url}: 仅允许 HTTPS 外部图片地址`);
      continue;
    }
    try {
      const abortCtrl = new AbortController();
      const timeoutId = setTimeout(() => abortCtrl.abort(), 10000); // 10秒超时
      const resp = await fetch(url, { headers: { "User-Agent": "TimeAmber-Bot/1.0" }, signal: abortCtrl.signal });
      clearTimeout(timeoutId);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const contentLength = resp.headers.get("content-length");
      if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) throw new Error("图片超过 10MB 限制");

      const contentType = resp.headers.get("content-type") || "image/png";
      const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg"
        : contentType.includes("png") ? "png"
        : contentType.includes("gif") ? "gif"
        : contentType.includes("webp") ? "webp"
        : contentType.includes("svg") ? "svg"
        : "png";

      const key = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const arrayBuf = await resp.arrayBuffer();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(arrayBuf));
          controller.close();
        },
      });
      await storage.put(key, stream, { contentType });

      const localUrl = `/cdn/${key}`;
      // 全局替换该 URL（Markdown 和 HTML 中都替换）
      content = content.split(url).join(localUrl);
      replaced++;
    } catch (err) {
      failed++;
      errors.push(`${url}: ${err instanceof Error ? err.message : "未知错误"}`);
    }
  }

  // 只在有替换时更新文章
  if (replaced > 0) {
    await db.updatePost(slug, { content });
  }

  return c.json({ replaced, failed, total: externalUrls.length, errors });
});

// 批量：所有文章外链图片转本地
app.post("/api/admin/localize-all-images", async (c) => {
  const db = c.get("db");
  const storage = c.get("storage");
  const allPosts = await db.getAllPosts();

  let totalReplaced = 0;
  let totalFailed = 0;
  const results: { slug: string; title: string; replaced: number; failed: number }[] = [];

  for (const post of allPosts) {
    const externalUrls = extractExternalImageUrls(post.content);
    if (externalUrls.length === 0) continue;

    let replaced = 0;
    let failed = 0;
    let content = post.content;

    for (const url of externalUrls) {
      if (!isSafeImageUrl(url)) { failed++; continue; }
      try {
        const resp = await fetch(url, { headers: { "User-Agent": "TimeAmber-Bot/1.0" } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const contentType = resp.headers.get("content-type") || "image/png";
        const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg"
          : contentType.includes("png") ? "png"
          : contentType.includes("gif") ? "gif"
          : contentType.includes("webp") ? "webp"
          : contentType.includes("svg") ? "svg"
          : "png";

        const key = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const arrayBuf = await resp.arrayBuffer();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(arrayBuf));
            controller.close();
          },
        });
        await storage.put(key, stream, { contentType });
        content = content.split(url).join(`/cdn/${key}`);
        replaced++;
      } catch {
        failed++;
      }
    }

    if (replaced > 0) {
      await db.updatePost(post.slug, { content });
    }

    totalReplaced += replaced;
    totalFailed += failed;
    results.push({ slug: post.slug, title: post.title, replaced, failed });
  }

  return c.json({ totalReplaced, totalFailed, posts: results });
});

// 上传图片
app.post("/api/admin/upload", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return c.json({ error: "未提供文件" }, 400);

  const ext = file.name.split(".").pop() || "png";
  const key = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const storage = c.get("storage");
  await storage.put(key, file.stream(), { contentType: file.type });

  return c.json({ url: `/cdn/${key}`, key });
});

// 媒体库：列出所有上传的文件
app.get("/api/admin/media", async (c) => {
  const storage = c.get("storage");
  const items = await storage.list("uploads/", 500);

  const media = items.map((obj) => ({
    key: obj.key,
    name: obj.key.replace("uploads/", ""),
    url: `/cdn/${obj.key}`,
    size: obj.size,
    uploaded: obj.uploaded,
  }));
  media.sort((a, b) => b.uploaded.localeCompare(a.uploaded));

  return c.json(media);
});

// 媒体库：删除指定文件
app.delete("/api/admin/media/:key{.+}", async (c) => {
  const key = c.req.param("key");
  if (!key.startsWith("uploads/")) {
    return c.json({ error: "只能删除 uploads/ 下的文件" }, 400);
  }
  const storage = c.get("storage");
  await storage.delete(key);
  return c.json({ success: true });
});

// 通过 Worker 代理访问存储文件
app.get("/cdn/:key{.+}", async (c) => {
  const key = c.req.param("key");
  const storage = c.get("storage");
  const object = await storage.get(key);

  if (!object) return c.json({ error: "文件未找到" }, 404);

  const headers = new Headers();
  object.writeHeaders(headers);

  // 图片：长缓存 + Vary 允许 CF 边缘按格式缓存
  const isImage = /\.(jpe?g|png|gif|webp|svg|avif|bmp)$/i.test(key);
  if (isImage) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("Vary", "Accept");
  }

  return new Response(object.body, { headers });
});

/* ── 站点设置 ──────────────────────────────── */

app.get("/api/admin/settings", async (c) => {
  const db = c.get("db");
  const settings = await db.getSettings();
  return c.json(settings);
});

app.put("/api/admin/settings", async (c) => {
  const db = c.get("db");
  const body = await c.req.json<Record<string, string>>();
  await db.saveSettings(body);
  return c.json({ success: true });
});

async function runNotionSync(db: IDatabase, env: Bindings, options: { resetCursor?: boolean; maxPages?: number; repairOnly?: boolean; maxBodyPages?: number } = {}) {
  const settings = await db.getSettings();
  const rewriteNotionImages = settings.notion_sync_rewrite_images === "true";
  return syncNotionPosts({
    db,
    env,
    settings,
    rewriteImages: async (content) => rewriteNotionImages ? (await rewriteExternalImagesToSee(content, settings)).content : content,
    maxPages: options.maxPages,
    resetCursor: options.resetCursor,
    repairOnly: options.repairOnly,
    maxBodyPages: options.maxBodyPages,
  });
}

app.get("/api/admin/notion-sync/status", async (c) => {
  const db = c.get("db");
  const settings = await db.getSettings();
  return c.json(getNotionSyncStatus(settings, c.env));
});

app.post("/api/admin/notion-sync/run", async (c) => {
  const db = c.get("db");
  let body: { resetCursor?: boolean; maxPages?: number; repairOnly?: boolean; maxBodyPages?: number } = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const requestedMaxPages = Number(body.maxPages);
  const maxPages = Number.isFinite(requestedMaxPages) ? Math.min(Math.max(requestedMaxPages, 1), 3) : 1;
  const requestedMaxBodyPages = Number(body.maxBodyPages);
  const maxBodyPages = Number.isFinite(requestedMaxBodyPages) ? Math.min(Math.max(requestedMaxBodyPages, 1), 5) : undefined;
  const result = await runNotionSync(db, c.env, {
    resetCursor: body.resetCursor === true,
    maxPages,
    repairOnly: body.repairOnly === true,
    maxBodyPages,
  });
  return c.json(result, result.success ? 200 : 502);
});

app.get("/api/admin/archive-sync/status", async (c) => {
  const db = c.get("db");
  const settings = await db.getSettings();
  return c.json(getArchiveSyncStatus(settings, c.env));
});

app.post("/api/admin/archive-sync/run", async (c) => {
  const db = c.get("db");
  let body: { maxPages?: number; pageNumber?: number; resetCursor?: boolean; advanceCursor?: boolean; source?: "shudong" | "mearchive" } = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const requestedMaxPages = Number(body.maxPages);
  const maxPages = Number.isFinite(requestedMaxPages) ? Math.min(Math.max(requestedMaxPages, 1), 50) : undefined;
  const requestedPageNumber = Number(body.pageNumber);
  const pageNumber = Number.isFinite(requestedPageNumber) ? Math.max(requestedPageNumber, 1) : undefined;
  const result = await syncArchiveSources(db, c.env, {
    maxPages,
    pageNumber,
    resetCursor: body.resetCursor === true,
    advanceCursor: body.advanceCursor === true,
    source: body.source === "shudong" || body.source === "mearchive" ? body.source : undefined,
  });
  const failed = result.reduce((sum, item) => sum + item.failed, 0);
  const changed = result.reduce((sum, item) => sum + item.created + item.updated, 0);
  return c.json({ success: failed === 0, changed, result }, failed > 0 && changed === 0 ? 502 : 200);
});

// AI 路由已提取至 routes/ai.ts
app.route("/api/admin/ai", aiRoutes);

// 备份路由已提取至 routes/backup.ts
app.route("/api/admin/backup", backupRoutes);

// 导入路由已提取至 routes/import.ts
app.route("/api/admin/import", importRoutes);

// 独立页路由已提取至 routes/pages.ts
app.route("/api/pages", publicPages);
app.route("/api/admin/pages", adminPages);


/* ── AI 辅助函数已提取至 routes/ai.ts ── */


export default {
  fetch: app.fetch,
  async scheduled(event: any, env: Bindings) {
    const db = await createDatabase(env as unknown as Record<string, unknown>);
    const count = await db.publishScheduledPosts();
    if (count > 0) {
      console.log(`[Cron] Published ${count} scheduled posts.`);
    }

    const scheduledAt = new Date(event.scheduledTime || Date.now());
    if (scheduledAt.getUTCMinutes() % 10 === 0) {
      const result = await runNotionSync(db, env, { maxPages: 1 });
      console.log(`[Cron] Notion sync finished: created=${result.created}, updated=${result.updated}, failed=${result.failed}`);
    }
    if (scheduledAt.getUTCMinutes() % 10 === 5) {
      const result = await runNotionSync(db, env, { maxPages: 1, repairOnly: true, maxBodyPages: 1 });
      console.log(`[Cron] Notion repair finished: updated=${result.updated}, skipped=${result.skipped}, failed=${result.failed}`);
    }
    if (scheduledAt.getUTCMinutes() % 20 === 5) {
      const result = await syncArchiveSources(db, env, { maxPages: 10, advanceCursor: true });
      const changed = result.reduce((sum, item) => sum + item.created + item.updated, 0);
      const failed = result.reduce((sum, item) => sum + item.failed, 0);
      console.log(`[Cron] Archive sync finished: changed=${changed}, failed=${failed}`);
    }
  }
};
