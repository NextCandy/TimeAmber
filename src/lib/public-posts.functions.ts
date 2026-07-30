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

/** 公开可见的筛选条件，几个查询共用，免得某个页面的文章集合悄悄跑偏。 */
const VISIBLE = `published = true and (publish_at is null or publish_at <= now())`;

function toIndexItem(row: IndexRow, tags: string[] = []): PostIndexItem {
  const isHtml = row.post_type === "html" && !!row.external_url;
  const item: PostIndexItem = {
    slug: String(row.slug),
    title: String(row.title ?? ""),
    category: String(row.category ?? ""),
    tags,
    publishAt: asIso(row.publish_at, row.created_at),
    type: isHtml ? "html" : "markdown",
  };
  // 只在真有值时挂键：写成 `key: undefined` 序列化后是 `key:void 0`，
  // 上百篇乘以几个键就是几十 KB 的白占。
  if (isHtml) {
    item.externalUrl = String(row.external_url);
    item.openIn = row.open_in === "_self" ? "_self" : "_blank";
  }
  return item;
}

async function attachTags(rows: IndexRow[]): Promise<PostIndexItem[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => Number(r.id));
  const tagRows = await db()<{ post_id: unknown; name: unknown }[]>`
    select pt.post_id, t.name
    from public.post_tags pt
    join public.tags t on t.id = pt.tag_id
    where pt.post_id = any(${ids})
  `;
  const tagMap = new Map<number, string[]>();
  for (const row of tagRows) {
    const id = Number(row.post_id);
    const list = tagMap.get(id) ?? [];
    list.push(String(row.name));
    tagMap.set(id, list);
  }
  return rows.map((row) => toIndexItem(row, tagMap.get(Number(row.id)) ?? []));
}

/** 分类页要的两组计数。约 370 条，几 KB。 */
export type TaxonomyCount = { name: string; count: number };
export type TaxonomyCounts = {
  categories: TaxonomyCount[];
  tags: TaxonomyCount[];
  total: number;
};

/**
 * 分类与标签的篇数统计。
 * 原来是把全部 1927 篇索引下发到浏览器再 reduce 出来 —— 一个只显示
 * 「5 个分类 / 363 个标签」的页面因此背了 530 KB 的 hydration payload，
 * domInteractive 拖到 3 秒。计数交给 SQL，页面就只剩这几 KB。
 */
export const loadTaxonomyCounts = createServerFn({ method: "GET" }).handler(
  async (): Promise<TaxonomyCounts> => {
    const sql = db();
    const [catRows, tagRows, totalRows] = await Promise.all([
      sql<{ name: unknown; count: unknown }[]>`
        select category as name, count(*)::int as count
        from public.posts
        where ${sql.unsafe(VISIBLE)} and category <> ''
        group by category
        order by count(*) desc, category
      `,
      sql<{ name: unknown; count: unknown }[]>`
        select t.name as name, count(*)::int as count
        from public.post_tags pt
        join public.tags t on t.id = pt.tag_id
        join public.posts p on p.id = pt.post_id
        where p.published = true and (p.publish_at is null or p.publish_at <= now())
        group by t.name
        order by count(*) desc, t.name
      `,
      sql<{ count: unknown }[]>`
        select count(*)::int as count from public.posts where ${sql.unsafe(VISIBLE)}
      `,
    ]);
    const map = (rows: { name: unknown; count: unknown }[]) =>
      rows.map((r) => ({ name: String(r.name), count: Number(r.count) }));
    return {
      categories: map(catRows),
      tags: map(tagRows),
      total: Number(totalRows[0]?.count ?? 0),
    };
  },
);

const taxonomyPostsInput = z.object({
  category: z.string().trim().max(120).optional(),
  tag: z.string().trim().max(120).optional(),
  offset: z.number().int().min(0).max(5000).optional(),
  limit: z.number().int().min(1).max(120).optional(),
});

export type TaxonomyPosts = { posts: PostIndexItem[]; total: number };

