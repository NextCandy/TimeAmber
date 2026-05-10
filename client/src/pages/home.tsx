import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { Hero } from "@/components/hero";
import { ArticleCard } from "@/components/article-card";

import { Separator } from "@/components/ui/separator";
import { fetchPostsPaged, fetchCategories, fetchPublicSettings, fetchTraffic, getHomeSnapshot, type PostMeta, type CategoryInfo, type PublicSettings, type TrafficData } from "@/lib/api";
import { AnimateIn } from "@/hooks/use-animate";
import { SeoHead } from "@/components/seo-head";
import { ExternalLink, Mail, Rss, Eye, FolderOpen, Hash, ChevronDown, Link2, Loader2 } from "lucide-react";
import { preloadMarkdownRenderer } from "@/lib/markdown-loader";

function preconnectToMedia(url: string) {
  try {
    const origin = new URL(url).origin;
    if (origin === window.location.origin || document.head.querySelector(`link[data-media-origin="${origin}"]`)) return;
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = origin;
    link.crossOrigin = "anonymous";
    link.dataset.mediaOrigin = origin;
    document.head.appendChild(link);
  } catch {
    // Ignore relative or invalid URLs.
  }
}

type SocialIcon = "github" | "x" | "mail" | "rss" | "link";

type SocialLinkConfig = {
  id: string;
  label: string;
  url: string;
  icon: SocialIcon;
  enabled: boolean;
};

const SOCIAL_ICON_MAP: Record<SocialIcon, React.ElementType> = {
  github: ExternalLink,
  x: ExternalLink,
  mail: Mail,
  rss: Rss,
  link: Link2,
};

function isSocialIcon(value: unknown): value is SocialIcon {
  return typeof value === "string" && ["github", "x", "mail", "rss", "link"].includes(value);
}

function parseSocialLinks(value: string): SocialLinkConfig[] {
  if (!value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item, index) => ({
        id: typeof item.id === "string" ? item.id : `social-${index}`,
        label: typeof item.label === "string" ? item.label : "",
        url: typeof item.url === "string" ? item.url : "",
        icon: isSocialIcon(item.icon) ? item.icon : "link",
        enabled: typeof item.enabled === "boolean" ? item.enabled : true,
      }))
      .filter((link) => link.enabled && link.label.trim() && link.url.trim());
  } catch {
    return [];
  }
}

function normalizeSocialHref(link: SocialLinkConfig) {
  const url = link.url.trim();
  const href = link.icon === "mail" && !url.startsWith("mailto:")
    ? `mailto:${url}`
    : link.icon === "rss" && !url
      ? "/rss.xml"
      : url;

  if (!href) return "";
  if (href.startsWith("//")) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;

  try {
    const protocol = new URL(href).protocol;
    return ["http:", "https:", "mailto:"].includes(protocol) ? href : "";
  } catch {
    return "";
  }
}

function isRssEnabled(value: PublicSettings["rss_enabled"] | undefined) {
  return value !== false && String(value).toLowerCase() !== "false";
}
function getPublicSocialLinks(settings: PublicSettings | null): { id: string; icon: React.ElementType; href: string; label: string }[] {
  if (!settings) return [];

  const configuredLinks = settings.social_links.trim() ? parseSocialLinks(settings.social_links) : [];
  const legacyLinks: SocialLinkConfig[] = [];
  if (settings.github_url) legacyLinks.push({ id: "legacy-github", label: "GitHub", url: settings.github_url, icon: "github", enabled: true });
  if (settings.twitter_url) legacyLinks.push({ id: "legacy-x", label: "X", url: settings.twitter_url, icon: "x", enabled: true });
  if (settings.email) legacyLinks.push({ id: "legacy-email", label: "邮箱", url: settings.email, icon: "mail", enabled: true });

  const sourceLinks = configuredLinks.length > 0 || settings.social_links.trim() ? configuredLinks : legacyLinks;

  const links = sourceLinks
    .map((link) => ({
      id: link.id,
      icon: SOCIAL_ICON_MAP[link.icon] || ExternalLink,
      href: normalizeSocialHref(link),
      label: link.label.trim(),
    }))
    .filter((link) => link.href);

  if (links.length > 0 && isRssEnabled(settings.rss_enabled) && !links.some((link) => link.href === "/rss.xml")) {
    links.push({ id: "rss-feed", icon: Rss, href: "/rss.xml", label: "RSS" });
  }

  return links;
}

