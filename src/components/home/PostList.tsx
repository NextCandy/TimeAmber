import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query]);

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
          {visible.length < filtered.length && (
            <button
              type="button"
              className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl border border-border bg-card text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            >
              加载更多（已显示 {visible.length} / {filtered.length}）
            </button>
          )}
        </>
      )}
    </section>
  );
}
