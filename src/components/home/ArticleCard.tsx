import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";

import { formatDateKey } from "@/lib/date";
import { DEFAULT_POST_COVER } from "@/lib/brand";
import { linkRel, linkTarget } from "@/lib/post-link";
import type { HomePost } from "@/lib/home.functions";

/** 首页文章条目。首篇使用真实封面做编辑型主卡，其余文章保持轻量列表。 */
export function ArticleCard({
  post,
  className = "",
  style,
  featured = false,
}: {
  post: HomePost;
  className?: string;
  style?: CSSProperties;
  featured?: boolean;
}) {
  const isExternal = !!post.externalUrl;
  const cover = post.cover || (featured ? DEFAULT_POST_COVER : undefined);

  const meta = (
    <div className="flex items-center gap-2 text-[11px] leading-5 tracking-[0.06em] text-[var(--text-faint)]">
      {post.category && (
        <span className="rounded-full bg-accent-amber-soft px-2 py-0.5 font-medium tracking-wide text-accent-amber transition-colors group-hover:bg-accent-amber group-hover:text-accent-amber-foreground">
          {post.category}
        </span>
      )}
      <time dateTime={post.publishAt} className="font-latin">
        {formatDateKey(post.publishAt)}
      </time>
    </div>
  );

  const inner = featured ? (
    <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-5">
      {cover && (
        <span className="relative block aspect-[16/7] overflow-hidden rounded-xl border border-border/60 bg-muted/30">
          <img
            src={cover}
            alt=""
            loading="eager"
            decoding="async"
            className="article-card-cover h-full w-full object-cover"
          />
          <span className="pointer-events-none absolute inset-0 bg-linear-to-t from-overlay/35 via-transparent to-transparent" />
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-2">
        {meta}
        <h3 className="article-card-title line-clamp-3 min-w-0 text-xl leading-[1.3] font-semibold tracking-[-0.02em] text-foreground transition-colors group-hover:text-primary sm:text-2xl">
          {post.title}
        </h3>
        <span className="mt-1 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
          阅读文章 <span aria-hidden="true">→</span>
        </span>
      </div>
    </div>
  ) : (
    <div className="flex min-w-0 flex-1 items-center gap-4 py-3">
      {cover && (
        <span className="h-20 w-20 shrink-0 rounded-xl border border-border/70 bg-card p-[3px] shadow-[0_2px_8px_-4px_color-mix(in_oklch,var(--foreground)_20%,transparent)]">
          <img
            src={cover}
            alt=""
            loading="lazy"
            decoding="async"
            className="article-card-cover h-full w-full rounded-lg object-cover"
          />
        </span>
      )}
      <h3 className="article-card-title line-clamp-2 min-w-0 text-[17px] leading-[1.45] font-medium tracking-[-0.012em] text-foreground transition-colors [overflow-wrap:anywhere] group-hover:text-primary">
        {post.title}
      </h3>
      <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
        {post.category && (
          <span className="rounded-full bg-accent-amber-soft px-2 py-0.5 text-[11px] leading-4 font-medium tracking-wide text-accent-amber transition-colors group-hover:bg-accent-amber group-hover:text-accent-amber-foreground">
            {post.category}
          </span>
        )}
        <time
          dateTime={post.publishAt}
          className="font-latin text-[11px] leading-5 tracking-[0.06em] text-[var(--text-faint)]"
        >
          {formatDateKey(post.publishAt)}
        </time>
      </div>
    </div>
  );

  const shell = featured
    ? `article-card-shell press-feedback group flex min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-[0_16px_36px_-28px_color-mix(in_oklch,var(--foreground)_40%,transparent)] transition-all duration-300 hover:-translate-y-0.5 hover:border-accent-amber/50 hover:bg-card ${className}`
    : `article-card-shell press-feedback group flex min-w-0 border-t border-border px-2 transition-all duration-300 hover:translate-x-1 hover:bg-accent/35 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:hover:translate-x-0 ${className}`;

  if (isExternal && post.externalUrl) {
    return (
      <a
        href={post.externalUrl}
        target={linkTarget(post.externalUrl)}
        rel={linkRel(post.externalUrl)}
        className={shell}
        style={style}
      >
        {inner}
      </a>
    );
  }

  return (
    <Link
      to="/posts/$slug"
      params={{ slug: post.slug }}
      preload="intent"
      className={shell}
      style={style}
    >
      {inner}
    </Link>
  );
}
