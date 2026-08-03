import { createFileRoute, Link } from "@tanstack/react-router";
import { Link2, Mail } from "lucide-react";
import { useMemo, useState } from "react";
import { useAdminStore, type Friend } from "@/lib/admin-store";

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

const DEFAULT_GROUP = "默认";

// 用 Google S2 取站点 favicon；失败时回退到首字母头像。
function faviconUrl(url: string): string | null {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`;
  } catch {
    return null;
  }
}

function FriendCard({ f }: { f: Friend }) {
  const [imgFailed, setImgFailed] = useState(false);
  // 后台填了图标就用它，没填再退回 favicon 服务、最后退到首字母
  const custom = f.icon?.trim();
  const icon = custom || faviconUrl(f.url);
  const initial = f.name.trim().charAt(0) || "友";

  return (
    <a
      href={f.url}
      target="_blank"
      rel="noopener noreferrer"
      title={f.desc || f.name}
      className="press-feedback group flex h-full items-start gap-4 rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-accent-amber hover:bg-accent-amber-soft/30 hover:shadow-glow-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-background/70 p-2">
        {icon && !imgFailed ? (
          <img
            src={icon}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center rounded-lg bg-accent-amber-soft text-lg font-semibold text-accent-amber">
            {initial}
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1 text-left">
        <span className="block text-base leading-snug font-medium text-foreground transition-colors [overflow-wrap:anywhere] group-hover:text-accent-amber">
          {f.name}
        </span>
        {f.desc && (
          <span className="mt-1.5 line-clamp-3 block text-sm leading-6 text-muted-foreground">
            {f.desc}
          </span>
        )}
        {f.group && (
          <span className="mt-3 inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {f.group}
          </span>
        )}
      </span>
    </a>
  );
}

function EmptyState({ email }: { email?: string }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-card/50 p-10 text-center">
      <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-accent-amber/30 bg-accent-amber-soft">
        <Link2 className="h-6 w-6 text-accent-amber" />
      </span>
      <h2 className="font-display text-xl font-semibold">友链暂未开放</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        作者当前尚未启用友情链接。若你的站点也在认真记录，欢迎来信，我们互换友链。
      </p>
      <div className="mt-6 flex justify-center">
        {email ? (
          <a
            href={`mailto:${email}?subject=${encodeURIComponent("友链申请 · TimeAmber")}`}
            className="press-feedback inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-glow"
          >
            <Mail className="h-4 w-4" /> 想被收录？
          </a>
        ) : (
          <Link
            to="/about"
            className="press-feedback inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-primary/40 hover:text-primary"
          >
            了解更多
          </Link>
        )}
      </div>
    </div>
  );
}

function FriendsPage() {
  const { friends, settings } = useAdminStore();
  const email = settings?.contactEmail?.trim() || undefined;

  // 按分组聚合，缺分组归入「默认」；默认组排最后，其余按名称排序。
  const groups = useMemo(() => {
    const map = new Map<string, Friend[]>();
    for (const f of friends) {
      const g = (f.group && f.group.trim()) || DEFAULT_GROUP;
      const list = map.get(g) ?? [];
      list.push(f);
      map.set(g, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) =>
      a === DEFAULT_GROUP ? 1 : b === DEFAULT_GROUP ? -1 : a.localeCompare(b, "zh"),
    );
  }, [friends]);

  const multiGroup = groups.length > 1;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pt-16 pb-16">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Friends
        </p>
        <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">友链</h1>
        <p className="mt-4 text-sm text-muted-foreground">一些值得长期关注的人和站点。</p>
      </header>

      {friends.length === 0 ? (
        <EmptyState email={email} />
      ) : (
        <>
          {multiGroup && (
            <nav className="mb-8 flex flex-wrap gap-2">
              {groups.map(([g]) => (
                <a
                  key={g}
                  href={`#group-${encodeURIComponent(g)}`}
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  {g}
                </a>
              ))}
            </nav>
          )}

          <div className="space-y-8">
            {groups.map(([g, list]) => (
              <section key={g} id={`group-${encodeURIComponent(g)}`} className="scroll-mt-24">
                {multiGroup && (
                  <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
                    {g}
                    <span className="text-xs font-normal text-muted-foreground">{list.length}</span>
                  </h2>
                )}
                <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {list.map((f) => (
                    <li key={f.name}>
                      <FriendCard f={f} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
