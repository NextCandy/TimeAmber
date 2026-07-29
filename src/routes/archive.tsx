import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDate, postsByYear } from "@/lib/sample-posts";
import { loadPostIndex, type PostIndexItem } from "@/lib/public-posts.functions";
import { SITE_URL } from "@/lib/brand";

export const Route = createFileRoute("/archive")({
  // 归档是少数真的需要全部文章的页面，所以自己取一份轻量索引，
  // 而不是让每个页面都跟着背 root loader 的全量数据。
  loader: async () => ({ posts: await loadPostIndex().catch(() => []) }),
  head: () => ({
    meta: [
      { title: "归档 · TimeAmber" },
      { name: "description", content: "按年份与月份浏览 TimeAmber 上的全部文章。" },
      { property: "og:title", content: "归档 · TimeAmber" },
      { property: "og:description", content: "按时间线浏览所有文章。" },
      { property: "og:url", content: `${SITE_URL}/archive` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/archive` }],
  }),
  component: ArchivePage,
});

const MONTH_NAMES = [
  "1 月",
  "2 月",
  "3 月",
  "4 月",
  "5 月",
  "6 月",
  "7 月",
  "8 月",
  "9 月",
  "10 月",
  "11 月",
  "12 月",
];

// 贡献日历：把一年 12 个月 × 每月发布数映射成琥珀色阶方块。
function ContributionCalendar({ posts }: { posts: PostIndexItem[] }) {
  const counts = useMemo(() => {
    const arr = new Array(12).fill(0) as number[];
    for (const p of posts) {
      const m = Number(String(p.publishAt).slice(5, 7)) - 1;
      if (m >= 0 && m < 12) arr[m] += 1;
    }
    return arr;
  }, [posts]);
  const max = Math.max(...counts, 1);
  const level = (n: number) => {
    if (n === 0) return "bg-muted/30";
    const r = n / max;
    if (r > 0.75) return "bg-primary";
    if (r > 0.5) return "bg-primary/70";
    if (r > 0.25) return "bg-primary/45";
    return "bg-primary/25";
  };
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {counts.map((n, i) => (
        <span
          key={i}
          title={`${MONTH_NAMES[i]}：${n} 篇`}
          className={`h-5 w-5 rounded-sm ${level(n)}`}
          aria-label={`${MONTH_NAMES[i]} ${n} 篇`}
        />
      ))}
    </div>
  );
}

function PostRow({ p }: { p: PostIndexItem }) {
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
    <li className="relative pl-6 pb-4 last:pb-0">
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
}

function ArchivePage() {
  const { posts: published } = Route.useLoaderData();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");

  const categories = useMemo(
    () => Array.from(new Set(published.map((p) => p.category).filter(Boolean))).sort(),
    [published],
  );

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    return published.filter((p) => {
      if (cat !== "all" && p.category !== cat) return false;
      if (!k) return true;
      return (
        p.title.toLowerCase().includes(k) ||
        p.category.toLowerCase().includes(k) ||
        p.tags.some((t) => t.toLowerCase().includes(k))
      );
    });
  }, [published, q, cat]);

  const groups = useMemo(() => postsByYear(filtered), [filtered]);

  // 近两千篇一次性铺开会让归档页的 DOM 和 SSR 体积都非常夸张，
  // 默认只展开最新一年，其余按年折叠（条件渲染而不是 hidden，节点是真的不生成）。
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const defaultOpenYear = groups[0]?.year;
  const isOpen = (year: string | number) => {
    const key = String(year);
    return key in collapsed ? !collapsed[key] : String(defaultOpenYear) === key;
  };
  const toggleYear = (year: string | number) => {
    const key = String(year);
    setCollapsed((prev) => ({ ...prev, [key]: isOpen(key) }));
  };

  // 月份默认收起：记录被展开的「年-月」。
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  const toggleMonth = (key: string) => setOpenMonths((prev) => ({ ...prev, [key]: !prev[key] }));

  // 年内按月分组（月份倒序）。
  const byMonth = (list: PostIndexItem[]) => {
    const map = new Map<string, PostIndexItem[]>();
    for (const p of list) {
      const m = String(p.publishAt).slice(5, 7);
      const arr = map.get(m) ?? [];
      arr.push(p);
      map.set(m, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? 1 : -1));
  };

  return (
    <div className="mx-auto max-w-3xl px-6 pt-16 pb-16">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Archive
        </p>
        <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">归档</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          共 {filtered.length} 篇文章，跨越 {groups.length} 个年份。
        </p>
      </header>

      {/* 筛选 */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索标题、分类、标签…"
            className="w-full rounded-full border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary/50"
          />
        </div>
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="rounded-full border border-border bg-card px-3 py-2 text-sm text-foreground"
        >
          <option value="all">全部分类</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* sticky 年份导航 */}
      {groups.length > 1 && (
        <nav className="sticky top-16 z-30 mb-8 -mx-2 flex flex-wrap gap-1.5 rounded-xl bg-background/80 px-2 py-2 backdrop-blur">
          {groups.map(({ year }) => (
            <a
              key={year}
              href={`#year-${year}`}
              className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              {year}
            </a>
          ))}
        </nav>
      )}

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/80 bg-card/40 p-10 text-center text-sm text-muted-foreground">
          没有匹配的文章。
        </p>
      ) : (
        <div className="flex flex-col gap-12">
          {groups.map(({ year, posts }) => (
            <section key={year} id={`year-${year}`} className="scroll-mt-32">
              <button
                type="button"
                onClick={() => toggleYear(year)}
                aria-expanded={isOpen(year)}
                className="group mb-2 flex w-full items-baseline gap-3 text-left"
              >
                <h2 className="font-display text-3xl font-bold text-primary">{year}</h2>
                <span className="text-xs text-muted-foreground">{posts.length} 篇</span>
                <ChevronDown
                  className={`ml-auto h-4 w-4 shrink-0 self-center text-muted-foreground transition-transform group-hover:text-foreground ${
                    isOpen(year) ? "" : "-rotate-90"
                  }`}
                />
              </button>

              {/* 贡献日历：该年每月发布密度 */}
              <ContributionCalendar posts={posts} />

              {isOpen(year) && (
                <div className="mt-5 flex flex-col gap-3">
                  {byMonth(posts).map(([m, list]) => {
                    const key = `${year}-${m}`;
                    const open = !!openMonths[key];
                    return (
                      <div key={key}>
                        <button
                          type="button"
                          onClick={() => toggleMonth(key)}
                          aria-expanded={open}
                          className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60"
                        >
                          <span className="font-medium">{MONTH_NAMES[Number(m) - 1]}</span>
                          <span className="text-xs text-muted-foreground">{list.length} 篇</span>
                          <ChevronDown
                            className={`ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform ${
                              open ? "" : "-rotate-90"
                            }`}
                          />
                        </button>
                        {open && (
                          <ul className="mt-2 border-l border-border/70">
                            {list.map((p) => (
                              <PostRow key={p.slug} p={p} />
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
