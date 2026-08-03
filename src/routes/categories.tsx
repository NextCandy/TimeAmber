import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { FolderTree, Loader2, Tag, X, Search } from "lucide-react";
import { PostCard } from "@/components/home/PostCard";
import { EmptyState } from "@/components/ui/empty-state";
import {
  loadPostsByTaxonomy,
  loadTaxonomyCounts,
  type TaxonomyCount,
  type TaxonomyCounts,
  type TaxonomyPosts,
} from "@/lib/public-posts.functions";
import { SITE_URL } from "@/lib/brand";
import { JsonLd, categoryRedirectTarget } from "@/lib/seo";

type CategorySearch = { c?: string; tag?: string };

/** 筛选结果每页多少篇，点「加载更多」再追加同样多。 */
const PAGE_SIZE = 60;

const EMPTY_COUNTS: TaxonomyCounts = { categories: [], tags: [], total: 0 };
const EMPTY_POSTS: TaxonomyPosts = { posts: [], total: 0 };
const CATEGORY_BORDERS = [
  "border-l-accent-amber",
  "border-l-primary",
  "border-l-success",
  "border-l-warning",
  "border-l-category-purple",
] as const;

export const Route = createFileRoute("/categories")({
  beforeLoad: ({ search }) => {
    const target = categoryRedirectTarget(search.c);
    if (target) throw redirect({ href: `/categories?c=${encodeURIComponent(target)}`, statusCode: 301 });
  },
  validateSearch: (search: Record<string, unknown>): CategorySearch => ({
    c: typeof search.c === "string" && search.c ? search.c : undefined,
    tag: typeof search.tag === "string" && search.tag ? search.tag : undefined,
  }),
  loaderDeps: ({ search }) => ({ c: search.c, tag: search.tag }),
  // 计数交给 SQL，筛选结果只取第一页 —— 早先这里下发全部 1927 篇索引，
  // 一个只显示计数的页面因此背了 530 KB，domInteractive 拖到 3 秒。
  loader: async ({ deps }) => {
    const [counts, initialPosts] = await Promise.all([
      loadTaxonomyCounts().catch(() => EMPTY_COUNTS),
      deps.c || deps.tag
        ? loadPostsByTaxonomy({
            data: { category: deps.c, tag: deps.tag, offset: 0, limit: PAGE_SIZE },
          }).catch(() => EMPTY_POSTS)
        : Promise.resolve(EMPTY_POSTS),
    ]);
    return { counts, initialPosts };
  },
  head: () => ({
    meta: [
      { title: "分类 · TimeAmber" },
      { name: "description", content: "按分类与标签浏览 TimeAmber 的全部文章。" },
      { property: "og:title", content: "分类 · TimeAmber" },
      { property: "og:description", content: "按分类与标签浏览全部文章。" },
      { property: "og:url", content: `${SITE_URL}/categories` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/categories` }],
  }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const { c: activeCategory, tag: activeTag } = Route.useSearch();
  const { counts, initialPosts } = Route.useLoaderData();

  const categoryCounts = counts.categories;
  const tagCounts = counts.tags;
  const activeLabel = activeCategory ?? activeTag;

  // 筛选结果由服务端分页给：一个分类底下可能有六百多篇，
  // 全量既撑大 payload 又堆出六百个 DOM 节点，滚动和点击都要等主线程。
  const [posts, setPosts] = useState(initialPosts.posts);
  const [total, setTotal] = useState(initialPosts.total);
  const [loading, setLoading] = useState(false);

  // loader 同时负责首屏和筛选参数变化；组件只同步新 loader data，避免同参数再发一次请求。
  useEffect(() => {
    setPosts(initialPosts.posts);
    setTotal(initialPosts.total);
    setLoading(false);
  }, [initialPosts]);

  const remaining = total - posts.length;
  const loadMore = () => {
    setLoading(true);
    void loadPostsByTaxonomy({
      data: { category: activeCategory, tag: activeTag, offset: posts.length, limit: PAGE_SIZE },
    })
      .then((res) => setPosts((prev) => [...prev, ...res.posts]))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  return (
    <div className="mx-auto max-w-4xl px-6 pt-16 pb-16">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "首页", item: SITE_URL },
            { "@type": "ListItem", position: 2, name: "分类", item: `${SITE_URL}/categories` },
          ],
        }}
      />
      <header className="mb-10">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Categories
        </p>
        <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">分类</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {activeLabel
            ? `「${activeLabel}」下共 ${total} 篇文章。`
            : `${categoryCounts.length} 个分类、${tagCounts.length} 个标签，共 ${counts.total} 篇文章。`}
        </p>
      </header>

      {activeLabel ? (
        <>
          <Link
            to="/categories"
            search={{}}
            className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <X className="h-3 w-3" />
            清除筛选：{activeLabel}
          </Link>

          {posts.length === 0 ? (
            loading ? (
              <p className="flex items-center justify-center gap-2 px-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
              </p>
            ) : (
              <EmptyState
                title={`这个${activeCategory ? "分类" : "标签"}下还没有文章`}
                description="试试清除筛选，或换一个分类和标签。"
              />
            )
          ) : (
            <>
              <div className="flex flex-col border-b border-border">
                {posts.map((post) => (
                  <PostCard key={post.slug} post={post} />
                ))}
              </div>
              {remaining > 0 && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loading}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                >
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  加载更多（还有 {remaining} 篇）
                </button>
              )}
            </>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-10">
          <section>
            <h2 className="mb-4 inline-flex items-center gap-2 font-display text-lg font-semibold">
              <FolderTree className="h-4 w-4 text-primary" /> 按分类
            </h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {categoryCounts.map(({ name, count }, index) => (
                <li key={name}>
                  <Link
                    to="/categories"
                    search={{ c: name }}
                    className={`group flex items-center justify-between rounded-xl border border-l-4 border-border bg-card px-5 py-4 transition-all hover:-translate-y-0.5 hover:bg-accent/30 hover:shadow-glow ${CATEGORY_BORDERS[index % CATEGORY_BORDERS.length]}`}
                  >
                    <span className="min-w-0 truncate font-medium transition-colors group-hover:text-primary">
                      {name}
                    </span>
                    <span className="ml-3 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <TagCloud tags={tagCounts} />
        </div>
      )}
    </div>
  );
}

// ── 标签云 ─────────────────────────────────────────────────────────────
const TOP_N = 30;
const THRESHOLDS = [0, 5, 10, 30] as const;
const PREFS_KEY = "timeamber.tagcloud";

type TagPrefs = { expanded: boolean; min: number };

function useTagCloudPrefs() {
  const [prefs, setPrefs] = useState<TagPrefs>({ expanded: false, min: 0 });
  // 首屏用默认值（与 SSR 一致），挂载后再从 localStorage 补齐，避免水合不一致。
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) setPrefs((prev) => ({ ...prev, ...(JSON.parse(raw) as Partial<TagPrefs>) }));
    } catch {
      /* localStorage 不可用时忽略 */
    }
  }, []);
  const update = useCallback((patch: Partial<TagPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* 忽略写入失败 */
      }
      return next;
    });
  }, []);
  return [prefs, update] as const;
}

// 字号按文章数（sqrt 压缩长尾）映射到 12–18px。
function fontSizeFor(count: number, min: number, max: number): number {
  if (max <= min) return 15;
  const t = (Math.sqrt(count) - Math.sqrt(min)) / (Math.sqrt(max) - Math.sqrt(min));
  return 12 + t * 6;
}

function highlightMatch(text: string, q: string): ReactNode {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-primary/25 px-0.5 text-primary">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  );
}

function TagCloud({ tags }: { tags: TaxonomyCount[] }) {
  const [query, setQuery] = useState("");
  const [prefs, update] = useTagCloudPrefs();
  const q = query.trim();

  const [minCount, maxCount] = useMemo(() => {
    if (!tags.length) return [0, 0];
    const counts = tags.map((t) => t.count);
    return [Math.min(...counts), Math.max(...counts)];
  }, [tags]);

  const searched = useMemo(() => {
    const byThreshold = tags.filter((t) => t.count >= prefs.min);
    if (!q) return byThreshold;
    const lower = q.toLowerCase();
    return byThreshold.filter((t) => t.name.toLowerCase().includes(lower));
  }, [tags, prefs.min, q]);

  // 搜索或设了阈值时展示全部结果；否则默认 Top N，可展开/收起。
  const showAll = Boolean(q) || prefs.min > 0 || prefs.expanded;
  const visible = showAll ? searched : searched.slice(0, TOP_N);
  const collapsible = !q && prefs.min === 0 && searched.length > TOP_N;

  return (
    <section>
      <h2 className="mb-4 inline-flex items-center gap-2 font-display text-lg font-semibold">
        <Tag className="h-4 w-4 text-primary" /> 按标签
      </h2>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索标签…"
            className="w-full rounded-full border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary/50"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {THRESHOLDS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => update({ min: t })}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                prefs.min === t
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {t === 0 ? "全部" : `≥ ${t} 篇`}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState compact title="没有匹配的标签" description="换个关键词，或把最少文章数调低。" />
      ) : (
        <ul className="flex flex-wrap items-center gap-2">
          {visible.map(({ name, count }) => (
            <li key={name}>
              <Link
                to="/categories"
                search={{ tag: name }}
                style={{ fontSize: `${fontSizeFor(count, minCount, maxCount).toFixed(1)}px` }}
                className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border bg-card px-3 py-1 leading-tight text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5 hover:text-primary hover:shadow-glow"
              >
                {highlightMatch(name, q)}
                <span className="text-[10px] tabular-nums opacity-50">{count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {collapsible && (
        <button
          type="button"
          onClick={() => update({ expanded: !prefs.expanded })}
          className="mt-4 text-xs text-primary transition-opacity hover:opacity-70"
        >
          {prefs.expanded ? "收起" : `展开全部（${searched.length}）`}
        </button>
      )}
    </section>
  );
}
