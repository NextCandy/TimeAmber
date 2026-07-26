import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, ExternalLink, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useAdminStore } from "@/lib/admin-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/posts/")({
  component: PostsList,
});

type StatusFilter = "all" | "published" | "draft";
type SortKey = "new" | "old" | "title" | "reading";

function PostsList() {
  const { posts, deletePost, setPostStatus } = useAdminStore();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState<SortKey>("new");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(posts.map((p) => p.category).filter(Boolean))).sort(),
    [posts],
  );

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    const list = posts.filter((p) => {
      const isPub = (p.status ?? "published") === "published";
      if (status === "published" && !isPub) return false;
      if (status === "draft" && isPub) return false;
      if (cat !== "all" && p.category !== cat) return false;
      if (!k) return true;
      return (
        p.title.toLowerCase().includes(k) ||
        p.slug.toLowerCase().includes(k) ||
        p.category.toLowerCase().includes(k) ||
        p.tags.some((t) => t.toLowerCase().includes(k))
      );
    });
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title, "zh");
      if (sort === "reading") return (b.readingMinutes ?? 0) - (a.readingMinutes ?? 0);
      const cmp = String(a.publishAt).localeCompare(String(b.publishAt));
      return sort === "old" ? cmp : -cmp;
    });
    return sorted;
  }, [posts, q, status, cat, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // 筛选/排序/页大小变化时回到第 1 页。
  useEffect(() => {
    setPage(1);
  }, [q, status, cat, sort, pageSize]);

  function confirmDelete() {
    if (!pendingDelete) return;
    deletePost(pendingDelete);
    toast.success("已删除");
    setPendingDelete(null);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">文章</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            共 {posts.length} 篇 · 筛选后 {filtered.length} 篇 · 第 {safePage}/{pageCount} 页
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/admin/posts/new">
            <Plus className="mr-1.5 h-4 w-4" />
            新建文章
          </Link>
        </Button>
      </header>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索标题、slug、分类、标签…"
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(
            [
              ["all", "全部"],
              ["published", "已发布"],
              ["draft", "草稿"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setStatus(v)}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                status === v
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground"
        >
          <option value="all">全部分类</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground"
        >
          <option value="new">发布时间（新→旧）</option>
          <option value="old">发布时间（旧→新）</option>
          <option value="title">标题</option>
          <option value="reading">阅读时长</option>
        </select>
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          className="ml-auto rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground"
        >
          {[20, 50, 100].map((n) => (
            <option key={n} value={n}>
              每页 {n}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            没有匹配的文章
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {pageItems.map((p) => {
              const isPub = (p.status ?? "published") === "published";
              return (
                <li
                  key={p.slug}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-accent/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{p.title}</p>
                      <span
                        className={
                          isPub
                            ? "rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary"
                            : "rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
                        }
                      >
                        {isPub ? "已发布" : "草稿"}
                      </span>
                      {p.type === "html" && (
                        <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          HTML
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      <span className="font-mono">{p.slug}</span>
                      {" · "}
                      {p.category} · {p.publishAt} · {p.readingMinutes} 分钟
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setPostStatus(p.slug, isPub ? "draft" : "published")
                      }
                      title={isPub ? "改为草稿" : "立即发布"}
                    >
                      {isPub ? "下架" : "发布"}
                    </Button>
                    <Button asChild size="icon" variant="ghost">
                      {p.type === "html" && p.externalUrl ? (
                        <a
                          href={p.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : (
                        <Link
                          to="/posts/$slug"
                          params={{ slug: p.slug }}
                          target="_blank"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      )}
                    </Button>
                    <Button asChild size="icon" variant="ghost">
                      <Link
                        to="/admin/posts/$slug/edit"
                        params={{ slug: p.slug }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setPendingDelete(p.slug)}
                      aria-label="删除"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> 上一页
          </button>
          <span className="text-xs text-muted-foreground">
            第 {safePage} / {pageCount} 页
          </span>
          <button
            type="button"
            disabled={safePage >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            下一页 <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除？</AlertDialogTitle>
            <AlertDialogDescription>
              这会从服务器数据库永久删除该文章，刷新后无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