/* ── 紧凑标签云 ── */
const TAG_VISIBLE = 15;
const CATEGORY_VISIBLE = 5;

function TagCloud({ tags, maxCount }: { tags: [string, number][]; maxCount: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = tags.length > TAG_VISIBLE;
  const visible = expanded ? tags : tags.slice(0, TAG_VISIBLE);
  return (
    <div className="rounded-md border border-border/25 bg-background/25 p-[18px]">
      <h3 className="mb-[12px] flex items-center gap-[6px] text-[13px] font-medium tracking-normal text-muted-foreground/60">
        <Hash className="h-[12px] w-[12px]" />
        标签
        <span className="ml-auto text-[10px] font-mono text-muted-foreground/25 normal-case tracking-normal">{tags.length}</span>
      </h3>
      <div className="flex flex-wrap gap-x-[6px] gap-y-[4px] leading-[1.9]">
        {visible.map(([tag, count]) => {
          // 频率归一化 0~1 映射透明度与字号
          const ratio = maxCount > 1 ? (count - 1) / (maxCount - 1) : 0;
          const weight = 42 + ratio * 44; // 42% ~ 86%
          const size = 11 + ratio * 3; // 11px ~ 14px
          return (
            <span
              key={tag}
              className="cursor-pointer whitespace-nowrap transition-colors duration-200 hover:text-foreground"
              style={{ fontSize: `${size}px`, color: `color-mix(in oklch, var(--foreground) ${weight}%, var(--muted-foreground))` }}
              title={`${tag}（${count} 篇）`}
            >
              {tag}
            </span>
          );
        })}
      </div>
      {hasMore && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-[8px] inline-flex min-h-[32px] items-center gap-[4px] rounded-md text-[11px] text-muted-foreground/40 transition-colors hover:text-muted-foreground/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          展开全部 <ChevronDown className="h-[11px] w-[11px]" />
        </button>
      )}
    </div>
  );
}

