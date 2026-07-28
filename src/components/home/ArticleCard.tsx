import { Link } from "@tanstack/react-router";

import type { HomePost } from "@/lib/home.functions";

function formatDay(iso: string) {
  const d = new Date(iso);
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** 首页文章卡：仅保留标题与发布日期，降低列表高度和首屏数据量。 */
export function ArticleCard({ post, className = "" }: { post: HomePost; className?: string }) {
  const isExternal = !!post.externalUrl;
  const inner = (
    <div className="flex min-w-0 flex-1 items-baseline justify-between gap-4 px-4 py-3 sm:px-5">
      <h3 className="line-clamp-2 min-w-0 text-base leading-snug font-semibold tracking-tight text-foreground transition-colors [overflow-wrap:anywhere] group-hover:text-primary">
        {post.title}
      </h3>
      <time dateTime={post.publishAt} className="font-latin shrink-0 text-xs text-muted-foreground">
        {formatDay(post.publishAt)}
      </time>
    </div>
  );

  const shell = `group flex min-w-0 border border-border bg-card transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${className}`;

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
