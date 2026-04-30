import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { prefetchPost, type PostMeta } from "@/lib/api";
import { preloadMarkdownRenderer } from "@/lib/markdown-loader";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

export function ArticleCard({ post }: { post: PostMeta }) {
  const warmPost = () => {
    prefetchPost(post.slug);
    preloadMarkdownRenderer();
    void import("@/pages/post");
  };

  return (
    <Link href={`/posts/${post.slug}`} className="group block" onMouseEnter={warmPost} onFocus={warmPost} onTouchStart={warmPost}>
      <article className="relative h-[190px] overflow-hidden rounded-md border border-border/40 bg-card/30 backdrop-blur-sm transition-all duration-300 hover:border-border/70 hover:bg-card/50 hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)] hover:-translate-y-[2px] sm:h-[172px] lg:h-[184px]">
        <div className="flex h-full min-h-0 flex-col sm:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-[16px] sm:p-[20px] lg:p-[24px]">
            <div className="mb-[8px] flex min-h-[22px] max-w-full flex-nowrap items-center gap-[8px] overflow-hidden">
              {post.pinned && (
                <Badge variant="outline" className="h-[22px] shrink-0 rounded-[4px] px-[8px] text-[12px] font-normal tracking-normal border-amber-500/30 text-amber-500/80 bg-amber-500/10">
                  置顶
                </Badge>
              )}
              {post.tags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="secondary" className="h-[22px] max-w-[120px] shrink-0 rounded-[4px] px-[8px] text-[12px] font-normal tracking-normal truncate">
                  {tag}
                </Badge>
              ))}
              <span className="shrink-0 text-[12px] text-muted-foreground/60">{formatDate(post.createdAt)}</span>
            </div>

            <h2 className="line-clamp-2 text-[18px] font-semibold tracking-[-0.01em] leading-snug text-foreground transition-colors duration-200 group-hover:text-foreground/90 lg:text-[20px]">
              {post.title}
            </h2>
            <p className="mt-[8px] line-clamp-2 text-[14px] leading-[1.7] text-muted-foreground">
              {post.excerpt}
            </p>

            <div className="mt-auto flex shrink-0 items-center gap-[6px] pt-[10px] text-[13px] text-muted-foreground/50 transition-colors duration-200 group-hover:text-muted-foreground">
              <span>阅读全文</span>
              <svg className="h-[14px] w-[14px] transition-transform duration-200 group-hover:translate-x-[3px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}
