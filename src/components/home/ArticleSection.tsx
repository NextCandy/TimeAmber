import { Link } from "@tanstack/react-router";

import { ArticleCard } from "@/components/home/ArticleCard";
import { SectionHeader } from "@/components/home/SectionHeader";
import type { HomePost } from "@/lib/home.functions";

/** 最新文章：响应式网格，首卡描边强调。 */
export function ArticleSection({ posts }: { posts: HomePost[] }) {
  return (
    <section aria-labelledby="articles-title" className="mx-auto max-w-6xl px-6 pt-10 pb-14">
      <div id="articles-title">
        <SectionHeader
          kicker="Articles"
          title="最新文章"
          action={
            <Link
              to="/archive"
              className="shrink-0 rounded-md text-sm text-primary transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              查看全部
            </Link>
          }
        />
      </div>

      {posts.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {posts.map((post, index) => (
            <ArticleCard key={post.slug} post={post} priority={index === 0} />
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
