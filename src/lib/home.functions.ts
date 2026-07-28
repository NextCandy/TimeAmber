import { createServerFn } from "@tanstack/react-start";

import { db } from "@/lib/db.server";
import { stripMarkdown } from "@/lib/strip-markdown";

/**
 * 首页专用取数。
 *
 * 不复用 __root 的 loadPublicState（那份会把全部文章序列化进每个页面），
 * 这里只取首页要用的字段与条数，摘要在服务端就压成纯文本 ——
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

export type HomeData = {
  latest: HomePost[];
  totalPosts: number;
};

const LATEST_LIMIT = 9;
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

export const loadHomeData = createServerFn({ method: "GET" }).handler(
  async (): Promise<HomeData> => {
    const sql = db();

    const [latestRows, totalRows] = await Promise.all([
      sql<PostRow[]>`
        select
          slug, title, excerpt, category, publish_at, created_at,
          reading_minutes, cover_image, post_type, external_url, open_in
        from public.posts
        where published = true
          and coalesce(listed, true) = true
          and (publish_at is null or publish_at <= now())
        order by coalesce(publish_at, created_at) desc
        limit ${LATEST_LIMIT}
      `,
      sql<{ count: unknown }[]>`
        select count(*)::int as count
        from public.posts
        where published = true and coalesce(listed, true) = true
      `,
    ]);

    return {
      latest: latestRows.map(toHomePost),
      totalPosts: Number(totalRows[0]?.count ?? 0),
    };
  },
);
