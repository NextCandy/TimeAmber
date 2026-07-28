import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";

import { DEFAULT_POST_COVER } from "@/lib/brand";
import { formatChineseDate } from "@/lib/date";
import type { HomePost } from "@/lib/home.functions";

function coverDetails(title: string) {
  let hash = 0;
  for (const character of title) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  return {
    label: Array.from(title).slice(0, 10).join(""),
    style: {
      "--cover-line": `${24 + (hash % 53)}%`,
      "--cover-angle": `${(hash % 25) - 12}deg`,
    } as CSSProperties,
  };
}

/** 首页文章卡：封面、完整日期与标题组成无边框的纵向编辑卡片。 */
export function ArticleCard({ post, className = "" }: { post: HomePost; className?: string }) {
  const isExternal = !!post.externalUrl;
  const customCover = post.cover?.trim();
  const hasCustomCover = !!customCover && customCover !== DEFAULT_POST_COVER;
  const placeholder = coverDetails(post.title);
  const inner = (
    <>
      <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
        {hasCustomCover ? (
          <img
            src={customCover}
            alt={post.title}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div
            className="editorial-cover flex h-full w-full items-end p-5 text-white"
            style={placeholder.style}
          >
            <span className="relative z-10 max-w-[14ch] text-lg leading-tight font-semibold tracking-tight">
              {placeholder.label}
            </span>
          </div>
        )}
      </div>
      <time
        dateTime={post.publishAt}
        className="font-latin mt-5 block text-sm leading-[1.38] font-normal text-foreground"
      >
        {formatChineseDate(post.publishAt)}
      </time>
      <h3 className="mt-5 line-clamp-2 min-w-0 text-lg leading-[1.38] font-semibold tracking-[-0.012em] text-foreground decoration-primary decoration-2 underline-offset-4 [overflow-wrap:anywhere] group-hover:underline">
        {post.title}
      </h3>
    </>
  );

  const shell = `group flex min-w-0 flex-col focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${className}`;

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
