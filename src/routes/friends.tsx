import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useAdminStore } from "@/lib/admin-store";

export const Route = createFileRoute("/friends")({
  head: () => ({
    meta: [
      { title: "友链 · TimeAmber" },
      { name: "description", content: "TimeAmber 的友情链接。" },
      { property: "og:title", content: "友链 · TimeAmber" },
      { property: "og:description", content: "一些值得长期关注的站点。" },
    ],
  }),
  component: FriendsPage,
});

function FriendsPage() {
  const { friends: FRIENDS } = useAdminStore();
  return (
    <div className="mx-auto max-w-4xl px-6 pt-16 pb-16">
      <header className="mb-10">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Friends
        </p>
        <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">友链</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          一些值得长期关注的人和站点。
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FRIENDS.map((f) => (
          <li key={f.url}>
            <a
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_15px_40px_-25px_oklch(0.78_0.16_65/0.45)]"
            >
              <div className="min-w-0">
                <p className="font-display font-semibold transition-colors group-hover:text-primary">
                  {f.name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
              </div>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
