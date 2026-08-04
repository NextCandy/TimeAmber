import { ArrowUpRight, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";

import { FriendsEntry } from "@/components/public/FriendsEntry";
import { GlassPanel } from "@/components/public/GlassPanel";
import { SiteClock } from "@/components/public/AibriumWidgets";
import { ProfileOverview } from "@/components/public/ProfileOverview";
import { PublishCalendar } from "@/components/public/PublishCalendar";
import { PublicNavigationGrid } from "@/components/public/PublicNavigationGrid";
import { PublicSearch } from "@/components/public/PublicSearch";
import { SiteStats } from "@/components/public/SiteStats";
import { WeatherCard } from "@/components/public/WeatherCard";
import { DEFAULT_POST_COVER } from "@/lib/brand";
import { useAdminStore } from "@/lib/admin-store";
import { safePublicHref } from "@/lib/public-site-settings";
import {
  DEFAULT_PUBLIC_SITE_CONFIG,
  sortedModules,
  type PublicSiteConfig,
} from "@/lib/public-site-settings";
import type { HomeData, HomePost } from "@/lib/home.functions";
import { formatDateKey } from "@/lib/date";
import { linkRel, linkTarget } from "@/lib/post-link";

function PostCard({ post, index }: { post: HomePost; index: number }) {
  const externalHref = safePublicHref(post.externalUrl);
  const isExternal = !!externalHref;
  const href = externalHref || `/posts/${post.slug}`;
  const cover = safePublicHref(post.cover) || DEFAULT_POST_COVER;
  const body = (
    <>
      <div className="aibrium-post-card__content">
        <div className="aibrium-post-card__meta">
          <time dateTime={post.publishAt}>{formatDateKey(post.publishAt)}</time>
          <span aria-hidden="true">·</span>
          <span>{post.category || "剪藏"}</span>
          {isExternal && <ExternalLink className="h-3 w-3" aria-label="外部文章" />}
        </div>
        <h3>{post.title}</h3>
        {post.excerpt && <p>{post.excerpt}</p>}
        <div className="aibrium-post-card__tags">
          {post.tags.slice(0, 3).map((tag, tagIndex) => (
            <span key={`${tag}-${tagIndex}`}>{tag}</span>
          ))}
        </div>
      </div>
      <div className="aibrium-post-card__media-wrap">
        <img
          src={cover}
          alt=""
          width={560}
          height={300}
          className="aibrium-post-card__media"
          loading={index < 2 ? "eager" : "lazy"}
        />
      </div>
    </>
  );
  const className = `aibrium-post-card ${index % 2 ? "aibrium-post-card--reverse" : ""}`;

  if (isExternal && externalHref) {
    return (
      <a
        href={href}
        target={linkTarget(externalHref)}
        rel={linkRel(externalHref)}
        className={className}
      >
        {body}
      </a>
    );
  }
  return (
    <Link to="/posts/$slug" params={{ slug: post.slug }} preload="intent" className={className}>
      {body}
    </Link>
  );
}

function LatestPosts({ config, home }: { config: PublicSiteConfig; home: HomeData }) {
  const posts = home.latest;
  const start = (home.page - 1) * home.pageSize + 1;
  const end = Math.min(start + posts.length - 1, home.totalPosts);
  return (
    <>
      <div className="aibrium-feed-heading">
        <div>
          <p>{config.homepage.eyebrow}</p>
          <h2>{config.homepage.articleSectionTitle}</h2>
        </div>
        <Link to="/archive" className="aibrium-feed-heading__link">
          {config.homepage.archiveButtonText}
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <p className="aibrium-feed-subtitle">{config.homepage.articleSectionSubtitle}</p>
      <div className="aibrium-post-list">
        {posts.length ? (
          posts.map((post, index) => <PostCard key={post.slug} post={post} index={index} />)
        ) : (
          <GlassPanel className="p-8 text-center text-sm text-muted-foreground">
            还没有已发布的文章。
          </GlassPanel>
        )}
      </div>
      <div className="aibrium-feed-footer">
        <span>
          显示第 {start}–{end} 篇
        </span>
        <Link to="/archive">进入完整归档</Link>
      </div>
      {home.totalPages > 1 && (
        <nav className="aibrium-pagination" aria-label="文章分页">
          {home.hasPreviousPage ? (
            <Link
              to="/"
              search={{ page: home.page > 2 ? home.page - 1 : undefined }}
              className="aibrium-pagination__button"
            >
              上一页
            </Link>
          ) : (
            <span className="aibrium-pagination__button is-disabled" aria-disabled="true">
              上一页
            </span>
          )}
          <span className="aibrium-pagination__status">
            第 {home.page} / {home.totalPages} 页
          </span>
          {home.hasNextPage ? (
            <Link
              to="/"
              search={{ page: home.page + 1 }}
              className="aibrium-pagination__button"
            >
              下一页
            </Link>
          ) : (
            <span className="aibrium-pagination__button is-disabled" aria-disabled="true">
              下一页
            </span>
          )}
        </nav>
      )}
    </>
  );
}

function HomeModule({ children }: { children: ReactNode }) {
  return <div className="aibrium-column__item">{children}</div>;
}

export function HomeDashboard({ home }: { home: HomeData }) {
  const { settings } = useAdminStore();
  const config = settings.publicSite ?? DEFAULT_PUBLIC_SITE_CONFIG;
  const modules = sortedModules(config).filter((module) => module.enabled);
  const hasModule = (id: string) => modules.some((module) => module.id === id);
  const heroImage =
    [config.appearance.lightBackgroundImages[0], home.latest.find((post) => post.cover)?.cover]
      .map((value) => safePublicHref(value))
      .find((value): value is string => !!value) ?? "";
  const heroStyle: CSSProperties | undefined = heroImage
    ? {
        backgroundImage: `linear-gradient(90deg, rgba(39, 29, 25, 0.72), rgba(39, 29, 25, 0.2)), url("${heroImage.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll(")", "%29").replaceAll("(", "%28")}")`,
      }
    : undefined;

  return (
    <div className="aibrium-home">
      <section className="aibrium-hero" style={heroStyle}>
        <div className="aibrium-hero__content">
          <p className="aibrium-hero__eyebrow">{config.identity.siteName}</p>
          <h1>{config.homepage.welcomeTitle || config.identity.slogan}</h1>
          <p>{config.homepage.welcomeDescription || config.identity.description}</p>
        </div>
      </section>

      <div className="aibrium-search-band">
        <PublicSearch placeholder={config.homepage.searchPlaceholder} />
      </div>

      <div className="aibrium-layout">
        <aside className="aibrium-column aibrium-column--left">
          {hasModule("profile") && (
            <HomeModule>
              <ProfileOverview config={config} home={home} />
            </HomeModule>
          )}
          {hasModule("navigationGrid") && (
            <HomeModule>
              <PublicNavigationGrid config={config} />
            </HomeModule>
          )}
          <HomeModule>
            <SiteClock />
          </HomeModule>
          {hasModule("siteStats") && (
            <HomeModule>
              <SiteStats config={config} home={home} />
            </HomeModule>
          )}
        </aside>

        <section className="aibrium-column aibrium-column--center" aria-label="最新文章">
          {hasModule("latestPosts") && <LatestPosts config={config} home={home} />}
        </section>

        <aside className="aibrium-column aibrium-column--right">
          <HomeModule>
            <WeatherCard />
          </HomeModule>
          {hasModule("publishCalendar") && (
            <HomeModule>
              <PublishCalendar
                config={config}
                initialDays={home.calendar}
                initialMonth={{ year: home.calendarYear, month: home.calendarMonth }}
              />
            </HomeModule>
          )}
          {hasModule("friendsEntry") && (
            <HomeModule>
              <FriendsEntry config={config} home={home} />
            </HomeModule>
          )}
        </aside>
      </div>
    </div>
  );
}