function CategoryList({ categories }: { categories: CategoryInfo[] }) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = categories.length > CATEGORY_VISIBLE;
  const visibleCategories = expanded ? categories : categories.slice(0, CATEGORY_VISIBLE);

  return (
    <div className="rounded-md border border-border/25 bg-background/25 p-[18px]">
      <h3 className="mb-[12px] flex items-center gap-[6px] text-[13px] font-medium tracking-normal text-muted-foreground/60">
        <FolderOpen className="h-[13px] w-[13px]" />
        分类
        <span className="ml-auto text-[10px] font-mono text-muted-foreground/25">{categories.length}</span>
      </h3>
      <div className={`space-y-[4px] ${expanded && categories.length > 8 ? "max-h-[280px] overflow-y-auto pr-[4px]" : ""}`}>
        {visibleCategories.map((cat) => (
          <Link
            key={cat.name}
            href={`/archive?category=${encodeURIComponent(cat.name)}`}
            className="group flex min-h-[44px] items-center justify-between rounded-md px-[8px] py-[6px] transition-colors hover:bg-accent/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-[36px]"
          >
            <span className="min-w-0 truncate text-[12px] text-muted-foreground transition-colors group-hover:text-foreground">{cat.name}</span>
            <span className="ml-[12px] shrink-0 rounded-[4px] bg-foreground/[0.04] px-[6px] py-[2px] text-[10px] font-mono text-muted-foreground/35">{cat.count}</span>
          </Link>
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-[10px] inline-flex min-h-[36px] w-full items-center justify-center gap-[4px] rounded-md border border-border/15 text-[11px] text-muted-foreground/50 transition-colors hover:bg-accent/35 hover:text-muted-foreground/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {expanded ? "收起分类" : `展开 ${categories.length - CATEGORY_VISIBLE} 个更多分类`}
          <ChevronDown className={`h-[11px] w-[11px] transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      )}
    </div>
  );
}

/* ── 纯 SVG 迷你折线图 ── */
function SparkLine({ data, width = 240, height = 48 }: { data: number[]; width?: number; height?: number }) {
  const gradId = `sparkGrad-${React.useId().replace(/:/g, "")}`;
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const pad = 2;
  const step = (width - pad * 2) / (data.length - 1);
  const points = data.map((v, i) => {
    const x = pad + i * step;
    const y = height - pad - ((v / max) * (height - pad * 2));
    return `${x},${y}`;
  });
  const polyline = points.join(" ");
  const areaPath = `M${pad},${height - pad} ${points.map((p) => `L${p}`).join(" ")} L${pad + (data.length - 1) * step},${height - pad} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.75 0.15 220)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="oklch(0.75 0.15 220)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <polyline fill="none" stroke="oklch(0.75 0.15 220)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={polyline} />
      {/* 末端圆点 */}
      {data.length > 0 && (
        <circle cx={pad + (data.length - 1) * step} cy={height - pad - ((data[data.length - 1] / max) * (height - pad * 2))} r="2.5" fill="oklch(0.75 0.15 220)" />
      )}
    </svg>
  );
}

export function HomePage() {
  const snapshot = getHomeSnapshot();
  const [posts, setPosts] = useState<PostMeta[]>(() => snapshot?.posts || []);
  const [loading, setLoading] = useState(() => !snapshot?.posts);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalPosts, setTotalPosts] = useState(0);
  const [settings, setSettings] = useState<PublicSettings | null>(() => snapshot?.settings || null);
  const [traffic, setTraffic] = useState<TrafficData | null>(() => snapshot?.traffic || null);
  const [categories, setCategories] = useState<CategoryInfo[]>(() => snapshot?.categories || []);

  const PAGE_SIZE = 20;

  useEffect(() => {
    fetchPostsPaged(0, PAGE_SIZE)
      .then((res) => {
        setPosts(res.posts);
        setTotalPosts(res.total);
        setHasMore(res.hasMore);
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    fetchPublicSettings()
      .then((data) => setSettings(data))
      .catch(() => {});

    fetchTraffic().then(setTraffic).catch(() => {});

    fetchCategories().then(setCategories).catch(() => {});
  }, []);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetchPostsPaged(posts.length, PAGE_SIZE);
      setPosts((prev) => [...prev, ...res.posts]);
      setTotalPosts(res.total);
      setHasMore(res.hasMore);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    const urls = [settings?.author_avatar].filter((url): url is string => Boolean(url));
    urls.forEach(preconnectToMedia);
  }, [settings?.author_avatar]);

  useEffect(() => {
    if (posts.length === 0) return;
    const warmArticleRoute = () => {
      preloadMarkdownRenderer();
      void import("@/pages/post");
    };
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(warmArticleRoute, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = globalThis.setTimeout(warmArticleRoute, 1200);
    return () => globalThis.clearTimeout(id);
  }, [posts.length]);

  // 计算标签频次并按热度排序
  const tagCounts = new Map<string, number>();
  for (const p of posts) {
    for (const t of p.tags) {
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
  }
  const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);
  const maxTagCount = sortedTags.length > 0 ? sortedTags[0][1] : 1;

  const authorName = settings?.author_name || "Amber";
  const siteTitle = settings?.site_title || "TimeAmber";
  const siteDescription = settings?.site_description || "时光琥珀，一个用文字封存瞬间的个人博客。";
  const siteTagline = settings?.site_tagline || "时光成珀，字字如初";
  const authorTitle = settings?.author_title || "独立开发者";
  const authorBio = settings?.author_bio || "热衷于前端架构、设计系统与边缘计算。相信技术应当服务于人，而非反过来。";
  const authorAvatar = settings?.author_avatar || "";

  // 社交链接（优先读取新版可扩展列表，旧字段作为兼容回退）
  const socialLinks = getPublicSocialLinks(settings);

  return (
    <div className="flex flex-col">
      <SeoHead url="/" siteName={siteTitle} description={siteDescription} />
      <Hero siteTitle={siteTitle} siteDescription={siteDescription} siteTagline={siteTagline} />
      <Separator className="bg-border/30" />
      <div className="grid grid-cols-1 gap-[32px] py-[40px] lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-[40px]">
        <section className="min-w-0">
          <AnimateIn>
            <div id="latest-posts" className="mb-[24px] flex flex-col gap-[8px] border-l border-border/50 pl-[14px] sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Latest Posts</p>
                <h2 className="mt-[4px] text-[24px] font-semibold tracking-[-0.02em] text-foreground">最新文章</h2>
              </div>
              {!loading && (
                <span className="text-[13px] text-muted-foreground/60">{totalPosts > 0 ? `${totalPosts} 篇可读内容` : `${posts.length} 篇可读内容`}</span>
              )}
            </div>
          </AnimateIn>
          {loading ? (
            <div className="flex flex-col gap-[16px]">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-[180px] animate-pulse rounded-lg bg-card/20" />
              ))}
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-[16px]">
              {posts.length > 0 ? (
                <>
                  {posts.map((post, i) => (
                    <AnimateIn key={post.slug} delay={`delay-${Math.min(i, 6)}`} className="min-w-0 max-w-full">
                      <ArticleCard post={post} />
                    </AnimateIn>
                  ))}
                  {hasMore && (
                    <button
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="group mx-auto flex items-center gap-[8px] rounded-md border border-border/25 bg-background/30 px-[24px] py-[10px] text-[13px] font-medium text-muted-foreground/70 transition-all duration-200 hover:border-border/40 hover:bg-background/50 hover:text-foreground disabled:opacity-50"
                    >
                      {loadingMore ? (
                        <><Loader2 className="h-[14px] w-[14px] animate-spin" /><span>加载中...</span></>
                      ) : (
                        <><ChevronDown className="h-[14px] w-[14px] transition-transform group-hover:translate-y-[2px]" /><span>加载更多 ({posts.length}/{totalPosts})</span></>
                      )}
                    </button>
                  )}
                  {!hasMore && posts.length > PAGE_SIZE && (
                    <p className="py-[8px] text-center text-[12px] text-muted-foreground/30">已加载全部 {totalPosts} 篇文章</p>
                  )}
                </>
              ) : (
                <div className="rounded-md border border-dashed border-border/25 bg-background/20 px-[20px] py-[52px] text-center">
                  <p className="text-[15px] font-medium text-foreground/80">还没有发布文章</p>
                  <p className="mx-auto mt-[8px] max-w-[360px] text-[13px] leading-[1.7] text-muted-foreground/60">
                    本地数据库初始化后，最新文章会直接出现在这里。
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="hidden min-w-0 lg:block">
          <div className="sticky top-[72px] flex flex-col gap-[24px] mt-[42px]">
            {/* ── 博主名片 ── */}
            <AnimateIn animation="animate-fade-in" delay="delay-2">
              <div className="rounded-md border border-border/25 bg-background/25 p-[18px]">
                <div className="mb-[12px] flex items-center gap-[12px]">
                  {authorAvatar ? (
                    <img
                      src={authorAvatar}
                      alt={authorName}
                      loading="eager"
                      decoding="async"
                      fetchPriority="high"
                      className="h-[40px] w-[40px] rounded-full object-cover border border-border/30"
                    />
                  ) : (
                    <div className="flex h-[40px] w-[40px] items-center justify-center rounded-full bg-gradient-to-br from-blue-500/30 to-cyan-500/30 text-[15px] font-semibold text-foreground">
                      {authorName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-foreground">{authorName}</p>
                    <p className="truncate text-[12px] text-muted-foreground/60">{authorTitle}</p>
                  </div>
                </div>
                <p className="text-[13px] leading-[1.7] text-muted-foreground">{authorBio}</p>

                {/* 社交链接图标行 */}
                {socialLinks.length > 0 && (
                  <div className="mt-[14px] flex min-w-0 items-center gap-[12px] border-t border-border/20 pt-[14px]">
                    {socialLinks.map((link) => (
                      <a
                        key={link.id}
                        href={link.href}
                        target={link.href.startsWith("http") ? "_blank" : undefined}
                        rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
                        title={link.label}
                        aria-label={link.label}
                        className="flex h-[44px] w-[44px] items-center justify-center rounded-md text-muted-foreground/45 transition-colors duration-200 hover:bg-accent/45 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-[32px] sm:w-[32px]"
                      >
                        <link.icon className="h-[14px] w-[14px]" />
                      </a>
                    ))}
                    {totalPosts > 0 && (
                      <span className="ml-auto text-[11px] text-muted-foreground/30">{totalPosts} 篇文章</span>
                    )}
                  </div>
                )}
              </div>
            </AnimateIn>

            {/* ── 标签云（无标签时隐藏） ── */}
            {sortedTags.length > 0 && (
              <AnimateIn animation="animate-fade-in" delay="delay-3">
                <TagCloud tags={sortedTags} maxCount={maxTagCount} />
              </AnimateIn>
            )}
            {/* ── 分类（无分类时隐藏） ── */}
            {categories.length > 0 && (
              <AnimateIn animation="animate-fade-in" delay="delay-3">
                <CategoryList categories={categories} />
              </AnimateIn>
            )}

            {/* ── 访问趋势 ── */}
            <AnimateIn animation="animate-fade-in" delay="delay-4">
              <div className="rounded-md border border-border/25 bg-background/25 p-[18px]">
                <div className="flex items-center justify-between mb-[12px]">
                  <h3 className="text-[13px] font-medium tracking-normal text-muted-foreground/60">访问趋势</h3>
                  <span className="text-[10px] text-muted-foreground/20">14 日</span>
                </div>
                {traffic?.chart && traffic.chart.some((d) => d.count > 0) ? (
                  <>
                    <div className="mb-[10px] flex items-baseline gap-[6px]">
                      <span className="text-[24px] font-bold leading-none tracking-tight text-foreground">{(traffic.totalViews).toLocaleString()}</span>
                      <span className="text-[11px] text-muted-foreground/30">次访问</span>
                    </div>
                    <SparkLine data={traffic.chart.map((d) => d.count)} />
                  </>
                ) : (
                  <div className="flex items-center gap-[6px] py-[8px]">
                    <Eye className="h-[13px] w-[13px] text-muted-foreground/15" />
                    <span className="text-[12px] text-muted-foreground/20">暂无访问数据</span>
                  </div>
                )}
              </div>
            </AnimateIn>

            {/* ── 技术栈 ── */}
            <AnimateIn animation="animate-fade-in" delay="delay-5">
              <div className="rounded-md border border-border/25 bg-background/25 p-[18px]">
                <h3 className="mb-[12px] text-[13px] font-medium tracking-normal text-muted-foreground/60">技术栈</h3>
                <div className="flex flex-col gap-[8px] text-[13px]">
                  <div className="flex justify-between"><span className="text-muted-foreground/70">前端</span><span className="font-medium text-foreground">React 19</span></div>
                  <Separator className="bg-border/15" />
                  <div className="flex justify-between"><span className="text-muted-foreground/70">构建</span><span className="font-medium text-foreground">Vite 6</span></div>
                  <Separator className="bg-border/15" />
                  <div className="flex justify-between"><span className="text-muted-foreground/70">样式</span><span className="font-medium text-foreground">Tailwind v4</span></div>
                  <Separator className="bg-border/15" />
                  <div className="flex justify-between"><span className="text-muted-foreground/70">后端</span><span className="font-medium text-foreground">Hono</span></div>
                  <Separator className="bg-border/15" />
                  <div className="flex justify-between"><span className="text-muted-foreground/70">数据库</span><span className="font-medium text-foreground">Cloudflare D1</span></div>
                  <Separator className="bg-border/15" />
                  <div className="flex justify-between"><span className="text-muted-foreground/70">存储</span><span className="font-medium text-foreground">Cloudflare R2</span></div>
                  <Separator className="bg-border/15" />
                  <div className="flex justify-between"><span className="text-muted-foreground/70">部署</span><span className="font-medium text-foreground">Workers + Pages</span></div>
                </div>
              </div>
            </AnimateIn>
          </div>
        </aside>
      </div>
    </div>
  );
}
