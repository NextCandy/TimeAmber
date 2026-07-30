import { createServerFn } from "@tanstack/react-start";

import { db } from "@/lib/db.server";

/**
 * 首页专用取数。
 *
 * 与归档 / 分类 / 搜索一样自己按需取数（见 public-posts.functions.ts），
 * 这里只取首页要用的字段与条数，摘要在服务端就压成纯文本 ——
 * 剪藏来的 excerpt 里常带 ![](…)、``` 等 Markdown 语法，直接塞进卡片会原样显示。
 */

export type HomePost = {
  slug: string;
  title: string;
  category: string;
  publishAt: string;
  cover?: string;
  externalUrl?: string;
  openIn?: "_blank" | "_self";
};

export type HomeData = {
  latest: HomePost[];
  totalPosts: number;
  totalTags: number;
  totalCategories: number;
};

// 桌面两列，最多九行。实际显示几篇由 styles.css 里 .home-list 的视口高度断点决定
// （矮屏隐藏尾部），这里固定下发上限那一档 —— 多出来的几篇只占几百字节，
// 换来的是任何屏幕都既填满一屏又不出滚动条。改之前先看 ArticleSection 上的说明。
const LATEST_LIMIT = 18;

type PostRow = {
  slug: unknown;
  title: unknown;
  category: unknown;
  publish_at: unknown;
  created_at: unknown;
  post_type: unknown;
  external_url: unknown;
  open_in: unknown;
  cover_image: unknown;
};

function toHomePost(row: PostRow): HomePost {
  const isHtml = row.post_type === "html" && !!row.external_url;
  return {
    slug: String(row.slug),
    title: String(row.title ?? ""),
    category: String(row.category ?? ""),
    publishAt: new Date(String(row.publish_at ?? row.created_at)).toISOString(),
    cover: row.cover_image ? String(row.cover_image) : undefined,
    externalUrl: isHtml ? String(row.external_url) : undefined,
    openIn: isHtml && row.open_in === "_self" ? "_self" : isHtml ? "_blank" : undefined,
  };
}

export const loadHomeData = createServerFn({ method: "GET" }).handler(
  async (): Promise<HomeData> => {
    const sql = db();

    const [latestRows, statsRows] = await Promise.all([
      sql<PostRow[]>`
        select
          slug, title, category, publish_at, created_at, post_type, external_url, open_in,
          cover_image
        from public.posts
        where published = true
          and coalesce(listed, true) = true
          and (publish_at is null or publish_at <= now())
        order by coalesce(publish_at, created_at) desc
        limit ${LATEST_LIMIT}
      `,
      sql<{ posts: unknown; tags: unknown; categories: unknown }[]>`
        select
          count(distinct p.id)::int as posts,
          count(distinct pt.tag_id)::int as tags,
          count(distinct nullif(p.category, ''))::int as categories
        from public.posts p
        left join public.post_tags pt on pt.post_id = p.id
        where p.published = true
          and coalesce(p.listed, true) = true
          and (p.publish_at is null or p.publish_at <= now())
      `,
    ]);

    return {
      latest: latestRows.map(toHomePost),
      totalPosts: Number(statsRows[0]?.posts ?? 0),
      totalTags: Number(statsRows[0]?.tags ?? 0),
      totalCategories: Number(statsRows[0]?.categories ?? 0),
    };
  },
);