/** 按分类或标签取文章，服务端分页 —— 一个分类底下可能有六百多篇。 */
export const loadPostsByTaxonomy = createServerFn({ method: "GET" })
  .inputValidator((value: z.infer<typeof taxonomyPostsInput>) => taxonomyPostsInput.parse(value))
  .handler(async ({ data }): Promise<TaxonomyPosts> => {
    const sql = db();
    const { category, tag } = data;
    if (!category && !tag) return { posts: [], total: 0 };
    const limit = data.limit ?? 60;
    const offset = data.offset ?? 0;

    const where = category
      ? sql`p.category = ${category}`
      : sql`exists (
            select 1 from public.post_tags pt
            join public.tags t on t.id = pt.tag_id
            where pt.post_id = p.id and t.name = ${tag ?? ""}
          )`;

    const [rows, totalRows] = await Promise.all([
      sql<IndexRow[]>`
        select
          p.id, p.slug, p.title, p.category, p.publish_at, p.created_at,
          p.post_type, p.external_url, p.open_in
        from public.posts p
        where p.published = true and (p.publish_at is null or p.publish_at <= now())
          and ${where}
        order by p.pinned desc, p.created_at desc
        limit ${limit} offset ${offset}
      `,
      sql<{ count: unknown }[]>`
        select count(*)::int as count
        from public.posts p
        where p.published = true and (p.publish_at is null or p.publish_at <= now())
          and ${where}
      `,
    ]);

    return { posts: await attachTags(rows), total: Number(totalRows[0]?.count ?? 0) };
  });

/** 归档页的年月骨架，每格一个计数。几十条。 */
export type ArchiveBucket = { year: string; month: string; count: number };
export type ArchiveSummary = {
  buckets: ArchiveBucket[];
  categories: string[];
  total: number;
};

/**
 * 归档页的年月聚合。
 * 归档默认只展开最新一年、月份还是收起的，真正要渲染的条目寥寥无几，
 * 却曾经为此下发全部 1927 篇（527 KB）。现在骨架由 SQL 聚合，
 * 展开某个月时才去取那个月的文章（loadPostsByMonth）。
 * 日期按 Asia/Shanghai 归月，与页面上显示的日期同一套口径。
 */
export const loadArchiveSummary = createServerFn({ method: "GET" }).handler(
  async (): Promise<ArchiveSummary> => {
    const sql = db();
    const [rows, catRows] = await Promise.all([
      sql<{ year: unknown; month: unknown; count: unknown }[]>`
        select
          to_char(coalesce(publish_at, created_at) at time zone 'Asia/Shanghai', 'YYYY') as year,
          to_char(coalesce(publish_at, created_at) at time zone 'Asia/Shanghai', 'MM') as month,
          count(*)::int as count
        from public.posts
        where ${sql.unsafe(VISIBLE)}
        group by 1, 2
        order by 1 desc, 2 desc
      `,
      sql<{ category: unknown }[]>`
        select distinct category from public.posts
        where ${sql.unsafe(VISIBLE)} and category <> ''
        order by category
      `,
    ]);
    return {
      buckets: rows.map((r) => ({
        year: String(r.year),
        month: String(r.month),
        count: Number(r.count),
      })),
      categories: catRows.map((r) => String(r.category)),
      total: rows.reduce((sum, r) => sum + Number(r.count), 0),
    };
  },
);

const monthInput = z.object({
  year: z.string().regex(/^\d{4}$/),
  month: z.string().regex(/^\d{2}$/),
  category: z.string().trim().max(120).optional(),
});

