import { Link } from "@tanstack/react-router";

import { ArticleCard } from "@/components/home/ArticleCard";
import type { HomePost } from "@/lib/home.functions";

/**
 * 首页唯一的区块：最新文章。
 *
 * 桌面端两列。整块用 flex-1 吃掉视口剩余高度、行用 auto-rows-fr 等分，
 * 于是列表总能刚好填满一屏、页脚上方不留空白，也不会出现滚动条。
 * 光靠等分还不够 —— 固定条数时高屏会把行拉得又空又散，所以显示几行由
 * styles.css 里 .home-list 的视口高度断点决定（矮屏隐藏尾部），
 * 行高因此稳定在 90px 上下。改条数要连着那组断点一起改。
 *
 * 归档总数并进标题右侧的入口，原本由主理人区承载的这条信息不至于丢掉。
 */
export function ArticleSection({ posts, totalPosts }: { posts: HomePost[]; totalPosts: number }) {
  return (
    <section
      aria-labelledby="articles-title"
      className="mx-auto flex w-full max-w-6xl flex-col px-6 pt-6 pb-5 sm:flex-1"
    >
      <div className="mb-3 flex shrink-0 items-end justify-between gap-4">
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
        <div className="home-list grid grid-cols-1 border-b border-border sm:flex-1 sm:auto-rows-fr sm:grid-cols-2 sm:gap-x-10">
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
