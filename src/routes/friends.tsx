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
      className="group flex h-full flex-col items-center justify-start gap-3 rounded-2xl border border-border bg-card px-4 py-5 text-center transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-glow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {/* 定高容器 + object-contain：宽字标和方形图标都能完整显示、不裁切不变形 */}
      <span className="flex h-12 w-full items-center justify-center">
        {icon && !imgFailed ? (
          <img
            src={icon}
            alt=""
            loading="lazy"
            decoding="async"
            className="max-h-12 max-w-full object-contain"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 bg-background/60 text-base font-semibold text-muted-foreground">
            {initial}
          </span>
        )}
      </span>

      {/* 名字完整显示：允许换行，不截断 */}
      <span className="text-sm leading-snug font-medium text-foreground transition-colors [overflow-wrap:anywhere] group-hover:text-primary">
        {f.name}
      </span>
    </a>
  );
}

function EmptyState({ email }: { email?: string }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-card/50 p-10 text-center">
      <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
        <Link2 className="h-6 w-6 text-primary" />
      </span>
      <h2 className="font-display text-xl font-semibold">友链暂未开放</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        作者当前尚未启用友情链接。若你的站点也在认真记录，欢迎来信，我们互换友链。
      </p>
      <div className="mt-6 flex justify-center">
        {email ? (
          <a
            href={`mailto:${email}?subject=${encodeURIComponent("友链申请 · TimeAmber")}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-glow"
          >
            <Mail className="h-4 w-4" /> 想被收录？
          </a>
        ) : (
          <Link
            to="/about"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-primary/40 hover:text-primary"
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
    <div className="mx-auto max-w-6xl px-6 pt-16 pb-16">
      <header className="mb-10">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Friends
        </p>
        <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">友链</h1>
        <p className="mt-3 text-sm text-muted-foreground">一些值得长期关注的人和站点。</p>
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

          <div className="space-y-10">
            {groups.map(([g, list]) => (
              <section key={g} id={`group-${encodeURIComponent(g)}`} className="scroll-mt-24">
                {multiGroup && (
                  <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
                    {g}
                    <span className="text-xs font-normal text-muted-foreground">{list.length}</span>
                  </h2>
                )}
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
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
