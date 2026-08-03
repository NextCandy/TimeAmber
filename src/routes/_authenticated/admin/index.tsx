import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, FolderTree, Tags, Users, Plus } from "lucide-react";
import { useAdminStore } from "@/lib/admin-store";
import { loadPublicVisitTrend } from "@/lib/state.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/")({
  // 概览页原本只有文章/分类/标签/友链四个计数，看不到站点有没有人来。
  loader: async () => ({
    visitTrend: await loadPublicVisitTrend().catch(() => []),
  }),
  component: Dashboard,
});

function Dashboard() {
  const { visitTrend } = Route.useLoaderData();
  const { posts, categories, tags, friends, hydrated } = useAdminStore();

  const hasTrend = visitTrend.length > 0;
  const total7d = visitTrend.reduce((sum, d) => sum + d.count, 0);
  const maxPv = Math.max(...visitTrend.map((d) => d.count), 1);

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

  const visibleStats = hydrated ? stats : stats.map((s) => ({ ...s, value: "—" }));
  const recent = hydrated
    ? [...posts].sort((a, b) => (a.publishAt < b.publishAt ? 1 : -1)).slice(0, 5)
    : [];

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
        {visibleStats.map((s) => (
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
          <h2 className="font-display text-lg font-semibold">近 7 天访问</h2>
          <Link to="/admin/analytics" className="text-xs text-primary hover:underline">
            详细统计 →
          </Link>
        </div>
        <div className="rounded-xl border border-border/70 bg-card/40 p-5">
          {hasTrend ? (
            <>
              <div className="mb-3 flex items-baseline gap-2">
                <span className="font-display text-3xl font-semibold tabular-nums">{total7d}</span>
                <span className="text-xs text-muted-foreground">PV</span>
              </div>
              <div className="flex h-24 items-end gap-1.5">
                {visitTrend.map((d) => (
                  <div
                    key={d.date}
                    className="flex h-full flex-1 flex-col items-center justify-end"
                    title={`${d.date}: ${d.count} PV`}
                  >
                    <span className="mb-1 text-[10px] tabular-nums text-muted-foreground">
                      {d.count || ""}
                    </span>
                    <div
                      className="w-full rounded-t bg-linear-to-t from-primary/70 to-primary/20"
                      style={{
                        height: `${d.count > 0 ? Math.max((d.count / maxPv) * 100, 4) : 1}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                <span>{visitTrend[0].date.slice(5)}</span>
                <span>{visitTrend[visitTrend.length - 1].date.slice(5)}</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">暂无访问数据。</p>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">最近文章</h2>
          <Link to="/admin/posts" className="text-xs text-primary hover:underline">
            查看全部 →
          </Link>
        </div>
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
          {!hydrated ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">正在加载文章…</p>
          ) : recent.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-amber-soft text-accent-amber">
                <FileText className="h-5 w-5" />
              </span>
              <p className="mt-4 text-sm font-medium">还没有发布文章</p>
              <Link
                to="/admin/posts/new"
                className="mt-2 text-sm text-accent-amber transition-colors hover:text-accent-amber-strong hover:underline"
              >
                去写第一篇吧 →
              </Link>
            </div>
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
