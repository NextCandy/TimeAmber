import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { FolderTree, Tag, X } from "lucide-react";
import { PostCard } from "@/components/home/PostCard";
import { useAdminStore } from "@/lib/admin-store";
import { isPublished } from "@/lib/sample-posts";

type CategorySearch = { c?: string; tag?: string };

export const Route = createFileRoute("/categories")({
  validateSearch: (search: Record<string, unknown>): CategorySearch => ({
    c: typeof search.c === "string" && search.c ? search.c : undefined,
    tag: typeof search.tag === "string" && search.tag ? search.tag : undefined,
  }),
  head: () => ({
    meta: [
      { title: "分类 · TimeAmber" },
      { name: "description", content: "按分类与标签浏览 TimeAmber 的全部文章。" },
      { property: "og:title", content: "分类 · TimeAmber" },
      { property: "og:description", content: "按分类与标签浏览全部文章。" },
    ],
  }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const { c: activeCategory, tag: activeTag } = Route.useSearch();
  const { posts } = useAdminStore();

  const published = useMemo(() => posts.filter(isPublished), [posts]);

  const { categoryCounts, tagCounts } = useMemo(() => {
    const categories = new Map<string, number>();
    const tags = new Map<string, number>();
    for (const post of published) {
      if (post.category) {
        categories.set(post.category, (categories.get(post.category) ?? 0) + 1);
      }
      for (const tag of post.tags) {
        tags.set(tag, (tags.get(tag) ?? 0) + 1);
      }
    }
    const byCount = (a: [string, number], b: [string, number]) =>
      b[1] - a[1] || a[0].localeCompare(b[0]);
    return {
      categoryCounts: [...categories.entries()].sort(byCount),
      tagCounts: [...tags.entries()].sort(byCount),
    };
  }, [published]);

  const filtered = useMemo(() => {
    if (activeCategory) {
      return published.filter((p) => p.category === activeCategory);
    }
    if (activeTag) {
      return published.filter((p) => p.tags.includes(activeTag));
    }
    return [];
  }, [published, activeCategory, activeTag]);

  const activeLabel = activeCategory ?? activeTag;

  return (
    <div className="mx-auto max-w-4xl px-6 pt-16 pb-16">
      <header className="mb-10">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Categories
        </p>
        <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">分类</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {activeLabel
            ? `「${activeLabel}」下共 ${filtered.length} 篇文章。`
            : `${categoryCounts.length} 个分类、${tagCounts.length} 个标签，共 ${published.length} 篇文章。`}
        </p>
      </header>

      {activeLabel ? (
        <>
          <Link
            to="/categories"
            search={{}}
            className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <X className="h-3 w-3" />
            清除筛选：{activeLabel}
          </Link>

          {filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/80 bg-card/40 p-10 text-center text-sm text-muted-foreground">
              这个{activeCategory ? "分类" : "标签"}下还没有文章。
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {filtered.map((post) => (
                <PostCard key={post.slug} post={post} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-10">
          <section>
            <h2 className="mb-4 inline-flex items-center gap-2 font-display text-lg font-semibold">
              <FolderTree className="h-4 w-4 text-primary" /> 按分类
            </h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {categoryCounts.map(([name, count]) => (
                <li key={name}>
                  <Link
                    to="/categories"
                    search={{ c: name }}
                    className="group flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-glow"
                  >
                    <span className="min-w-0 truncate font-medium transition-colors group-hover:text-primary">
                      {name}
                    </span>
                    <span className="ml-3 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-4 inline-flex items-center gap-2 font-display text-lg font-semibold">
              <Tag className="h-4 w-4 text-primary" /> 按标签
            </h2>
            <ul className="flex flex-wrap gap-2">
              {tagCounts.map(([name, count]) => (
                <li key={name}>
                  <Link
                    to="/categories"
                    search={{ tag: name }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {name}
                    <span className="text-xs tabular-nums opacity-60">{count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
