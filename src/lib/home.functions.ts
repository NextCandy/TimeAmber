import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db } from "@/lib/db.server";
import { stripMarkdown } from "@/lib/strip-markdown";

/**
 * 首页专用取数。
 *
 * 不复用 __root 的 loadPublicState（那份会把全部 1900+ 篇文章序列化进每个页面），
 * 这里只取首页真正要用的字段与条数，摘要在服务端就压成纯文本 ——
 * 剪藏来的 excerpt 里常带 ![](…)、``` 等 Markdown 语法，直接塞进卡片会原样显示。
 */

export type HomePost = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  publishAt: string;
  readingMinutes: number;
  cover?: string;
  externalUrl?: string;
  openIn?: "_blank" | "_self";
};

export type HomeCategory = { name: string; count: number };

export type HomeData = {
  latest: HomePost[];
  /** 每个分类各自的最新几篇，保证任何一个筛选胶囊点下去都有内容。 */
  byCategory: Record<string, HomePost[]>;
  featured: HomePost[];
  categories: HomeCategory[];
  totalPosts: number;
};

/**
 * 网格一屏展示 9 篇。
 * 分类筛选不能只在「最新 N 篇」里过滤 —— 最新内容高度集中在少数分类，
 * 其余胶囊点下去会全是空状态，所以按分类各取一批，一次查询取回。
 */
const LATEST_LIMIT = 9;
const PER_CATEGORY = 9;
const FEATURED_LIMIT = 8;
const EXCERPT_MAX = 96;

type PostRow = {
  slug: unknown;
  title: unknown;
  excerpt: unknown;
  category: unknown;
  publish_at: unknown;
  created_at: unknown;
  reading_minutes: unknown;
  cover_image: unknown;
  post_type: unknown;
  external_url: unknown;
  open_in: unknown;
};

function toExcerpt(raw: unknown): string {
  const text = stripMarkdown(String(raw ?? ""));
  if (text.length <= EXCERPT_MAX) return text;
  return `${text.slice(0, EXCERPT_MAX - 1).trimEnd()}…`;
}

function toHomePost(row: PostRow): HomePost {
  const isHtml = row.post_type === "html" && !!row.external_url;
  return {
    slug: String(row.slug),
    title: String(row.title ?? ""),
    excerpt: toExcerpt(row.excerpt),
    category: String(row.category ?? ""),
    publishAt: new Date(String(row.publish_at ?? row.created_at)).toISOString(),
    readingMinutes: Number(row.reading_minutes ?? 1),
    cover: row.cover_image ? String(row.cover_image) : undefined,
    externalUrl: isHtml ? String(row.external_url) : undefined,
    openIn: isHtml && row.open_in === "_self" ? "_self" : isHtml ? "_blank" : undefined,
  };
}

const POST_FIELDS = `
  slug, title, excerpt, category, publish_at, created_at,
  reading_minutes, cover_image, post_type, external_url, open_in
`;

export const loadHomeData = createServerFn({ method: "GET" }).handler(
  async (): Promise<HomeData> => {
    const sql = db();

    const [latestRows, byCategoryRows, pinnedRows, popularRows, categoryRows, totalRows] =
      await Promise.all([
        sql<PostRow[]>`
      select ${sql.unsafe(POST_FIELDS)}
      from public.posts
      where published = true
        and coalesce(listed, true) = true
        and (publish_at is null or publish_at <= now())
      order by coalesce(publish_at, created_at) desc
      limit ${LATEST_LIMIT}
    `,
        sql<PostRow[]>`
      select * from (
        select ${sql.unsafe(POST_FIELDS)},
          row_number() over (
            partition by category
            order by coalesce(publish_at, created_at) desc
          ) as rn
        from public.posts
        where published = true
          and coalesce(listed, true) = true
          and (publish_at is null or publish_at <= now())
          and category is not null
          and category <> ''
      ) ranked
      where rn <= ${PER_CATEGORY}
    `,
        sql<PostRow[]>`
      select ${sql.unsafe(POST_FIELDS)}
      from public.posts
      where published = true
        and coalesce(pinned, false) = true
        and (publish_at is null or publish_at <= now())
      order by coalesce(publish_at, created_at) desc
      limit ${FEATURED_LIMIT}
    `,
        // 目前库里没有任何 pinned 文章，精选区用「阅读量高 + 有封面」兜底，
        // 后台把文章设为 pinned 后会自动顶掉兜底内容。
        sql<PostRow[]>`
      select ${sql.unsafe(POST_FIELDS)}
      from public.posts
      where published = true
        and coalesce(listed, true) = true
        and (publish_at is null or publish_at <= now())
      order by coalesce(view_count, 0) desc, coalesce(publish_at, created_at) desc
      limit ${FEATURED_LIMIT}
    `,
        sql<{ category: unknown; count: unknown }[]>`
      select category, count(*)::int as count
      from public.posts
      where published = true
        and coalesce(listed, true) = true
        and category is not null
        and category <> ''
      group by category
      order by count desc
      limit 8
    `,
        sql<{ count: unknown }[]>`
      select count(*)::int as count
      from public.posts
      where published = true and coalesce(listed, true) = true
    `,
      ]);

    const featured = [...pinnedRows.map(toHomePost)];
    const seen = new Set(featured.map((post) => post.slug));
    for (const row of popularRows) {
      if (featured.length >= FEATURED_LIMIT) break;
      const post = toHomePost(row);
      if (seen.has(post.slug)) continue;
      seen.add(post.slug);
      featured.push(post);
    }

    const byCategory: Record<string, HomePost[]> = {};
    for (const row of byCategoryRows) {
      const post = toHomePost(row);
      (byCategory[post.category] ??= []).push(post);
    }

    return {
      latest: latestRows.map(toHomePost),
      byCategory,
      featured,
      categories: categoryRows.map((row) => ({
        name: String(row.category),
        count: Number(row.count),
      })),
      totalPosts: Number(totalRows[0]?.count ?? 0),
    };
  },
);

/* ── 订阅 ───────────────────────────────────────────────────────── */

const subscribeInput = z.object({
  email: z.string().trim().min(3).max(200).email(),
});

export type SubscribeResult = { status: "ok" | "duplicate" };

// 进程内粗粒度限流：挡住脚本刷接口，正常用户碰不到。
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
let windowStartedAt = 0;
let windowCount = 0;

export const subscribeEmail = createServerFn({ method: "POST" })
  .inputValidator((value: z.infer<typeof subscribeInput>) => subscribeInput.parse(value))
  .handler(async ({ data }): Promise<SubscribeResult> => {
    const now = Date.now();
    if (now - windowStartedAt > RATE_WINDOW_MS) {
      windowStartedAt = now;
      windowCount = 0;
    }
    windowCount += 1;
    if (windowCount > RATE_MAX) {
      throw new Error("订阅请求过于频繁，请稍后再试");
    }

    const email = data.email.trim().toLowerCase();
    const rows = await db()`
      insert into public.subscribers (email, source)
      values (${email}, 'home')
      on conflict do nothing
      returning id
    `;

    return { status: rows.length > 0 ? "ok" : "duplicate" };
  });
