import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { DEFAULT_POST_COVER } from "@/lib/brand";
import { formatDate, type Post } from "@/lib/sample-posts";

export function PostCard({ post }: { post: Post }) {
  const isHtml = post.type === "html" && post.externalUrl;
  const isDefaultCover = !post.cover || post.cover === DEFAULT_POST_COVER;
  const coverUrl = post.cover || DEFAULT_POST_COVER;

  const cover = (
    <div className="relative flex h-36 w-full shrink-0 items-center justify-center overflow-hidden bg-background/70 sm:h-auto sm:w-36 dark:bg-overlay/20">
      <img
        src={coverUrl}
        alt=""
        className={`absolute inset-0 h-full w-full ${
          isDefaultCover ? "object-contain p-5" : "object-cover"
        }`}
        loading="lazy"
        decoding="async"
      />
    </div>
  );

  const body = (
    <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-5 sm:p-6">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {/* 没有标签时原来会 fallback 成 category，和右边那颗 chip 一模一样地并排显示两次 */}
          {post.tags[0] && post.tags[0] !== post.category && (
            <span className="rounded-full border border-border/80 bg-background/40 px-2 py-0.5">
              {post.tags[0]}
            </span>
          )}
          <span className="rounded-full border border-border/80 bg-background/40 px-2 py-0.5">
            {post.category}
          </span>
          {isHtml && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary">
              <ExternalLink className="h-3 w-3" /> HTML
            </span>
          )}
          <span>{formatDate(post.publishAt)}</span>
        </div>

        <h2 className="break-words font-sans text-lg font-semibold leading-snug tracking-tight text-foreground transition-colors [overflow-wrap:anywhere] group-hover:text-primary sm:text-xl">
          {post.title}
        </h2>

        <p className="mt-2 line-clamp-2 break-words text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
          {post.excerpt}
        </p>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{post.readingMinutes} 分钟阅读</span>
        <span className="inline-flex items-center gap-1 text-primary opacity-0 transition-opacity group-hover:opacity-100">
          {isHtml ? "打开页面" : "阅读全文"} <ArrowUpRight className="h-3 w-3" />
        </span>
      </div>
    </div>
  );

  const className =
    "group relative flex min-w-0 w-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-glow sm:flex-row";

  if (isHtml) {
    const target = post.openIn ?? "_blank";
    return (
      <a
        href={post.externalUrl}
        target={target}
        rel={target === "_blank" ? "noopener noreferrer" : undefined}
        className={className}
      >
        {cover}
        {body}
      </a>
    );
  }

  return (
    <Link to="/posts/$slug" params={{ slug: post.slug }} className={className}>
      {cover}
      {body}
    </Link>
  );
}