/** 某年某月的文章，展开时才取。 */
export const loadPostsByMonth = createServerFn({ method: "GET" })
  .inputValidator((value: z.infer<typeof monthInput>) => monthInput.parse(value))
  .handler(async ({ data }): Promise<PostIndexItem[]> => {
    const sql = db();
    const ym = `${data.year}-${data.month}`;
    const rows = await sql<IndexRow[]>`
      select
        id, slug, title, category, publish_at, created_at,
        post_type, external_url, open_in
      from public.posts
      where ${sql.unsafe(VISIBLE)}
        and to_char(coalesce(publish_at, created_at) at time zone 'Asia/Shanghai', 'YYYY-MM') = ${ym}
        and (${data.category ?? null}::text is null or category = ${data.category ?? null})
      order by coalesce(publish_at, created_at) desc
    `;
    return attachTags(rows);
  });

const archiveSearchInput = z.object({
  q: z.string().trim().max(120),
  category: z.string().trim().max(120).optional(),
});

/**
 * 归档页搜索框。原来在浏览器里遍历全量索引，现在交给 SQL，
 * 归档页因此不用再背那 527 KB。限量 200 条 —— 再多也不是「浏览归档」了。
 */
export const searchPostIndex = createServerFn({ method: "GET" })
  .inputValidator((value: z.infer<typeof archiveSearchInput>) => archiveSearchInput.parse(value))
  .handler(async ({ data }): Promise<PostIndexItem[]> => {
    const sql = db();
    const q = data.q.trim();
    if (!q) return [];
    const pattern = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    const rows = await sql<IndexRow[]>`
      select
        p.id, p.slug, p.title, p.category, p.publish_at, p.created_at,
        p.post_type, p.external_url, p.open_in
      from public.posts p
      where p.published = true and (p.publish_at is null or p.publish_at <= now())
        and (${data.category ?? null}::text is null or p.category = ${data.category ?? null})
        and (
          p.title ilike ${pattern}
          or p.category ilike ${pattern}
          or exists (
            select 1 from public.post_tags pt
            join public.tags t on t.id = pt.tag_id
            where pt.post_id = p.id and t.name ilike ${pattern}
          )
        )
      order by coalesce(p.publish_at, p.created_at) desc
      limit 200
    `;
    return attachTags(rows);
  });

/**
 * 文章页的相关推荐：标题与日期就够渲染一行。
 * 外链字段不能省 —— 剪藏类文章的正文是站内 /cdn/… 的离线 HTML，
 * 少了它就会渲染成内部 Link，白白多绕一次重定向。
 */
export type RelatedPost = {
  slug: string;
  title: string;
  publishAt: string;
  type: "markdown" | "html";
  externalUrl?: string;
  openIn?: "_blank" | "_self";
};

type RelatedRow = {
  slug: unknown;
  title: unknown;
  publish_at: unknown;
  created_at: unknown;
  post_type: unknown;
  external_url: unknown;
  open_in: unknown;
};

function toRelatedPost(row: RelatedRow): RelatedPost {
  const isHtml = row.post_type === "html" && !!row.external_url;
  const item: RelatedPost = {
    slug: String(row.slug),
    title: String(row.title ?? ""),
    publishAt: asIso(row.publish_at, row.created_at),
    type: isHtml ? "html" : "markdown",
  };
  if (isHtml) {
    item.externalUrl = String(row.external_url);
    item.openIn = row.open_in === "_self" ? "_self" : "_blank";
  }
  return item;
}

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
    const rows = await sql<RelatedRow[]>`
      with target as (
        select id, category from public.posts where slug = ${data.slug} limit 1
      ),
      target_tags as (
        select pt.tag_id from public.post_tags pt join target on pt.post_id = target.id
      ),
      scored as (
        select
          p.id, p.slug, p.title, p.publish_at, p.created_at,
          p.post_type, p.external_url, p.open_in,
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
      select slug, title, publish_at, created_at, post_type, external_url, open_in
      from scored
      where score > 0
      order by score desc, coalesce(publish_at, created_at) desc
      limit ${limit}
    `;
    return rows.map(toRelatedPost);
  });

const adjacentInput = z.object({ slug: z.string().trim().min(1).max(300) });

/** prev 是时间线上更早的一篇，next 是更新的一篇；到头了就是 null。 */
export type AdjacentPosts = { prev: RelatedPost | null; next: RelatedPost | null };

