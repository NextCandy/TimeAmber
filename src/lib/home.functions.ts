import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db } from "@/lib/db.server";

/** 首页只取渲染所需的轻量公开索引，不把正文或全量文章下发给浏览器。 */
export type HomePost = {
  slug: string;
  title: string;
  category: string;
  tags: string[];
  excerpt?: string;
  publishAt: string;
  cover?: string;
  externalUrl?: string;
  openIn?: "_blank" | "_self";
};

export type TaxonomySummary = { name: string; count: number };
export type PublishCalendarDay = { date: string; count: number };

export type HomeData = {
  latest: HomePost[];
  totalPosts: number;
  totalTags: number;
  totalCategories: number;
  friendsCount: number;
  latestUpdatedAt?: string;
  page: number;
  pageSize: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  calendar: PublishCalendarDay[];
  calendarYear: number;
  calendarMonth: number;
};

export const HOME_PAGE_SIZE = 8;

export function normalizeHomePage(value: unknown) {
  const page = typeof value === "number" ? value : Number(value);
  return Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1;
}

export function homePageMeta(requestedPage: unknown, totalPosts: number) {
  const safeTotalPosts = Number.isFinite(totalPosts) ? Math.max(0, Math.floor(totalPosts)) : 0;
  const totalPages = Math.max(1, Math.ceil(safeTotalPosts / HOME_PAGE_SIZE));
  const page = Math.min(normalizeHomePage(requestedPage), totalPages);
  return {
    page,
    pageSize: HOME_PAGE_SIZE,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
  };
}

const homeInput = z.object({
  page: z.number().int().min(1).max(10_000).catch(1),
});

type PostRow = {
  slug: unknown;
  title: unknown;
  excerpt: unknown;
  category: unknown;
  publish_at: unknown;
  created_at: unknown;
  post_type: unknown;
  external_url: unknown;
  open_in: unknown;
  cover_image: unknown;
  tags: unknown;
};

function plainExcerpt(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 180) : undefined;
}

function rowTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean).slice(0, 6);
  if (typeof value === "string")
    return value
      .replace(/[{}]/g, "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 6);
  return [];
}

function toHomePost(row: PostRow): HomePost {
  const isHtml = row.post_type === "html" && !!row.external_url;
  return {
    slug: String(row.slug),
    title: String(row.title ?? ""),
    category: String(row.category ?? ""),
    tags: rowTags(row.tags),
    excerpt: plainExcerpt(row.excerpt),
    publishAt: new Date(String(row.publish_at ?? row.created_at)).toISOString(),
    cover: row.cover_image ? String(row.cover_image) : undefined,
    externalUrl: isHtml ? String(row.external_url) : undefined,
    openIn: isHtml && row.open_in === "_self" ? "_self" : isHtml ? "_blank" : undefined,
  };
}

const visibleSql = (sql: ReturnType<typeof db>) => sql`p.published = true
  and coalesce(p.listed, true) = true
  and (p.publish_at is null or p.publish_at <= now())`;

export const loadHomeData = createServerFn({ method: "GET" })
  .validator((value: z.infer<typeof homeInput>) => homeInput.parse(value))
  .handler(async ({ data }): Promise<HomeData> => {
    const sql = db();
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;

    const statsRows = await sql<
      { posts: unknown; tags: unknown; categories: unknown; latest: unknown }[]
    >`
      select
        count(distinct p.id)::int as posts,
        count(distinct pt.tag_id)::int as tags,
        count(distinct nullif(p.category, ''))::int as categories,
        max(coalesce(p.publish_at, p.created_at)) as latest
      from public.posts p
      left join public.post_tags pt on pt.post_id = p.id
      where ${visibleSql(sql)}
    `;

    const totalPosts = Number(statsRows[0]?.posts ?? 0);
    const pageMeta = homePageMeta(data.page, totalPosts);
    const offset = (pageMeta.page - 1) * HOME_PAGE_SIZE;

    const [latestRows, friends, calendar] = await Promise.all([
      sql<PostRow[]>`
        select
          p.slug, p.title, p.excerpt, p.category, p.publish_at, p.created_at,
          p.post_type, p.external_url, p.open_in, p.cover_image,
          coalesce(array_agg(distinct t.name) filter (where t.name is not null), '{}') as tags
        from public.posts p
        left join public.post_tags pt on pt.post_id = p.id
        left join public.tags t on t.id = pt.tag_id
        where ${visibleSql(sql)}
        group by p.id
        order by coalesce(p.publish_at, p.created_at) desc, p.id desc
        limit ${HOME_PAGE_SIZE}
        offset ${offset}
      `,
      sql<{ count: unknown }[]>`
        select count(*)::int as count from public.friends where published = true
      `,
      sql<{ date: unknown; count: unknown }[]>`
        select
          to_char(coalesce(p.publish_at, p.created_at) at time zone 'Asia/Shanghai', 'YYYY-MM-DD') as date,
          count(*)::int as count
        from public.posts p
        where ${visibleSql(sql)}
          and coalesce(p.publish_at, p.created_at) >= ${monthStart}::date
          and coalesce(p.publish_at, p.created_at) < (${monthStart}::date + interval '1 month')
        group by 1 order by 1
      `,
    ]);

    return {
      latest: latestRows.map(toHomePost),
      totalPosts,
      totalTags: Number(statsRows[0]?.tags ?? 0),
      totalCategories: Number(statsRows[0]?.categories ?? 0),
      friendsCount: Number(friends[0]?.count ?? 0),
      latestUpdatedAt: statsRows[0]?.latest
        ? new Date(String(statsRows[0].latest)).toISOString()
        : undefined,
      ...pageMeta,
      calendar: calendar.map((row) => ({ date: String(row.date), count: Number(row.count) })),
      calendarYear: year,
      calendarMonth: month,
    };
  });

const calendarInput = z.object({
  year: z.number().int().min(2000).max(2200),
  month: z.number().int().min(1).max(12),
});

/** 发布日历按月聚合，点击切换月份时只返回日期和数量。 */
export const loadPublishCalendar = createServerFn({ method: "GET" })
  .validator((value: z.infer<typeof calendarInput>) => calendarInput.parse(value))
  .handler(async ({ data }): Promise<PublishCalendarDay[]> => {
    const sql = db();
    const monthStart = `${data.year}-${String(data.month).padStart(2, "0")}-01`;
    const rows = await sql<{ date: unknown; count: unknown }[]>`
      select
        to_char(coalesce(p.publish_at, p.created_at) at time zone 'Asia/Shanghai', 'YYYY-MM-DD') as date,
        count(*)::int as count
      from public.posts p
      where p.published = true
        and coalesce(p.listed, true) = true
        and (p.publish_at is null or p.publish_at <= now())
        and coalesce(p.publish_at, p.created_at) >= ${monthStart}::date
        and coalesce(p.publish_at, p.created_at) < (${monthStart}::date + interval '1 month')
      group by 1 order by 1
    `;
    return rows.map((row) => ({ date: String(row.date), count: Number(row.count) }));
  });
