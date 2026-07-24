import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, FolderTree, Tags, Users, Plus } from "lucide-react";
import { useAdminStore } from "@/lib/admin-store";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Dashboard,
});

function Dashboard() {
  const { posts, categories, tags, friends } = useAdminStore();

  const stats = [
    { label: "文章", value: posts.length, icon: FileText, to: "/admin/posts" },
    {
      label: "分类",
      value: categories.length,
      icon: FolderTree,
      to: "/admin/categories",
    },
    { label: "标签", value: tags.length, icon: Tags, to: "/admin/tags" },
    { label: "友链", value: friends.length, icon: Users, to: "/admin/friends" },
  ] as const;

  const recent = [...posts].sort((a, b) => (a.publishAt < b.publishAt ? 1 : -1)).slice(0, 5);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">概览</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            站点的整体状态。数据与改动均来自服务器数据库。
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/admin/posts/new">
            <Plus className="mr-1.5 h-4 w-4" />
            写新文章
          </Link>
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            to={s.to}
            className="group relative overflow-hidden rounded-xl border border-border/70 bg-linear-to-br from-card via-card to-card/60 p-5 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-glow"
          >
            <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-primary/5 blur-2xl transition-all group-hover:bg-primary/15" />
            <div className="relative flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {s.label}
              </span>
              <s.icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
            <p className="relative mt-3 font-display text-3xl font-semibold tabular-nums">
              {s.value}
            </p>
          </Link>
        ))}
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">最近文章</h2>
          <Link to="/admin/posts" className="text-xs text-primary hover:underline">
            查看全部 →
          </Link>
        </div>
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
          {recent.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">还没有文章。</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {recent.map((p) => (
                <li key={p.slug}>
                  <Link
                    to="/admin/posts/$slug/edit"
                    params={{ slug: p.slug }}
                    className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-accent/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {p.category} · {p.publishAt}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {p.readingMinutes} 分钟
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
