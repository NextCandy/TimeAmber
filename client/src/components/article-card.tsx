import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { prefetchPost, type PostMeta } from "@/lib/api";
import { preloadMarkdownRenderer } from "@/lib/markdown-loader";
import { ArrowRight, Pin } from "lucide-react";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

function getInitial(title: string): string {
  if (!title) return "·";
  const ch = title.trim().charAt(0);
  return ch || "·";
}

export function ArticleCard({ post }: { post: PostMeta }) {
  const cover = post.coverImage || "";
  const gradient = post.coverColor || "from-gray-500/20 to-gray-600/20";

  const warmPost = () => {
    prefetchPost(post.slug);
    preloadMarkdownRenderer();
    void import("@/pages/post");
  };

  return (
    <Link
      href={`/posts/${post.slug}`}
      className="group block min-w-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      onMouseEnter={warmPost}
      onFocus={warmPost}
      onTouchStart={warmPost}
    >
      <article className="relative overflow-hidden rounded-md border border-border/25 bg-background/25 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[2px] hover:border-border/60 hover:bg-card/35 hover:shadow-[0_12px_34px_oklch(0_0_0_/_14%)]">
        <div className="flex flex-col sm:flex-row">
          <div className="relative shrink-0 overflow-hidden border-b border-border/20 sm:w-[156px] sm:border-b-0 sm:border-r lg:w-[176px]">
            <div className="aspect-[16/9] sm:h-full sm:aspect-auto sm:min-h-[132px]">
              {cover ? (
                <img
                  src={cover}
                  alt={post.title}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
                />
              ) : (
                <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradient}`}>
                  <span className="select-none text-[44px] font-semibold tracking-[-0.04em] text-foreground/30 lg:text-[52px]">
                    {getInitial(post.title)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col p-[16px] sm:p-[18px] lg:p-[20px]">
            <div className="mb-[8px] flex min-h-[22px] max-w-full flex-wrap items-center gap-[8px] overflow-hidden">
              {post.pinned && (
                <Badge variant="outline" className="h-[24px] shrink-0 rounded-[4px] border-amber-500/30 bg-amber-500/10 px-[8px] text-[12px] font-normal tracking-normal text-amber-500/90">
                  <Pin className="h-[12px] w-[12px]" />
                  置顶
                </Badge>
              )}
              {post.tags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="secondary" className="h-[24px] max-w-[120px] shrink-0 truncate rounded-[4px] px-[8px] text-[12px] font-normal tracking-normal">
                  {tag}
                </Badge>
              ))}
              <span className="shrink-0 text-[12px] text-muted-foreground/60">{formatDate(post.createdAt)}</span>
            </div>
            <h2 className="line-clamp-2 text-[19px] font-semibold leading-snug tracking-[-0.015em] text-foreground transition-colors duration-200 group-hover:text-foreground/90 lg:text-[21px]">
              {post.title}
            </h2>
            <p className="mt-[8px] line-clamp-2 text-[14px] leading-[1.7] text-muted-foreground">
              {post.excerpt}
            </p>
            <div className="mt-auto flex min-h-[32px] shrink-0 items-center gap-[6px] pt-[12px] text-[13px] text-muted-foreground/55 transition-colors duration-200 group-hover:text-foreground">
              <span>阅读全文</span>
              <ArrowRight className="h-[14px] w-[14px] transition-transform duration-200 group-hover:translate-x-[3px]" />
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}
