import { ArrowUpRight, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { FriendsEntry } from "@/components/public/FriendsEntry";
import { PopularTaxonomies } from "@/components/public/PopularTaxonomies";
import { ProfileOverview } from "@/components/public/ProfileOverview";
import { PublishCalendar } from "@/components/public/PublishCalendar";
import { PublicNavigationGrid } from "@/components/public/PublicNavigationGrid";
import { PublicSearch } from "@/components/public/PublicSearch";
import { SiteStats } from "@/components/public/SiteStats";
import { GlassPanel } from "@/components/public/GlassPanel";
import { DEFAULT_POST_COVER } from "@/lib/brand";
import { useAdminStore } from "@/lib/admin-store";
import {
  DEFAULT_PUBLIC_SITE_CONFIG,
  sortedModules,
  type PublicSiteConfig,
} from "@/lib/public-site-settings";
import type { HomeData, HomePost } from "@/lib/home.functions";
import { linkRel, linkTarget } from "@/lib/post-link";
import { formatDateKey } from "@/lib/date";

function PostRow({ post, featured = false }: { post: HomePost; featured?: boolean }) {
  const isExternal = !!post.externalUrl;
  const href = post.externalUrl || `/posts/${post.slug}`;
  const className = featured
    ? "group flex min-w-0 flex-col gap-4 rounded-2xl border border-border/70 bg-background/20 p-4 transition-all hover:-translate-y-0.5 hover:border-accent-amber/60 sm:flex-row sm:p-5"
    : "group flex min-w-0 items-center gap-3 rounded-xl border-b border-border/50 px-2 py-3 transition-colors last:border-b-0 hover:bg-background/25";
  const body = (
    <>
      {featured && (
        <img
          src={post.cover || DEFAULT_POST_COVER}
          alt=""
          width={420}
          height={210}
          className="h-40 w-full shrink-0 rounded-xl object-cover sm:h-32 sm:w-56"
          loading="lazy"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <time dateTime={post.publishAt}>{formatDateKey(post.publishAt)}</time>
          {post.category && (
            <span className="rounded-full bg-accent-amber-soft px-2 py-0.5 text-accent-amber">
              {post.category}
            </span>
          )}
          {isExternal && <ExternalLink className="h-3 w-3" aria-label="外部文章" />}
        </span>
        <span
          className={`${featured ? "text-xl sm:text-2xl" : "text-sm sm:text-[15px]"} line-clamp-2 font-medium leading-snug tracking-tight transition-colors group-hover:text-accent-amber`}
        >
          {post.title}
        </span>
        {featured && post.excerpt && (
          <span className="line-clamp-2 text-sm leading-6 text-muted-foreground">
            {post.excerpt}
          </span>
        )}
        {featured && post.tags.length > 0 && (
          <span className="flex flex-wrap gap-1.5">
            {post.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="text-[11px] text-muted-foreground">
                #{tag}
              </span>
            ))}
          </span>
        )}
      </span>
      {!featured && (
        <ArrowUpRight
          className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-accent-amber"
          aria-hidden="true"
        />
      )}
    </>
  );
  if (isExternal && post.externalUrl)
    return (
      <a
        href={href}
        target={linkTarget(post.externalUrl)}
        rel={linkRel(post.externalUrl)}
        className={className}
      >
        {body}
      </a>
    );
  return (
    <Link to="/posts/$slug" params={{ slug: post.slug }} preload="intent" className={className}>
      {body}
    </Link>
  );
}

function LatestPosts({ config, home }: { config: PublicSiteConfig; home: HomeData }) {
  const [featured, ...rest] = home.latest;
  return (
    <GlassPanel className="p-5 sm:p-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.16em] text-accent-amber uppercase">Journal</p>
          <h2 className="mt-1 text-xl font-semibold">{config.homepage.articleSectionTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {config.homepage.articleSectionSubtitle}
          </p>
        </div>
        <Link
          to="/archive"
          className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-accent-amber"
        >
          {config.homepage.archiveButtonText}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {featured ? (
        <div className="mt-5 space-y-2">
          <PostRow post={featured} featured />
          {rest.map((post) => (
            <PostRow key={post.slug} post={post} />
          ))}
        </div>
      ) : (
        <p className="mt-6 rounded-xl bg-background/25 p-6 text-center text-sm text-muted-foreground">
          还没有已发布的文章。
        </p>
      )}
    </GlassPanel>
  );
}

export function HomeDashboard({ home }: { home: HomeData }) {
  const { settings } = useAdminStore();
  const config = settings.publicSite ?? DEFAULT_PUBLIC_SITE_CONFIG;
  const modules = sortedModules(config).filter((module) => module.enabled);
  const hasModule = (id: string) => modules.some((module) => module.id === id);

  return (
    <div className="public-home mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
      <section className="public-welcome grid items-end gap-8 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.62fr)] lg:gap-14">
        <div className="max-w-3xl">
          <p className="text-xs font-medium tracking-[0.22em] text-accent-amber uppercase">
            {config.homepage.eyebrow}
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.055em] sm:text-6xl">
            {config.homepage.welcomeTitle}
            <span className="ml-3 text-accent-amber">{config.identity.navSuffix}</span>
            <span className="ml-3 font-brand text-4xl font-normal tracking-normal sm:text-6xl">
              {config.identity.siteName}
            </span>
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            {config.homepage.welcomeDescription}
          </p>
          <div className="mt-7 max-w-2xl">
            <PublicSearch placeholder={config.homepage.searchPlaceholder} />
          </div>
        </div>
        <div className="public-welcome__mark hidden justify-self-end lg:block">
          <img
            src={config.identity.logoUrl || DEFAULT_POST_COVER}
            alt=""
            width={176}
            height={176}
            className="h-44 w-44 object-contain opacity-90 drop-shadow-2xl"
          />
        </div>
      </section>

      <div className="public-dashboard-grid">
        {modules.map((module) => {
          switch (module.id) {
            case "profile":
              return (
                <section key={module.id} className="public-module public-module--profile">
                  <ProfileOverview config={config} home={home} />
                </section>
              );
            case "navigationGrid":
              return (
                <section key={module.id} className="public-module public-module--navigation">
                  <PublicNavigationGrid config={config} />
                </section>
              );
            case "latestPosts":
              return (
                <section key={module.id} className="public-module public-module--wide">
                  <LatestPosts config={config} home={home} />
                </section>
              );
            case "siteStats":
              return (
                <section key={module.id} className="public-module">
                  <SiteStats config={config} home={home} />
                </section>
              );
            case "publishCalendar":
              return (
                <section key={module.id} className="public-module">
                  <PublishCalendar
                    config={config}
                    initialDays={home.calendar}
                    initialMonth={{ year: home.calendarYear, month: home.calendarMonth }}
                  />
                </section>
              );
            case "popularCategories":
              return (
                <section key={module.id} className="public-module public-module--wide">
                  <PopularTaxonomies
                    config={config}
                    categories={home.popularCategories}
                    tags={hasModule("popularTags") ? home.popularTags : []}
                  />
                </section>
              );
            case "popularTags":
              return hasModule("popularCategories") ? null : (
                <section key={module.id} className="public-module public-module--wide">
                  <PopularTaxonomies config={config} categories={[]} tags={home.popularTags} />
                </section>
              );
            case "friendsEntry":
              return (
                <section key={module.id} className="public-module public-module--wide">
                  <FriendsEntry config={config} home={home} />
                </section>
              );
          }
        })}
      </div>
    </div>
  );
}
