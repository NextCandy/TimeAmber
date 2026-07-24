import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Pencil, Trash2, ExternalLink, Search } from "lucide-react";
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

function PostsList() {
  const { posts, deletePost, setPostStatus } = useAdminStore();
  const [q, setQ] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const filtered = posts.filter((p) => {
    const k = q.trim().toLowerCase();
    if (!k) return true;
    return (
      p.title.toLowerCase().includes(k) ||
      p.slug.toLowerCase().includes(k) ||
      p.category.toLowerCase().includes(k) ||
      p.tags.some((t) => t.toLowerCase().includes(k))
    );
  });

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
            共 {posts.length} 篇{q && `，匹配 ${filtered.length} 篇`}
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

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            没有匹配的文章
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {filtered.map((p) => {
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
