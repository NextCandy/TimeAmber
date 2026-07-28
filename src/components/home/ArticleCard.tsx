import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";

import type { HomePost } from "@/lib/home.functions";

function formatDay(iso: string) {
  const d = new Date(iso);
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * 首页文章卡：封面在上、正文在下。
 * priority 用于首卡强调（琥珀/主色描边），与普通卡区分。
 */
export function ArticleCard({
  post,
  priority = false,
  className = "",
}: {
  post: HomePost;
  priority?: boolean;
  className?: string;
}) {
  const isExternal = !!post.externalUrl;

  const inner: ReactNode = (
    <>
      <div className="cover-gradient relative h-[200px] w-full shrink-0 overflow-hidden">
        {post.cover && (
          <img
            src={post.cover}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-primary">
          {post.category}
          {isExternal && <ExternalLink className="h-3 w-3" aria-hidden="true" />}
        </p>

        <h3 className="line-clamp-2 text-lg leading-[1.45] font-bold tracking-tight text-foreground transition-colors [overflow-wrap:anywhere] group-hover:text-primary">
          {post.title}
        </h3>

        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
          {post.excerpt}
        </p>

        <p className="font-latin mt-auto text-xs text-[var(--text-faint)]">
          {formatDay(post.publishAt)} · {post.readingMinutes} 分钟阅读
        </p>
      </div>
    </>
  );

  const shell = `group flex min-w-0 flex-col overflow-hidden rounded-2xl bg-card transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-glow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
    priority ? "border-2 border-primary" : "border border-border"
  } ${className}`;

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
