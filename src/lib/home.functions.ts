import { createServerFn } from "@tanstack/react-start";

import { db } from "@/lib/db.server";

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
  publishAt: string;
  cover?: string;
  externalUrl?: string;
  openIn?: "_blank" | "_self";
};

export type HomeData = {
  latest: HomePost[];
  totalPosts: number;
};

const LATEST_LIMIT = 18;

type PostRow = {
  slug: unknown;
  title: unknown;
  publish_at: unknown;
  created_at: unknown;
  post_type: unknown;
  cover_image: unknown;
  external_url: unknown;
  open_in: unknown;
};

function toHomePost(row: PostRow): HomePost {
  const isHtml = row.post_type === "html" && !!row.external_url;
  return {
    slug: String(row.slug),
    title: String(row.title ?? ""),
    publishAt: new Date(String(row.publish_at ?? row.created_at)).toISOString(),
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
          slug, title, publish_at, created_at, post_type, cover_image, external_url, open_in
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
