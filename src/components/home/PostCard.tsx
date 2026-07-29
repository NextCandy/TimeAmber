import { Link } from "@tanstack/react-router";
import { formatDateKey } from "@/lib/date";
import { linkRel, linkTarget } from "@/lib/post-link";
import type { OpenIn, PostType } from "@/lib/sample-posts";

/**
 * 卡片只渲染标题与日期，所以只要这几个字段 —— 声明成完整 Post 会逼着调用方
 * 下发 excerpt/cover 之类根本用不到的数据（分类页传的就是轻量索引）。
 */
export type PostCardItem = {
  slug: string;
  title: string;
  publishAt: string;
  type?: PostType;
  externalUrl?: string;
  openIn?: OpenIn;
};

export function PostCard({ post }: { post: PostCardItem }) {
  const isHtml = post.type === "html" && post.externalUrl;

  const body = (
    <div className="flex min-w-0 flex-1 items-start justify-between gap-6 py-4">
      <h2 className="line-clamp-2 min-w-0 break-words font-sans text-[17px] leading-[1.45] font-medium tracking-[-0.012em] text-foreground transition-colors [overflow-wrap:anywhere] group-hover:text-primary">
        {post.title}
      </h2>
      <time
        dateTime={post.publishAt}
        className="font-latin mt-0.5 shrink-0 text-[11px] leading-5 tracking-[0.06em] text-[var(--text-faint)]"
      >
        {formatDateKey(post.publishAt)}
      </time>
    </div>
  );

  const className =
    "group flex min-w-0 w-full border-t border-border px-2 transition-colors hover:bg-accent/35 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

  if (isHtml && post.externalUrl) {
    return (
      <a
        href={post.externalUrl}
        target={linkTarget(post.externalUrl)}
        rel={linkRel(post.externalUrl)}
        className={className}
      >
        {body}
      </a>
    );
  }

  return (
    <Link to="/posts/$slug" params={{ slug: post.slug }} className={className}>
      {body}
    </Link>
  );
}
