import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { ArticleCard } from "@/components/home/ArticleCard";
import { SectionHeader } from "@/components/home/SectionHeader";
import type { HomePost } from "@/lib/home.functions";

/** 最新文章：三列开放式编辑网格，封面负责视觉节奏。 */
export function ArticleSection({ posts }: { posts: HomePost[] }) {
  return (
    <section aria-labelledby="articles-title" className="mx-auto w-full max-w-[1200px] px-6 py-12">
      <div id="articles-title">
        <SectionHeader
          kicker="Articles"
          title="最新文章"
          action={
            <Link
              to="/archive"
              className="inline-flex shrink-0 items-center gap-1 text-base font-semibold text-primary transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              全部文章
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          }
        />
      </div>

      {posts.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {posts.map((post) => (
            <ArticleCard key={post.slug} post={post} />
          ))}
        </div>
      ) : (
        <p className="border-y border-border py-12 text-center text-sm text-muted-foreground">
          还没有已发布的文章。
        </p>
      )}
    </section>
  );
}
