/* ── 独立页 API 路由 ──────────────────────── */

import { Hono } from "hono";
import type { Bindings, Variables } from "../types";

const pages = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// 公开：获取已发布的独立页列表（导航用）
pages.get("/", async (c) => {
  const db = c.get("db");
  const allPages = await db.getPublishedPages();
  return c.json(allPages);
});

// 公开：获取单个独立页内容
pages.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = c.get("db");
  const page = await db.getPublishedPageBySlug(slug);
  if (!page) return c.json({ error: "页面不存在" }, 404);
  return c.json(page);
});

export default pages;

/* ── 管理后台独立页路由 ──────────────────── */

export const adminPages = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// 获取所有独立页（含未发布）
adminPages.get("/", async (c) => {
  const db = c.get("db");
  const allPages = await db.getAllPages();
  return c.json(allPages);
});

// 获取单个独立页
adminPages.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = c.get("db");
  const page = await db.getPageBySlug(slug);
  if (!page) return c.json({ error: "页面不存在" }, 404);
  return c.json(page);
});

// 创建或更新独立页
adminPages.post("/", async (c) => {
  const body = await c.req.json();
  const db = c.get("db");
  const result = await db.upsertPage(body);
  return c.json({ success: true, slug: body.slug, action: result.action });
});

// 删除独立页
adminPages.post("/delete", async (c) => {
  const { slug } = await c.req.json<{ slug: string }>();
  const db = c.get("db");
  await db.deletePage(slug);
  return c.json({ success: true });
});
