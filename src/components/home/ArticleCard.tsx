import { Link } from "@tanstack/react-router";

import { formatDateKey } from "@/lib/date";
import type { HomePost } from "@/lib/home.functions";

/** 首页文章卡：仅保留标题与发布日期，降低列表高度和首屏数据量。 */
export function ArticleCard({ post, className = "" }: { post: HomePost; className?: string }) {
  const isExternal = !!post.externalUrl;
  const inner = (
    // 行会被 auto-rows-fr 拉高到等分高度，内容垂直居中才不会全挤在上沿。
    <div className="flex min-w-0 flex-1 items-center justify-between gap-6 py-3.5">
      <h3 className="line-clamp-2 min-w-0 text-[17px] leading-[1.45] font-medium tracking-[-0.012em] text-foreground transition-colors [overflow-wrap:anywhere] group-hover:text-primary">
        {post.title}
      </h3>
      <time
        dateTime={post.publishAt}
        className="font-latin shrink-0 text-[11px] leading-5 tracking-[0.06em] text-[var(--text-faint)]"
      >
        {formatDateKey(post.publishAt)}
      </time>
    </div>
  );

  const shell = `group flex min-w-0 border-t border-border px-2 transition-colors hover:bg-accent/35 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${className}`;

  if (isExternal) {
    const target = post.openIn ?? "_blank";
    return (
      <a
        href={post.externalUrl}
        target={target}
        rel={target === "_blank" ? "noopener noreferrer" : undefined}
        className={shell}
      >
        {inner}
      </a>
    );
  }

  return (
    <Link to="/posts/$slug" params={{ slug: post.slug }} className={shell}>
      {inner}
    </Link>
  );
}
