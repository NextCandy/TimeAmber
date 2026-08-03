import { Link } from "@tanstack/react-router";

import { BRAND_ICON } from "@/lib/brand";

type HomeHeroProps = {
  totalPosts: number;
  totalTags: number;
  totalCategories: number;
};

const formatCount = (value: number) => value.toLocaleString("en-US");

/** 首页的品牌引子：左侧表达站点气质，右侧把内容规模变成可探索的入口。 */
export function HomeHero({ totalPosts, totalTags, totalCategories }: HomeHeroProps) {
  return (
    <section aria-labelledby="home-title" className="home-hero relative isolate overflow-hidden">
      <div className="mx-auto grid w-full max-w-6xl items-end gap-10 px-6 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.62fr)] lg:gap-16">
        <div className="max-w-2xl">
          <p className="mb-4 text-xs font-medium tracking-[0.22em] text-accent-amber uppercase">
            中文独立博客
          </p>
          <h1
            id="home-title"
            className="text-left text-4xl leading-[1.06] font-bold tracking-[-0.045em] text-foreground sm:text-6xl"
          >
            时光琥珀 <span className="text-accent-amber">·</span>{" "}
            <span className="font-latin">TimeAmber</span>
          </h1>

          <p className="mt-5 max-w-xl text-left text-sm leading-7 text-muted-foreground sm:text-base">
            时光成珀，字字如初。一个关于剪藏、自建服务与 AI Agent 实践的中文博客。
          </p>

          <Link
            to="/archive"
            preload="intent"
            className="press-feedback mt-7 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-[0_12px_24px_-16px_color-mix(in_oklch,var(--primary)_70%,transparent)] transition-colors hover:bg-primary-glow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            浏览文章 <span aria-hidden="true">→</span>
          </Link>
        </div>

        <div className="home-hero-index relative overflow-hidden rounded-2xl border border-border/70 bg-card/75 p-5 shadow-[0_24px_50px_-36px_color-mix(in_oklch,var(--foreground)_45%,transparent)] backdrop-blur-sm sm:p-6">
          <div className="absolute -top-14 -right-10 h-36 w-36 rounded-full bg-accent-amber/10 blur-3xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
                内容索引
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                从一篇文章开始，沿着分类和标签继续阅读。
              </p>
            </div>
            <img
              src={BRAND_ICON}
              alt=""
              width={44}
              height={44}
              className="h-11 w-11 object-contain drop-shadow-brand-sm"
            />
          </div>

          <dl className="relative mt-7 grid grid-cols-3 divide-x divide-border/70">
            <div className="pr-3">
              <dt className="text-[11px] text-muted-foreground">文章</dt>
              <dd className="mt-1 font-latin text-2xl font-semibold tracking-[-0.04em] text-foreground tabular-nums">
                {formatCount(totalPosts)}
              </dd>
            </div>
            <div className="px-3">
              <dt className="text-[11px] text-muted-foreground">标签</dt>
              <dd className="mt-1 font-latin text-2xl font-semibold tracking-[-0.04em] text-foreground tabular-nums">
                {formatCount(totalTags)}
              </dd>
            </div>
            <div className="pl-3">
              <dt className="text-[11px] text-muted-foreground">分类</dt>
              <dd className="mt-1 font-latin text-2xl font-semibold tracking-[-0.04em] text-foreground tabular-nums">
                {formatCount(totalCategories)}
              </dd>
            </div>
          </dl>

          <Link
            to="/categories"
            search={{ tag: undefined, c: undefined }}
            preload="intent"
            className="relative mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-accent-amber transition-colors hover:text-accent-amber-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            按主题浏览 <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
