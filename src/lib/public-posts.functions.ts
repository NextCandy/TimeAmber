import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db } from "@/lib/db.server";

/**
 * 前台按需取数。
 *
 * 这里的每个函数都刻意只查页面真正用得到的列。原来归档、分类、搜索和文章页的
 * 相关推荐全都读 __root loader 序列化下来的那份「全部文章」，于是**每一个页面**
 * 都要背着近两千篇的 excerpt/cover/readingMinutes —— 首页实测 1.33 MB HTML，
 * 而首页自己一个字段都用不上。
 */

/** 归档 / 分类页够用的最小字段集：能筛选、能排序、能跳转。 */
export type PostIndexItem = {
  slug: string;
  title: string;
  category: string;
  tags: string[];
  publishAt: string;
  type: "markdown" | "html";
  externalUrl?: string;
  openIn?: "_blank" | "_self";
};

type IndexRow = {
  id: unknown;
  slug: unknown;
  title: unknown;
  category: unknown;
  publish_at: unknown;
  created_at: unknown;
  post_type: unknown;
  external_url: unknown;
  open_in: unknown;
};

function asIso(value: unknown, fallback: unknown): string {
  const raw = value ?? fallback;
  if (raw instanceof Date) return raw.toISOString();
  const parsed = new Date(String(raw));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

/**
 * 已发布文章的轻量索引，供归档页与分类页自己 loader 取用。
 * 排序与筛选条件跟原来 loadPublicState 的公开分支保持一致，避免两个页面的
 * 文章集合悄悄变样。
 */
export const loadPostIndex = createServerFn({ method: "GET" }).handler(
  async (): Promise<PostIndexItem[]> => {
    const sql = db();
    const [rows, tagRows] = await Promise.all([
      sql<IndexRow[]>`
        select
          id, slug, title, category, publish_at, created_at,
          post_type, external_url, open_in
        from public.posts
        where published = true and (publish_at is null or publish_at <= now())
        order by pinned desc, created_at desc
      `,
      sql<{ post_id: unknown; name: unknown }[]>`
        select pt.post_id, t.name
        from public.post_tags pt
        join public.tags t on t.id = pt.tag_id
      `,
    ]);

    const tagMap = new Map<number, string[]>();
    for (const row of tagRows) {
      const id = Number(row.post_id);
      const list = tagMap.get(id) ?? [];
      list.push(String(row.name));
      tagMap.set(id, list);
    }

    return rows.map((row) => {
      const isHtml = row.post_type === "html" && !!row.external_url;
      const item: PostIndexItem = {
        slug: String(row.slug),
        title: String(row.title ?? ""),
        category: String(row.category ?? ""),
        tags: tagMap.get(Number(row.id)) ?? [],
        publishAt: asIso(row.publish_at, row.created_at),
        type: isHtml ? "html" : "markdown",
      };
      // 只在真有值时挂键：写成 `key: undefined` 序列化后是 `key:void 0`，
      // 近两千篇乘以几个键就是几十 KB 的白占。
      if (isHtml) {
        item.externalUrl = String(row.external_url);
        item.openIn = row.open_in === "_self" ? "_self" : "_blank";
      }
      return item;
    });
  },
);

/** 文章页的相关推荐：标题与日期就够渲染一行。 */
export type RelatedPost = {
  slug: string;
  title: string;
  publishAt: string;
};

const relatedInput = z.object({
  slug: z.string().trim().min(1).max(300),
  limit: z.number().int().min(1).max(24).optional(),
});

/**
 * 相关文章。原来是把全部文章拉到浏览器再算分，现在同一套权重
 * （共同标签 2 分、同分类 1 分）放到 SQL 里，只回 limit 条。
 */
export const loadRelatedPosts = createServerFn({ method: "GET" })
  .inputValidator((value: z.infer<typeof relatedInput>) => relatedInput.parse(value))
  .handler(async ({ data }): Promise<RelatedPost[]> => {
    const sql = db();
    const limit = data.limit ?? 12;
    const rows = await sql<
      { slug: unknown; title: unknown; publish_at: unknown; created_at: unknown }[]
    >`
      with target as (
        select id, category from public.posts where slug = ${data.slug} limit 1
      ),
      target_tags as (
        select pt.tag_id from public.post_tags pt join target on pt.post_id = target.id
      ),
      scored as (
        select
          p.id, p.slug, p.title, p.publish_at, p.created_at,
          (
            select count(*) from public.post_tags pt
            where pt.post_id = p.id and pt.tag_id in (select tag_id from target_tags)
          ) * 2
          + case when p.category = (select category from target) then 1 else 0 end as score
        from public.posts p
        where p.published = true
          and (p.publish_at is null or p.publish_at <= now())
          and p.id <> (select id from target)
      )
      select slug, title, publish_at, created_at
      from scored
      where score > 0
      order by score desc, coalesce(publish_at, created_at) desc
      limit ${limit}
    `;
    return rows.map((row) => ({
      slug: String(row.slug),
      title: String(row.title ?? ""),
      publishAt: asIso(row.publish_at, row.created_at),
    }));
  });

/** ⌘K 面板一次要的三组结果。 */
export type SearchResults = {
  posts: Array<{ slug: string; title: string; category: string }>;
  categories: string[];
  tags: string[];
};

const searchInput = z.object({ q: z.string().trim().max(120) });

const SEARCH_POSTS = 8;
const SEARCH_FACETS = 6;

/**
 * 全站搜索。原来在浏览器里遍历全部文章的 title+excerpt+category+tags，
 * 这是 root loader 必须下发 excerpt 的唯一理由 —— 挪到服务端后既省掉那份
 * payload，匹配范围也从「摘要」扩到了正文。
 */
export const searchPosts = createServerFn({ method: "GET" })
  .inputValidator((value: z.infer<typeof searchInput>) => searchInput.parse(value))
  .handler(async ({ data }): Promise<SearchResults> => {
    const sql = db();
    const q = data.q.trim();

    if (!q) {
      const rows = await sql<{ slug: unknown; title: unknown; category: unknown }[]>`
        select slug, title, category
        from public.posts
        where published = true and (publish_at is null or publish_at <= now())
        order by pinned desc, created_at desc
        limit ${SEARCH_POSTS}
      `;
      return {
        posts: rows.map((row) => ({
          slug: String(row.slug),
          title: String(row.title ?? ""),
          category: String(row.category ?? ""),
        })),
        categories: [],
        tags: [],
      };
    }

    // ILIKE 的通配符要转义，否则用户输入的 % 会把整库都匹配上。
    const pattern = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;

    const [postRows, categoryRows, tagRows] = await Promise.all([
      sql<{ slug: unknown; title: unknown; category: unknown }[]>`
        select slug, title, category
        from public.posts p
        where p.published = true
          and (p.publish_at is null or p.publish_at <= now())
          and (
            p.title ilike ${pattern}
            or p.category ilike ${pattern}
            or p.excerpt ilike ${pattern}
            or p.content ilike ${pattern}
            or exists (
              select 1 from public.post_tags pt
              join public.tags t on t.id = pt.tag_id
              where pt.post_id = p.id and t.name ilike ${pattern}
            )
          )
        order by
          case when p.title ilike ${pattern} then 0 else 1 end,
          pinned desc,
          created_at desc
        limit ${SEARCH_POSTS}
      `,
      sql<{ category: unknown }[]>`
        select distinct category
        from public.posts
        where published = true and category ilike ${pattern} and category <> ''
        order by category
        limit ${SEARCH_FACETS}
      `,
      sql<{ name: unknown }[]>`
        select name from public.tags where name ilike ${pattern} order by name limit ${SEARCH_FACETS}
      `,
    ]);

    return {
      posts: postRows.map((row) => ({
        slug: String(row.slug),
        title: String(row.title ?? ""),
        category: String(row.category ?? ""),
      })),
      categories: categoryRows.map((row) => String(row.category)),
      tags: tagRows.map((row) => String(row.name)),
    };
  });
