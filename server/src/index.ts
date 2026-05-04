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
import type { IObjectStorage } from "./storage/interfaces";
import { writeAnalyticsPoint, isWebsiteAllowed } from "./analytics/ae-tracker";
import { queryAEAnalytics } from "./analytics/ae-query";
import { getNotionSyncStatus, rememberDeletedNotionSlugs, syncNotionPosts } from "./notion-sync";

/* ── 类型定义 ──────────────────────────────── */
type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  AE?: AnalyticsEngineDataset; // Cloudflare Analytics Engine（CF 专属，可选）
  ADMIN_PASSWORD: string;
  JWT_SECRET: string;
  REACTION_SALT?: string;
  DB_PROVIDER?: string;
  AUTO_SCHEMA_MIGRATION?: string;
  STORAGE_PROVIDER?: string;
  WEBHOOK_URLS?: string; // 逗号分隔的 Webhook 目标地址
  SITE_ORIGIN?: string; // 对外公开域名（如 https://timeamber.com），用于 sitemap/robots/RSS
  CLOUDFLARE_ACCOUNT_ID?: string; // AE GraphQL 查询用
  CLOUDFLARE_API_TOKEN?: string; // AE GraphQL 查询用（需要 Account Analytics:Read 权限）
  ANALYTICS_WEBSITE_WHITELIST?: string; // 站点白名单，格式: domain1|domain2 (空=放行所有)
  NOTION_TOKEN?: string;
  NOTION_DATA_SOURCE_ID?: string;
};

type Variables = {
  jwtPayload: { sub: string; exp: number };
  db: IDatabase;
  storage: IObjectStorage;
};

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

/* ── Webhook 通知辅助函数 ──────────────────────────── */
async function triggerWebhook(c: any, eventName: string, payload: any) {
  if (!c.env.WEBHOOK_URLS) return;
  const urls = c.env.WEBHOOK_URLS.split(",").map((u: string) => u.trim()).filter(Boolean);
  if (urls.length === 0) return;

  const data = JSON.stringify({ event: eventName, timestamp: new Date().toISOString(), payload });
  
  const promises = urls.map((url: string) => 
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: data })
      .catch(err => console.error("Webhook notification failed for", url, err))
  );

  if (c.executionCtx && c.executionCtx.waitUntil) {
    c.executionCtx.waitUntil(Promise.allSettled(promises));
  } else {
    Promise.allSettled(promises);
  }
}

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

