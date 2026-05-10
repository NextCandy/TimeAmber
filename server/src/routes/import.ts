/* ── Halo 博客数据导入路由 ─────────────────── */

import { Hono } from "hono";
import type { Bindings, Variables } from "../types";

const importRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

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
      const content = p.originalContent || p.content?.raw || p.formatContent || "";
      const excerpt = p.summary || p.excerpt || "";
      const slug = p.slug || `post-${p.id}`;
      const title = p.title || "无标题";
      const status = p.status;
      const published = status === "PUBLISHED" || status === "published" || status === 0 || status === "0";
      const pinned = Number(p.topPriority || p.priority || 0) > 0;
      posts.push({ slug, title, content, excerpt, published, pinned, listed: true, tags: postTagNames.get(p.id) || [] });
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
importRoutes.post("/halo/preview", async (c) => {
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
importRoutes.post("/halo", async (c) => {
  try {
    const body = await c.req.json();
    const haloData = body.data || body;
    const mode = body.mode || "merge";
    const db = c.get("db");
    const { posts, tags } = convertHaloData(haloData);
    const imported = await db.importAll({ posts, tags, mode });
    return c.json({ success: true, imported, mode });
  } catch (err) {
    return c.json({ error: `导入失败: ${err instanceof Error ? err.message : "未知错误"}` }, 500);
  }
});

export default importRoutes;
