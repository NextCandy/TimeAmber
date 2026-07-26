import { useEffect, useMemo, useRef, useState } from "react";
import type { Post } from "@/lib/sample-posts";
import { PostCard } from "./PostCard";

const PAGE_SIZE = 12;

export function PostList({ posts, query = "" }: { posts: Post[]; query?: string }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter((p) => {
      return (
        p.title.toLowerCase().includes(q) ||
        p.excerpt.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [posts, query]);
  const visible = filtered.slice(0, visibleCount);
  const hasMore = visible.length < filtered.length;
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query]);

  // 触底自动加载更多：哨兵进入视口（提前 600px）就再显示一批。
  // 依赖里带 visibleCount，使每次加载后重新观察、连续触发直到哨兵离开视口；
  // 下方按钮保留为可访问性 / 无 IO 环境的回退。
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisibleCount((c) => c + PAGE_SIZE);
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, visibleCount, filtered.length]);

  return (
    <section className="min-w-0">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {query ? "Search Results" : "Latest Posts"}
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">
            {query ? `匹配 “${query}”` : "最新文章"}
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {query ? `${filtered.length} / ${posts.length}` : `${posts.length} 篇`}
        </p>
      </header>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-card/40 p-10 text-center text-sm text-muted-foreground">
          没有匹配到「{query}」的文章，试试换个关键词。
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {visible.map((p) => (
              <PostCard key={p.slug} post={p} />
            ))}
          </div>
          {hasMore && (
            <>
              <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
              <button
                type="button"
                className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl border border-border bg-card text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              >
                加载更多（已显示 {visible.length} / {filtered.length}）
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
