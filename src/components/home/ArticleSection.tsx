import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { ArticleCard } from "@/components/home/ArticleCard";
import { EmptyState } from "@/components/ui/empty-state";
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
  const [listReady, setListReady] = useState(false);
  const featured = posts[0];
  const remainder = posts.slice(1);

  useEffect(() => {
    setListReady(true);
  }, []);

  return (
    <section
      aria-labelledby="articles-title"
      className="mx-auto flex w-full max-w-6xl flex-col px-6 pt-10 pb-12 sm:pt-8"
    >
      <div className="mb-6 flex shrink-0 items-end justify-between gap-4">
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
        <div
          className={`home-list grid grid-cols-1 gap-y-1 border-b border-border sm:grid-cols-2 sm:gap-x-4 sm:gap-y-2 ${listReady ? "is-ready" : ""}`}
        >
          {featured && (
            <ArticleCard
              key={featured.slug}
              post={featured}
              featured
              className="home-list-item sm:col-span-2"
              style={{ transitionDelay: "0ms" }}
            />
          )}
          {remainder.map((post, index) => (
            <ArticleCard
              key={post.slug}
              post={post}
              className={index < 3 ? "home-list-item" : ""}
              style={index < 3 ? { transitionDelay: `${(index + 1) * 40}ms` } : undefined}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="还没有已发布的文章" description="发布第一篇文章后，它会出现在这里。" />
      )}
    </section>
  );
}
