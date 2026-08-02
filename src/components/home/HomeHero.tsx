import { Link } from "@tanstack/react-router";

type HomeHeroProps = {
  totalPosts: number;
  totalTags: number;
  totalCategories: number;
};

const formatCount = (value: number) => value.toLocaleString("en-US");

/** 首页的品牌引子：只承载站点定位与实时内容规模，保持编辑型首页的轻量感。 */
export function HomeHero({ totalPosts, totalTags, totalCategories }: HomeHeroProps) {
  return (
    <section aria-labelledby="home-title" className="home-hero relative isolate overflow-hidden">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 py-8 text-center sm:py-10">
        <h1
          id="home-title"
          className="text-4xl leading-tight font-bold tracking-[-0.03em] text-foreground sm:text-5xl"
        >
          时光琥珀 <span className="text-accent-amber">·</span>{" "}
          <span className="font-latin">TimeAmber</span>
        </h1>

        <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
          时光成珀，字字如初。一个关于剪藏、自建服务与 AI Agent 实践的中文博客。
        </p>

        <dl className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
          <div className="rounded-2xl border border-border/70 bg-card/70 p-1.5 shadow-[0_4px_16px_-8px_color-mix(in_oklch,var(--foreground)_15%,transparent)] backdrop-blur-sm">
            <div className="flex items-center gap-3 rounded-xl bg-card px-4 py-2">
              <dt className="sr-only">文章数量</dt>
              <dd>
                <Link
                  to="/archive"
                  className="group inline-flex items-baseline gap-1.5 transition-colors hover:text-foreground"
                >
                  <span className="font-latin text-base font-semibold text-accent-amber tabular-nums group-hover:text-accent-amber-strong">
                    {formatCount(totalPosts)}
                  </span>
                  篇文章
                </Link>
              </dd>
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/70 p-1.5 shadow-[0_4px_16px_-8px_color-mix(in_oklch,var(--foreground)_15%,transparent)] backdrop-blur-sm">
            <div className="flex items-center gap-3 rounded-xl bg-card px-4 py-2">
              <dt className="sr-only">标签数量</dt>
              <dd>
                <Link
                  to="/categories"
                  search={{ tag: undefined, c: undefined }}
                  className="group inline-flex items-baseline gap-1.5 transition-colors hover:text-foreground"
                >
                  <span className="font-latin text-base font-semibold text-accent-amber tabular-nums group-hover:text-accent-amber-strong">
                    {formatCount(totalTags)}
                  </span>
                  个标签
                </Link>
              </dd>
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/70 p-1.5 shadow-[0_4px_16px_-8px_color-mix(in_oklch,var(--foreground)_15%,transparent)] backdrop-blur-sm">
            <div className="flex items-center gap-3 rounded-xl bg-card px-4 py-2">
              <dt className="sr-only">分类数量</dt>
              <dd>
                <Link
                  to="/categories"
                  search={{ tag: undefined, c: undefined }}
                  className="group inline-flex items-baseline gap-1.5 transition-colors hover:text-foreground"
                >
                  <span className="font-latin text-base font-semibold text-accent-amber tabular-nums group-hover:text-accent-amber-strong">
                    {formatCount(totalCategories)}
                  </span>
                  个分类
                </Link>
              </dd>
            </div>
          </div>
        </dl>
      </div>
    </section>
  );
}