// 获取文章列表（仅已发布）
app.get("/api/posts", async (c) => {
  const db = c.get("db");
  c.header("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  const result = await db.getPublishedPosts();
  return c.json(result);
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
  const allTags = await db.getAllTags();
  return c.json(allTags);
});

// 获取所有分类
app.get("/api/categories", async (c) => {
  const db = c.get("db");
  const categories = await db.getCategories();
  return c.json(categories);
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
  c.header("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
  const all = await db.getSettings();
  return c.json({
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
  });
});

// 公开流量统计（侧边栏折线图）
app.get("/api/stats/traffic", async (c) => {
  const db = c.get("db");
  c.header("Cache-Control", "public, max-age=120, s-maxage=600, stale-while-revalidate=1800");
  const [chart, stats] = await Promise.all([
    db.getDailyViews(14),
    db.getViewStats(1),   // 只取 top1 即可，主要用 totalViews
  ]);
  return c.json({
    totalViews: stats.totalViews,
    totalPosts: stats.topPosts.length > 0 ? undefined : 0, // 前端已有文章数，无需重复传
    chart,
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

  const escXml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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

  const escXml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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
  const result = await db.getAllPosts();
  return c.json(result);
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

// 从 markdown 中提取首张图片 URL，作为封面缺省兜底
function extractFirstImage(markdown: string): string {
  if (!markdown) return "";
  // 优先匹配 ![](url)；只允许非空白与非右括号字符，避免回溯灾难
  const md = markdown.match(/!\[[^\]]*\]\(([^\s)]+)/);
  if (md?.[1]) return md[1];
  // 兜底匹配 <img src="url">
  const html = markdown.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (html?.[1]) return html[1];
  return "";
}

function normalizeCoverImage(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// 创建文章
function normalizeSlug(input: string): string {
  return (input || "")
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "")
    .replace(/[\u4e00-\u9fa5]+/g, (m) => m.split("").map((char) => char.charCodeAt(0).toString(36)).join(""))
    .replace(/--+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || `post-${Date.now().toString(36)}`;
}

async function uniqueSlug(db: IDatabase, baseSlug: string, reserved: Set<string>): Promise<string> {
  const base = normalizeSlug(baseSlug);
  let next = base;
  let index = 2;
  while (reserved.has(next) || await db.getPostBySlug(next)) {
    next = `${base}-${index}`;
    index++;
  }
  reserved.add(next);
  return next;
}

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

// ── 外链图片转本地 ─────────────────────────────

/** 从 Markdown 内容中提取所有外链图片 URL */
function extractExternalImageUrls(content: string): string[] {
  const urls = new Set<string>();
  const mdRegex = /!\[[^\]]*\]\(([^\s"')]+)/g;
  let match;
  while ((match = mdRegex.exec(content)) !== null) {
    const url = match[1].trim();
    if (url && !url.startsWith("/") && !url.startsWith("data:")) {
      try { new URL(url); urls.add(url); } catch { /* non-URL skip */ }
    }
  }
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  while ((match = imgRegex.exec(content)) !== null) {
    const url = match[1].trim();
    if (url && !url.startsWith("/") && !url.startsWith("data:")) {
      try { new URL(url); urls.add(url); } catch { /* skip */ }
    }
  }
  return Array.from(urls);
}

/** SSRF 防护：仅允许 https:// 开头的外部图片地址 */
function isSafeImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|0\.|169\.254\.)/.test(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

// 单篇文章：外链图片转本地
type SeeRewriteResult = {
  content: string;
  replaced: number;
  failed: number;
  errors: string[];
};

function isSeeHostedUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === "s.ee" || hostname.endsWith(".s.ee") || hostname === "i.see.you";
  } catch {
    return false;
  }
}

function filenameFromImageUrl(url: string, contentType: string): string {
  const extFromType = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg"
    : contentType.includes("png") ? "png"
    : contentType.includes("gif") ? "gif"
    : contentType.includes("webp") ? "webp"
    : contentType.includes("svg") ? "svg"
    : contentType.includes("avif") ? "avif"
    : "png";

  try {
    const rawName = new URL(url).pathname.split("/").pop() || "";
    const cleanName = decodeURIComponent(rawName).replace(/[^\w.-]/g, "-").slice(0, 96);
    return cleanName && /\.[a-z0-9]{2,5}$/i.test(cleanName) ? cleanName : `timeamber-${Date.now()}.${extFromType}`;
  } catch {
    return `timeamber-${Date.now()}.${extFromType}`;
  }
}

function normalizeSeePublicUrl(uploadedUrl: string | undefined, fileId: string | undefined): string | null {
  if (uploadedUrl) {
    try {
      const parsed = new URL(uploadedUrl);
      const hostname = parsed.hostname.toLowerCase();
      if (hostname === "i.see.you" || hostname === "s.ee" || hostname.endsWith(".s.ee")) {
        return parsed.toString();
      }
    } catch {
      // Fall back to file_id below.
    }
  }
  return fileId ? `https://s.ee/${fileId}` : null;
}

async function uploadImageToSee(url: string, apiToken: string): Promise<string> {
  const abortCtrl = new AbortController();
  const timeoutId = setTimeout(() => abortCtrl.abort(), 15000);
  try {
    const sourceResp = await fetch(url, {
      headers: { "User-Agent": "TimeAmber-Bot/1.0" },
      signal: abortCtrl.signal,
    });
    if (!sourceResp.ok) throw new Error(`source HTTP ${sourceResp.status}`);

    const contentLength = sourceResp.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > 20 * 1024 * 1024) {
      throw new Error("image exceeds 20MB limit");
    }

    const contentType = sourceResp.headers.get("content-type") || "image/png";
    if (!contentType.toLowerCase().startsWith("image/")) {
      throw new Error(`unsupported content type: ${contentType}`);
    }

    const arrayBuffer = await sourceResp.arrayBuffer();
    if (arrayBuffer.byteLength > 20 * 1024 * 1024) {
      throw new Error("image exceeds 20MB limit");
    }

    const form = new FormData();
    form.append("file", new Blob([arrayBuffer], { type: contentType }), filenameFromImageUrl(url, contentType));

    const uploadResp = await fetch("https://s.ee/api/v1/file/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}` },
      body: form,
    });
    const payload = await uploadResp.json<{
      success?: boolean;
      message?: string;
      data?: { file_id?: string; url?: string };
    }>().catch(() => null);

    const publicUrl = normalizeSeePublicUrl(payload?.data?.url, payload?.data?.file_id);
    if (!uploadResp.ok || !payload?.success || !publicUrl) {
      throw new Error(payload?.message || `S.EE HTTP ${uploadResp.status}`);
    }
    return publicUrl;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function rewriteExternalImagesToSee(content: string, settings: Record<string, string>): Promise<SeeRewriteResult> {
  const enabled = settings.see_image_hosting_enabled === "true";
  const apiToken = (settings.see_api_token || "").trim();
  if (!enabled || !apiToken || !content) {
    return { content, replaced: 0, failed: 0, errors: [] };
  }

  const externalUrls = extractExternalImageUrls(content).filter((url) => !isSeeHostedUrl(url));
  let nextContent = content;
  let replaced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const url of externalUrls) {
    if (!isSafeImageUrl(url)) {
      failed++;
      errors.push(`${url}: only HTTPS public image URLs are allowed`);
      continue;
    }
    try {
      const seeUrl = await uploadImageToSee(url, apiToken);
      nextContent = nextContent.split(url).join(seeUrl);
      replaced++;
    } catch (err) {
      failed++;
      errors.push(`${url}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return { content: nextContent, replaced, failed, errors };
}

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

async function runNotionSync(db: IDatabase, env: Bindings, options: { resetCursor?: boolean; maxPages?: number } = {}) {
  const settings = await db.getSettings();
  return syncNotionPosts({
    db,
    env,
    settings,
    rewriteImages: async (content) => (await rewriteExternalImagesToSee(content, settings)).content,
    maxPages: options.maxPages,
    resetCursor: options.resetCursor,
  });
}

app.get("/api/admin/notion-sync/status", async (c) => {
  const db = c.get("db");
  const settings = await db.getSettings();
  return c.json(getNotionSyncStatus(settings, c.env));
});

app.post("/api/admin/notion-sync/run", async (c) => {
  const db = c.get("db");
  const result = await runNotionSync(db, c.env, { resetCursor: true, maxPages: 3 });
  return c.json(result, result.success ? 200 : 502);
});

app.post("/api/admin/ai/edit", async (c) => {
  const body = await c.req.json<{
    title?: string;
    content?: string;
    instruction?: string;
    mode?: "revise" | "seo" | "continue" | "custom";
  }>();
  const content = (body.content || "").trim();
  const mode = body.mode || "revise";
  const instruction = (body.instruction || "").trim();

  if (!content) return c.json({ error: "文章内容不能为空" }, 400);
  if (content.length > 80_000) return c.json({ error: "文章过长，请分段使用 AI 修改" }, 400);
  if (mode === "custom" && !instruction) return c.json({ error: "请填写修改要求" }, 400);

  const db = c.get("db");
  const settings = await db.getSettings();
  const provider = (settings.ai_provider || "deepseek").toLowerCase();
  const apiKey = (settings.ai_api_key || "").trim();
  if (!apiKey) return c.json({ error: "请先在后台设置中配置 AI API Key" }, 400);

  try {
    const result = await editMarkdownWithAI({
      provider,
      apiKey,
      model: settings.ai_model,
      baseUrl: settings.ai_base_url,
      title: body.title || "",
      content,
      instruction,
      mode,
    });
    return c.json({ content: result });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "AI 修改失败" }, 502);
  }
});

app.post("/api/admin/ai/batch-optimize", async (c) => {
  const body = await c.req.json<{
    slugs?: string[];
    instruction?: string;
    mode?: AIEditMode;
  }>();
  const slugs = Array.from(new Set((body.slugs || []).map((slug) => String(slug).trim()).filter(Boolean)));
  const mode = body.mode || "seo";
  const instruction = (body.instruction || "").trim();

  if (slugs.length === 0) return c.json({ error: "请选择要优化的文章" }, 400);
  if (slugs.length > 5) return c.json({ error: "单次批量 AI 优化最多支持 5 篇文章，请分批执行" }, 400);
  if (mode === "custom" && !instruction) return c.json({ error: "请填写自定义优化要求" }, 400);

  const db = c.get("db");
  const settings = await db.getSettings();
  const provider = (settings.ai_provider || "deepseek").toLowerCase();
  const apiKey = (settings.ai_api_key || "").trim();
  if (!apiKey) return c.json({ error: "请先在后台设置中配置 AI API Key" }, 400);

  const results: {
    slug: string;
    title: string;
    status: "updated" | "skipped" | "failed";
    error?: string;
  }[] = [];
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const slug of slugs) {
    const post = await db.getPostBySlug(slug);
    if (!post) {
      failed++;
      results.push({ slug, title: slug, status: "failed", error: "文章不存在" });
      continue;
    }

    const content = (post.content || "").trim();
    if (!content) {
      skipped++;
      results.push({ slug, title: post.title, status: "skipped", error: "正文为空" });
      continue;
    }
    if (content.length > 80_000) {
      skipped++;
      results.push({ slug, title: post.title, status: "skipped", error: "正文过长，请进入编辑页单独优化" });
      continue;
    }

    try {
      const aiContent = await editMarkdownWithAI({
        provider,
        apiKey,
        model: settings.ai_model,
        baseUrl: settings.ai_base_url,
        title: post.title,
        content,
        instruction,
        mode,
      });
      const rewritten = await rewriteExternalImagesToSee(aiContent, settings);
      await db.createPostVersion(slug);
      await db.updatePost(slug, {
        content: rewritten.content,
        coverImage: "",
      });
      updated++;
      results.push({ slug, title: post.title, status: "updated" });
    } catch (err) {
      failed++;
      results.push({ slug, title: post.title, status: "failed", error: err instanceof Error ? err.message : "AI 优化失败" });
    }
  }

  return c.json({ success: failed === 0, updated, skipped, failed, posts: results }, failed === slugs.length ? 502 : 200);
});

/* ── 数据备份 ──────────────────────────────── */

// 导出备份 JSON
app.get("/api/admin/backup/export", async (c) => {
  const db = c.get("db");
  const data = await db.exportAll();
  return c.json(data);
});

// 备份到对象存储
app.post("/api/admin/backup/r2", async (c) => {
  const db = c.get("db");
  const storage = c.get("storage");

  const data = await db.exportAll();
  const json = JSON.stringify(data, null, 2);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const key = `backups/timeamber-backup-${timestamp}.json`;

  await storage.put(key, json, {
    contentType: "application/json",
    customMetadata: { type: "backup", version: "1.0" },
  });

  return c.json({ success: true, key, size: json.length, timestamp: data.exportedAt });
});

// 列出备份历史
app.get("/api/admin/backup/r2-list", async (c) => {
  const storage = c.get("storage");
  const items = await storage.list("backups/", 50);

  const backups = items.map((obj) => ({
    key: obj.key,
    size: obj.size,
    uploaded: obj.uploaded,
    name: obj.key.replace("backups/", ""),
  }));
  backups.sort((a, b) => b.uploaded.localeCompare(a.uploaded));

  return c.json(backups);
});

// 删除备份
app.post("/api/admin/backup/r2-delete", async (c) => {
  const { name } = await c.req.json<{ name: string }>();
  if (!name) return c.json({ error: "缺少文件名" }, 400);

  const storage = c.get("storage");
  await storage.delete(`backups/${name}`);

  return c.json({ success: true });
});

// 预览备份内容摘要
app.post("/api/admin/backup/r2-preview", async (c) => {
  const { name } = await c.req.json<{ name: string }>();
  const storage = c.get("storage");
  const object = await storage.get(`backups/${name}`);

  if (!object) return c.json({ error: "备份文件不存在" }, 404);

  const reader = object.body.getReader();
  const chunks: Uint8Array[] = [];
  let done = false;
  while (!done) {
    const result = await reader.read();
    if (result.value) chunks.push(result.value);
    done = result.done;
  }
  const text = new TextDecoder().decode(new Uint8Array(chunks.flatMap((c) => [...c])));

  try {
    const data = JSON.parse(text);
    return c.json({
      version: data.version || "unknown",
      exportedAt: data.exportedAt || "unknown",
      postCount: data.posts?.length || 0,
      tagCount: data.tags?.length || 0,
      postTitles: (data.posts || []).slice(0, 10).map((p: { title: string; slug: string }) => ({ title: p.title, slug: p.slug })),
      settingsKeys: Object.keys(data.settings || {}),
    });
  } catch {
    return c.json({ error: "备份文件格式无效" }, 400);
  }
});

// 从 JSON 文件恢复/导入数据
app.post("/api/admin/backup/restore", async (c) => {
  const body = await c.req.json();
  const db = c.get("db");

  try {
    const imported = await db.importAll({
      posts: body.posts,
      tags: body.tags,
      settings: body.settings,
      mode: body.mode || "merge",
    });
    return c.json({ success: true, imported, mode: body.mode || "merge" });
  } catch (err) {
    return c.json({ error: `恢复失败: ${err instanceof Error ? err.message : "未知错误"}` }, 500);
  }
});

// 从 R2 备份文件直接恢复数据（真正的恢复逻辑）
app.post("/api/admin/backup/r2-restore", async (c) => {
  const { name, mode } = await c.req.json<{ name: string; mode?: "merge" | "overwrite" }>();
  if (!name) return c.json({ error: "缺少备份文件名" }, 400);

  const storage = c.get("storage");
  const db = c.get("db");

  const object = await storage.get(`backups/${name}`);
  if (!object) return c.json({ error: "备份文件不存在" }, 404);

  // 读取完整备份内容
  const reader = object.body.getReader();
  const chunks: Uint8Array[] = [];
  let done = false;
  while (!done) {
    const result = await reader.read();
    if (result.value) chunks.push(result.value);
    done = result.done;
  }
  const text = new TextDecoder().decode(new Uint8Array(chunks.flatMap((c) => [...c])));

  let data: { posts?: unknown[]; tags?: unknown[]; settings?: Record<string, string> };
  try {
    data = JSON.parse(text);
  } catch {
    return c.json({ error: "备份文件格式无效，无法解析 JSON" }, 400);
  }

  if (!data.posts && !data.tags && !data.settings) {
    return c.json({ error: "备份文件缺少有效数据字段（posts / tags / settings）" }, 400);
  }

  try {
    const imported = await db.importAll({
      posts: data.posts as Parameters<typeof db.importAll>[0]["posts"],
      tags: data.tags as Parameters<typeof db.importAll>[0]["tags"],
      settings: data.settings,
      mode: mode || "merge",
    });
    return c.json({ success: true, imported, source: name, mode: mode || "merge" });
  } catch (err) {
    return c.json({ error: `恢复失败: ${err instanceof Error ? err.message : "未知错误"}` }, 500);
  }
});



// WebDAV 备份
app.post("/api/admin/backup/webdav", async (c) => {
  const body = await c.req.json<{
    url: string; username: string; password: string; path?: string;
  }>();

  // SSRF 防护：仅允许 https:// 的外部 URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(body.url);
    if (parsedUrl.protocol !== "https:") {
      return c.json({ error: "仅允许 HTTPS 协议的 WebDAV 地址" }, 400);
    }
    if (isBlockedWebdavHost(parsedUrl.hostname)) {
      return c.json({ error: "不允许内网地址" }, 400);
    }
  } catch {
    return c.json({ error: "无效的 WebDAV 地址" }, 400);
  }

  if (!body.username?.trim() || !body.password) {
    return c.json({ error: "请填写 WebDAV 用户名和密码/应用密钥" }, 400);
  }

  const db = c.get("db");
  const data = await db.exportAll();
  const json = JSON.stringify(data, null, 2);
  const payload = new TextEncoder().encode(json);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `time-amber-backup-${timestamp}.json`;
  const baseUrl = normalizeWebdavBaseUrl(parsedUrl);
  const remotePath = normalizeWebdavPath(body.path || "/time-amber-backups");
  const authHeader = basicAuthHeader(body.username.trim(), body.password);
  const webdavHeaders = makeWebdavHeaders(authHeader);
  const fullUrl = buildWebdavUrl(baseUrl, remotePath, filename);

  try {
    const mkdirWarning = await ensureWebdavDirectory(baseUrl, remotePath, webdavHeaders);

    const res = await putWebdavFile(fullUrl, webdavHeaders, payload);

    if (!isWebdavSuccess(res.status)) {
      const detail = await safeResponseText(res);
      if (isProviderIpBlocked(res.status, detail)) {
        return c.json({
          code: "webdav_ip_blocked",
          error: `WebDAV 服务商拦截了当前服务器出口 IP，无法从 Cloudflare Worker 直接上传。请改用 R2/本地备份，或换用允许 Cloudflare Worker 出口 IP 的 WebDAV 服务。${mkdirWarning ? ` 目录创建提示：${mkdirWarning}` : ""}`,
        }, 502);
      }
      return c.json({
        error: `WebDAV 上传失败: ${res.status} ${res.statusText}${detail ? ` - ${detail}` : ""}${mkdirWarning ? `；目录创建提示：${mkdirWarning}` : ""}`,
      }, 500);
    }

    return c.json({ success: true, url: fullUrl, size: payload.byteLength, timestamp: data.exportedAt, warning: mkdirWarning || undefined });
  } catch (err) {
    return c.json({ error: `WebDAV 连接失败: ${err instanceof Error ? err.message : "未知错误"}` }, 500);
  }
});

function isBlockedWebdavHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    host === "localhost" ||
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|0\.|169\.254\.)/.test(host)
  );
}

function normalizeWebdavBaseUrl(url: URL): string {
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/+$/, "");
}

function normalizeWebdavPath(path: string): string {
  const clean = path.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!clean) return "";
  return `/${clean.split("/").filter(Boolean).map(encodeURIComponent).join("/")}`;
}

function buildWebdavUrl(baseUrl: string, remotePath: string, filename?: string): string {
  const encodedFile = filename ? `/${encodeURIComponent(filename)}` : "";
  return `${baseUrl}${remotePath}${encodedFile}`;
}

function basicAuthHeader(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

function makeWebdavHeaders(authHeader: string): Record<string, string> {
  return {
    Authorization: authHeader,
    Accept: "*/*",
    "User-Agent": "TimeAmber-Backup/1.0",
  };
}

async function putWebdavFile(url: string, headers: Record<string, string>, payload: Uint8Array): Promise<Response> {
  const uploadHeaders = {
    ...headers,
    "Content-Type": "application/octet-stream",
    "Content-Length": String(payload.byteLength),
  };

  try {
    return await fetch(url, {
      method: "PUT",
      headers: uploadHeaders,
      body: payload,
    });
  } catch {
    const { "Content-Length": _contentLength, ...fallbackHeaders } = uploadHeaders;
    return fetch(url, {
      method: "PUT",
      headers: fallbackHeaders,
      body: payload,
    });
  }
}

async function ensureWebdavDirectory(baseUrl: string, remotePath: string, headers: Record<string, string>): Promise<string | null> {
  const segments = remotePath.split("/").filter(Boolean);
  let currentPath = "";
  const warnings: string[] = [];

  for (const segment of segments) {
    currentPath += `/${segment}`;
    const res = await fetch(buildWebdavUrl(baseUrl, currentPath), {
      method: "MKCOL",
      headers,
    });

    // 405 usually means the directory already exists; both cases are safe to continue.
    if (res.status === 405) continue;
    if (res.status >= 500) {
      const detail = await safeResponseText(res);
      warnings.push(`${res.status} ${res.statusText}${detail ? ` - ${detail}` : ""}`);
      continue;
    }
    if (!isWebdavSuccess(res.status)) {
      const detail = await safeResponseText(res);
      return `WebDAV 目录创建失败: ${res.status} ${res.statusText}${detail ? ` - ${detail}` : ""}`;
    }
  }

  return warnings.length ? warnings.join("; ") : null;
}

function isWebdavSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

function isProviderIpBlocked(status: number, detail: string): boolean {
  return status === 403 && /ip has been blocked|security system|blocked by/i.test(detail);
}

async function safeResponseText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300).replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

// ── Halo 博客数据导入 ─────────────────────────

/** 将 Halo 导出的 JSON 数据转换为 TimeAmber 的导入格式 */
function convertHaloData(haloData: any): {
  posts: any[];
  tags: { name: string }[];
  preview: { postCount: number; tagCount: number; categoryCount: number; commentCount: number };
} {
  // 构建 tag ID → name 映射
  const tagMap = new Map<number, string>();
  const tags: { name: string }[] = [];
  if (Array.isArray(haloData.tags)) {
    for (const t of haloData.tags) {
      tagMap.set(t.id, t.name);
      tags.push({ name: t.name });
    }
  }

  // 构建 category ID → name 映射（分类也作为标签导入）
  const catMap = new Map<number, string>();
  if (Array.isArray(haloData.categories)) {
    for (const c of haloData.categories) {
      catMap.set(c.id, c.name);
      if (!tags.find((t) => t.name === c.name)) {
        tags.push({ name: c.name });
      }
    }
  }

  // 构建 postId → tag names 映射
  const postTagNames = new Map<number, string[]>();
  if (Array.isArray(haloData.post_tags)) {
    for (const pt of haloData.post_tags) {
      const name = tagMap.get(pt.tagId);
      if (name) {
        if (!postTagNames.has(pt.postId)) postTagNames.set(pt.postId, []);
        postTagNames.get(pt.postId)!.push(name);
      }
    }
  }
  // 分类也关联到文章标签
  if (Array.isArray(haloData.post_categories)) {
    for (const pc of haloData.post_categories) {
      const name = catMap.get(pc.categoryId);
      if (name) {
        if (!postTagNames.has(pc.postId)) postTagNames.set(pc.postId, []);
        const arr = postTagNames.get(pc.postId)!;
        if (!arr.includes(name)) arr.push(name);
      }
    }
  }

  // 转换文章
  const posts: any[] = [];
  if (Array.isArray(haloData.posts)) {
    for (const p of haloData.posts) {
      // Halo 1.x 用 originalContent（Markdown），2.x 可能用 content.raw
      const content = p.originalContent || p.content?.raw || p.formatContent || "";
      const excerpt = p.summary || p.excerpt || "";
      const slug = p.slug || `post-${p.id}`;
      const title = p.title || "无标题";

      // 状态映射（Halo 1.x: 0=PUBLISHED, 1=DRAFT, 2=RECYCLE）
      const status = p.status;
      const published = status === "PUBLISHED" || status === "published" || status === 0 || status === "0";
      const pinned = Number(p.topPriority || p.priority || 0) > 0;

      posts.push({
        slug,
        title,
        content,
        excerpt,
        published,
        pinned,
        listed: true,
        tags: postTagNames.get(p.id) || [],
      });
    }
  }

  return {
    posts,
    tags,
    preview: {
      postCount: posts.length,
      tagCount: tags.length,
      categoryCount: catMap.size,
      commentCount: Array.isArray(haloData.comments) ? haloData.comments.length : 0,
    },
  };
}

// 预览 Halo 导入数据（不写入）
app.post("/api/admin/import/halo/preview", async (c) => {
  try {
    const haloData = await c.req.json();
    const result = convertHaloData(haloData);
    return c.json({
      success: true,
      preview: result.preview,
      postTitles: result.posts.slice(0, 20).map((p: any) => ({ title: p.title, slug: p.slug })),
      tagNames: result.tags.map((t) => t.name),
    });
  } catch (err) {
    return c.json({ error: `解析 Halo 数据失败: ${err instanceof Error ? err.message : "格式错误"}` }, 400);
  }
});

// 正式导入 Halo 数据
app.post("/api/admin/import/halo", async (c) => {
  try {
    const body = await c.req.json();
    const haloData = body.data || body;
    const mode = body.mode || "merge";
    const db = c.get("db");

    const { posts, tags } = convertHaloData(haloData);

    const imported = await db.importAll({
      posts,
      tags,
      mode,
    });

    return c.json({ success: true, imported, mode });
  } catch (err) {
    return c.json({ error: `导入失败: ${err instanceof Error ? err.message : "未知错误"}` }, 500);
  }
});

/* ── 独立页 API ─────────────────────────────── */


// 公开：获取已发布的独立页列表（导航用）
app.get("/api/pages", async (c) => {
  const db = c.get("db");
  const allPages = await db.getPublishedPages();
  return c.json(allPages);
});

// 公开：获取单个独立页内容
app.get("/api/pages/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = c.get("db");
  const page = await db.getPublishedPageBySlug(slug);
  if (!page) return c.json({ error: "页面不存在" }, 404);
  return c.json(page);
});

// 管理：获取所有独立页（含未发布）
app.get("/api/admin/pages", async (c) => {
  const db = c.get("db");
  const allPages = await db.getAllPages();
  return c.json(allPages);
});

// 管理：获取单个独立页
app.get("/api/admin/pages/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = c.get("db");
  const page = await db.getPageBySlug(slug);
  if (!page) return c.json({ error: "页面不存在" }, 404);
  return c.json(page);
});

// 管理：创建或更新独立页
app.post("/api/admin/pages", async (c) => {
  const body = await c.req.json();
  const db = c.get("db");
  const result = await db.upsertPage(body);
  return c.json({ success: true, slug: body.slug, action: result.action });
});

// 管理：删除独立页
app.post("/api/admin/pages/delete", async (c) => {
  const { slug } = await c.req.json<{ slug: string }>();
  const db = c.get("db");
  await db.deletePage(slug);
  return c.json({ success: true });
});

/* ── Durable Object / 导出 ──────────────────── */
type AIEditMode = "revise" | "seo" | "continue" | "custom";

type AIEditRequest = {
  provider: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  title: string;
  content: string;
  instruction: string;
  mode: AIEditMode;
};

function buildAIPrompt(req: AIEditRequest): string {
  const modeText: Record<AIEditMode, string> = {
    revise: "润色全文，保持原意、Markdown 结构和标题层级，提升表达清晰度。",
    seo: "进行 SEO 优化，补强摘要感、关键词覆盖、标题层级和可读性，但不要堆砌关键词。",
    continue: "在原文基础上自然续写，保持语气、结构和 Markdown 风格一致。",
    custom: req.instruction,
  };

  return [
    "你是 TimeAmber 博客的中文文章编辑助手。",
    "只返回修改后的 Markdown 正文，不要解释、不加代码围栏。",
    "保留已有图片、链接、代码块和 frontmatter 中的关键信息。",
    `文章标题：${req.title || "未命名"}`,
    `修改目标：${modeText[req.mode]}`,
    req.instruction && req.mode !== "custom" ? `补充要求：${req.instruction}` : "",
    "原文如下：",
    req.content,
  ].filter(Boolean).join("\n\n");
}

async function editMarkdownWithAI(req: AIEditRequest): Promise<string> {
  const prompt = buildAIPrompt(req);
  if (req.provider === "gemini") return callGemini(req, prompt);
  return callOpenAICompatible(req, prompt);
}

function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  return (value || fallback).replace(/\/+$/, "");
}

async function callOpenAICompatible(req: AIEditRequest, prompt: string): Promise<string> {
  const isDeepSeek = req.provider === "deepseek";
  const baseUrl = normalizeBaseUrl(req.baseUrl, isDeepSeek ? "https://api.deepseek.com" : "https://api.openai.com/v1");
  const model = req.model || (isDeepSeek ? "deepseek-chat" : "gpt-4o-mini");
  const endpoint = baseUrl.endsWith("/v1") ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        { role: "system", content: "你是严谨的中文 Markdown 编辑，只输出修改后的正文。" },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI API 请求失败 (${res.status})${text ? `: ${text.slice(0, 180)}` : ""}`);
  }

  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("AI 未返回可用内容");
  return content;
}

async function callGemini(req: AIEditRequest, prompt: string): Promise<string> {
  const model = req.model || "gemini-2.0-flash";
  const baseUrl = normalizeBaseUrl(req.baseUrl, "https://generativelanguage.googleapis.com/v1beta");
  const res = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(req.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4 },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini 请求失败 (${res.status})${text ? `: ${text.slice(0, 180)}` : ""}`);
  }

  const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!content) throw new Error("Gemini 未返回可用内容");
  return content;
}

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
      const result = await runNotionSync(db, env, { maxPages: 4 });
      console.log(`[Cron] Notion sync finished: created=${result.created}, updated=${result.updated}, failed=${result.failed}`);
    }
  }
};
