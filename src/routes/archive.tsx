import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDate, postsByYear, isPublished } from "@/lib/sample-posts";
import { useAdminStore } from "@/lib/admin-store";

export const Route = createFileRoute("/archive")({
  head: () => ({
    meta: [
      { title: "归档 · TimeAmber" },
      { name: "description", content: "按年份与月份浏览 TimeAmber 上的全部文章。" },
      { property: "og:title", content: "归档 · TimeAmber" },
      { property: "og:description", content: "按时间线浏览所有文章。" },
    ],
  }),
  component: ArchivePage,
});

function ArchivePage() {
  const { posts } = useAdminStore();
  const published = posts.filter(isPublished);
  const groups = postsByYear(published);

  return (
    <div className="mx-auto max-w-3xl px-6 pt-16 pb-16">
      <header className="mb-12">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Archive
        </p>
        <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">归档</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          共 {published.length} 篇文章，跨越 {groups.length} 个年份。
        </p>
      </header>

      <div className="flex flex-col gap-12">
        {groups.map(({ year, posts }) => (
          <section key={year}>
            <div className="mb-4 flex items-baseline gap-3">
              <h2 className="font-display text-3xl font-bold text-primary">{year}</h2>
              <span className="text-xs text-muted-foreground">{posts.length} 篇</span>
            </div>

            <ul className="border-l border-border/70">
              {posts.map((p) => {
                const isHtml = p.type === "html" && p.externalUrl;
                const target = p.openIn ?? "_blank";
                const inner = (
                  <>
                    <span className="font-display text-base font-medium transition-colors group-hover:text-primary">
                      {p.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatDate(p.publishAt)}
                    </span>
                  </>
                );
                const cls =
                  "group flex flex-col gap-1 rounded-md px-2 py-2 transition-colors hover:bg-accent sm:flex-row sm:items-baseline sm:justify-between sm:gap-4";
                return (
                  <li key={p.slug} className="relative pl-6 pb-4 last:pb-0">
                    <span className="absolute -left-[5px] top-2 h-2 w-2 rounded-full bg-border transition-colors group-hover:bg-primary" />
                    {isHtml ? (
                      <a
                        href={p.externalUrl}
                        target={target}
                        rel={target === "_blank" ? "noopener noreferrer" : undefined}
                        className={cls}
                      >
                        {inner}
                      </a>
                    ) : (
                      <Link to="/posts/$slug" params={{ slug: p.slug }} className={cls}>
                        {inner}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
