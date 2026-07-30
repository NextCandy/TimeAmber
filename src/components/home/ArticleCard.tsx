import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";

import { formatDateKey } from "@/lib/date";
import { linkRel, linkTarget } from "@/lib/post-link";
import type { HomePost } from "@/lib/home.functions";

/** 首页文章卡：仅保留标题与发布日期，降低列表高度和首屏数据量。 */
export function ArticleCard({
  post,
  className = "",
  style,
}: {
  post: HomePost;
  className?: string;
  style?: CSSProperties;
}) {
  const isExternal = !!post.externalUrl;
  const inner = (
    // 行会被 auto-rows-fr 拉高到等分高度，内容垂直居中才不会全挤在上沿。
    <div className="flex min-w-0 flex-1 items-center gap-4 py-3">
      {post.cover && (
        <span className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border/70 bg-card">
          <img
            src={post.cover}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
          />
        </span>
      )}
      <h3 className="line-clamp-2 min-w-0 text-[17px] leading-[1.45] font-medium tracking-[-0.012em] text-foreground transition-colors [overflow-wrap:anywhere] group-hover:text-primary">
        {post.title}
      </h3>
      {/* 分类与日期竖排收在右侧：行高由 auto-rows-fr 等分（约 90px），
          两行小字塞得下，而在标题下方另起一行会顶破「首页刚好一屏」的前提。 */}
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

  const shell = `group flex min-w-0 border-t border-border px-2 transition-all hover:translate-x-1 hover:bg-accent/35 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:hover:translate-x-0 ${className}`;

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
    <Link to="/posts/$slug" params={{ slug: post.slug }} className={shell} style={style}>
      {inner}
    </Link>
  );
}
