import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/sample-posts";
import { linkRel, linkTarget } from "@/lib/post-link";
import {
  loadArchiveSummary,
  loadPostsByMonth,
  searchPostIndex,
  type ArchiveBucket,
  type PostIndexItem,
} from "@/lib/public-posts.functions";
import { SITE_URL } from "@/lib/brand";

export const Route = createFileRoute("/archive")({
  // 只取年月骨架（几十条）。展开某个月才去拿那个月的文章 ——
  // 归档默认收着，为它下发全部 1927 篇是白背 527 KB。
  loader: async () => ({
    summary: await loadArchiveSummary().catch(() => ({
      buckets: [] as ArchiveBucket[],
      categories: [] as string[],
      total: 0,
    })),
  }),
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

// 贡献日历：把一年 12 个月 × 每月发布数映射成色阶方块。
function ContributionCalendar({ counts }: { counts: number[] }) {
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
  const inner = (
    <>
      <span className="font-display text-base font-medium transition-colors group-hover:text-primary">
        {p.title}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {formatDate(p.publishAt)}
      </span>
    </>
  );
  const cls =
    "group flex flex-col gap-1 rounded-md px-2 py-2 transition-colors hover:bg-accent sm:flex-row sm:items-baseline sm:justify-between sm:gap-4";
  return (
    <li className="relative pl-6 pb-4 last:pb-0">
      <span className="absolute -left-[5px] top-2 h-2 w-2 rounded-full bg-border transition-colors group-hover:bg-primary" />
      {isHtml && p.externalUrl ? (
        <a
          href={p.externalUrl}
          target={linkTarget(p.externalUrl)}
          rel={linkRel(p.externalUrl)}
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

/** 展开后按需取该月文章，取过就留在内存里。 */
function MonthPanel({ year, month, category }: { year: string; month: string; category: string }) {
  const [posts, setPosts] = useState<PostIndexItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPosts(null);
    setFailed(false);
    void loadPostsByMonth({
      data: { year, month, category: category === "all" ? undefined : category },
    })
      .then((rows) => {
        if (!cancelled) setPosts(rows);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [year, month, category]);

  if (failed) {
    return <p className="mt-2 px-2 text-xs text-muted-foreground">这个月的文章没能加载出来。</p>;
  }
  if (!posts) {
    return (
      <p className="mt-2 flex items-center gap-2 px-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> 加载中…
      </p>
    );
  }
  if (!posts.length) {
    return <p className="mt-2 px-2 text-xs text-muted-foreground">这个月没有匹配的文章。</p>;
  }
  return (
    <ul className="mt-2 border-l border-border/70">
      {posts.map((p) => (
        <PostRow key={p.slug} p={p} />
      ))}
    </ul>
  );
}

function ArchivePage() {
  const { summary } = Route.useLoaderData();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");

  // 搜索走服务端：归档不再持有全量索引，浏览器里没东西可遍历。
  const [hits, setHits] = useState<PostIndexItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const keyword = q.trim();
    if (!keyword) {
      setHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchPostIndex({ data: { q: keyword, category: cat === "all" ? undefined : cat } })
        .then(setHits)
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [q, cat]);

  // 年月骨架按选中的分类过滤不了（计数是全站的），所以选了分类就只在展开的月份里生效，
  // 顶部的总数用搜索结果或全站总数。
  const years = useMemo(() => {
    const map = new Map<string, ArchiveBucket[]>();
    for (const b of summary.buckets) {
      const list = map.get(b.year) ?? [];
      list.push(b);
      map.set(b.year, list);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([year, buckets]) => ({
        year,
        buckets: buckets.sort((a, b) => (a.month < b.month ? 1 : -1)),
        count: buckets.reduce((s, b) => s + b.count, 0),
      }));
  }, [summary.buckets]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const defaultOpenYear = years[0]?.year;
  const isOpen = (year: string) =>
    year in collapsed ? !collapsed[year] : defaultOpenYear === year;
  const toggleYear = (year: string) => setCollapsed((prev) => ({ ...prev, [year]: isOpen(year) }));

  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  const toggleMonth = (key: string) => setOpenMonths((prev) => ({ ...prev, [key]: !prev[key] }));

  const searchMode = q.trim().length > 0;

  return (
    <div className="mx-auto max-w-3xl px-6 pt-16 pb-16">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Archive
        </p>
        <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">归档</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {searchMode
            ? `匹配到 ${hits?.length ?? 0} 篇文章。`
            : `共 ${summary.total} 篇文章，跨越 ${years.length} 个年份。`}
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
          {summary.categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {searchMode ? (
        searching && !hits ? (
          <p className="flex items-center gap-2 px-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> 搜索中…
          </p>
        ) : hits && hits.length > 0 ? (
          <ul className="border-l border-border/70">
            {hits.map((p) => (
              <PostRow key={p.slug} p={p} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-border/80 bg-card/40 p-10 text-center text-sm text-muted-foreground">
            没有匹配的文章。
          </p>
        )
      ) : years.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/80 bg-card/40 p-10 text-center text-sm text-muted-foreground">
          还没有已发布的文章。
        </p>
      ) : (
        <>
          {years.length > 1 && (
            <nav className="sticky top-16 z-30 mb-8 -mx-2 flex flex-wrap gap-1.5 rounded-xl bg-background/80 px-2 py-2 backdrop-blur">
              {years.map(({ year }) => (
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

          <div className="flex flex-col gap-12">
            {years.map(({ year, buckets, count }) => {
              const monthly = new Array(12).fill(0) as number[];
              for (const b of buckets) monthly[Number(b.month) - 1] = b.count;
              return (
                <section key={year} id={`year-${year}`} className="scroll-mt-32">
                  <button
                    type="button"
                    onClick={() => toggleYear(year)}
                    aria-expanded={isOpen(year)}
                    className="group mb-2 flex w-full items-baseline gap-3 text-left"
                  >
                    <h2 className="font-display text-3xl font-bold text-primary">{year}</h2>
                    <span className="text-xs text-muted-foreground">{count} 篇</span>
                    <ChevronDown
                      className={`ml-auto h-4 w-4 shrink-0 self-center text-muted-foreground transition-transform group-hover:text-foreground ${
                        isOpen(year) ? "" : "-rotate-90"
                      }`}
                    />
                  </button>

                  <ContributionCalendar counts={monthly} />

                  {isOpen(year) && (
                    <div className="mt-5 flex flex-col gap-3">
                      {buckets.map((b) => {
                        const key = `${year}-${b.month}`;
                        const open = !!openMonths[key];
                        return (
                          <div key={key}>
                            <button
                              type="button"
                              onClick={() => toggleMonth(key)}
                              aria-expanded={open}
                              className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60"
                            >
                              <span className="font-medium">
                                {MONTH_NAMES[Number(b.month) - 1]}
                              </span>
                              <span className="text-xs text-muted-foreground">{b.count} 篇</span>
                              <ChevronDown
                                className={`ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform ${
                                  open ? "" : "-rotate-90"
                                }`}
                              />
                            </button>
                            {open && <MonthPanel year={year} month={b.month} category={cat} />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