/**
 * 上一篇 / 下一篇。
 * 比较的是 (发布时间, id) 元组而不是单看时间 —— 剪藏是整批同步进来的，
 * 同一秒里躺着几十篇 publish_at 完全相同的文章，只比时间会一次跳过一大片，
 * 或者两篇互相指向对方原地打转。
 */
export const loadAdjacentPosts = createServerFn({ method: "GET" })
  .inputValidator((value: z.infer<typeof adjacentInput>) => adjacentInput.parse(value))
  .handler(async ({ data }): Promise<AdjacentPosts> => {
    const sql = db();
    const rows = await sql<(RelatedRow & { dir: unknown })[]>`
      with target as (
        select id, coalesce(publish_at, created_at) as ts
        from public.posts where slug = ${data.slug} limit 1
      )
      (
        select 'prev' as dir, p.slug, p.title, p.publish_at, p.created_at,
               p.post_type, p.external_url, p.open_in
        from public.posts p, target
        where p.published = true and (p.publish_at is null or p.publish_at <= now())
          and (coalesce(p.publish_at, p.created_at), p.id) < (target.ts, target.id)
        order by coalesce(p.publish_at, p.created_at) desc, p.id desc
        limit 1
      )
      union all
      (
        select 'next' as dir, p.slug, p.title, p.publish_at, p.created_at,
               p.post_type, p.external_url, p.open_in
        from public.posts p, target
        where p.published = true and (p.publish_at is null or p.publish_at <= now())
          and (coalesce(p.publish_at, p.created_at), p.id) > (target.ts, target.id)
        order by coalesce(p.publish_at, p.created_at) asc, p.id asc
        limit 1
      )
    `;
    const pick = (dir: string) => {
      const row = rows.find((r) => String(r.dir) === dir);
      return row ? toRelatedPost(row) : null;
    };
    return { prev: pick("prev"), next: pick("next") };
  });

/** ⌘K 面板一次要的三组结果。 */
export type SearchHit = {
  slug: string;
  title: string;
  category: string;
  /** 剪藏类文章直接给离线页地址，选中后不必绕一次 /posts/ 重定向。 */
  externalUrl?: string;
  openIn?: "_blank" | "_self";
};

export type SearchResults = {
  posts: SearchHit[];
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
type SearchRow = {
  slug: unknown;
  title: unknown;
  category: unknown;
  post_type: unknown;
  external_url: unknown;
  open_in: unknown;
};

function toSearchHit(row: SearchRow): SearchHit {
  const isHtml = row.post_type === "html" && !!row.external_url;
  const hit: SearchHit = {
    slug: String(row.slug),
    title: String(row.title ?? ""),
    category: String(row.category ?? ""),
  };
  if (isHtml) {
    hit.externalUrl = String(row.external_url);
    hit.openIn = row.open_in === "_self" ? "_self" : "_blank";
  }
  return hit;
}

export const searchPosts = createServerFn({ method: "GET" })
  .inputValidator((value: z.infer<typeof searchInput>) => searchInput.parse(value))
  .handler(async ({ data }): Promise<SearchResults> => {
    const sql = db();
    const q = data.q.trim();

    if (!q) {
      const rows = await sql<SearchRow[]>`
        select slug, title, category, post_type, external_url, open_in
        from public.posts
        where published = true and (publish_at is null or publish_at <= now())
        order by pinned desc, created_at desc
        limit ${SEARCH_POSTS}
      `;
      return { posts: rows.map(toSearchHit), categories: [], tags: [] };
    }

    // ILIKE 的通配符要转义，否则用户输入的 % 会把整库都匹配上。
    const pattern = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;

    const [postRows, categoryRows, tagRows] = await Promise.all([
      sql<SearchRow[]>`
        select slug, title, category, post_type, external_url, open_in
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
      posts: postRows.map(toSearchHit),
      categories: categoryRows.map((row) => String(row.category)),
      tags: tagRows.map((row) => String(row.name)),
    };
  });
