import { Link } from "@tanstack/react-router";

import { ArticleCard } from "@/components/home/ArticleCard";
import type { HomePost } from "@/lib/home.functions";

/**
 * 首页唯一的区块：最新文章。
 *
 * 桌面端刻意排成三列，配合收紧的留白让 12 篇连同顶栏、页脚一起落在一屏内，
 * 读者不需要滚动就能看完首页。归档总数并进标题右侧的入口，
 * 原本由主理人区承载的这条信息不至于丢掉。
 */
export function ArticleSection({ posts, totalPosts }: { posts: HomePost[]; totalPosts: number }) {
  return (
    <section aria-labelledby="articles-title" className="mx-auto max-w-6xl px-6 pt-6 pb-5">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <p className="font-latin text-xs font-medium tracking-[0.2em] text-primary uppercase">
            Articles
          </p>
          <h2
            id="articles-title"
            className="mt-1 text-2xl font-bold tracking-tight text-foreground"
          >
            最新文章
          </h2>
        </div>
        <Link
          to="/archive"
          className="font-latin shrink-0 rounded-md text-sm text-primary transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {totalPosts.toLocaleString("en-US")} 篇归档 →
        </Link>
      </div>

      {posts.length > 0 ? (
        <div className="grid grid-cols-1 border-b border-border sm:grid-cols-2 sm:gap-x-10 xl:grid-cols-3 xl:gap-x-8">
          {posts.map((post) => (
            <ArticleCard key={post.slug} post={post} />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          还没有已发布的文章。
        </p>
      )}
    </section>
  );
}
