import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { ArticleCard } from "@/components/home/ArticleCard";
import { SectionHeader } from "@/components/home/SectionHeader";
import { useReveal } from "@/hooks/use-reveal";
import type { HomeCategory, HomePost } from "@/lib/home.functions";

const ALL = "全部";
const VISIBLE = 9;

/**
 * 最新文章区：分类胶囊 + 响应式网格。
 * 分类来自真实数据统计，不写死；筛选在客户端即时完成。
 */
export function ArticleSection({
  posts,
  categories,
}: {
  posts: HomePost[];
  categories: HomeCategory[];
}) {
  const [active, setActive] = useState(ALL);
  const revealRef = useReveal<HTMLElement>();

  const chips = useMemo(() => [ALL, ...categories.map((c) => c.name)], [categories]);
  const filtered = useMemo(
    () => (active === ALL ? posts : posts.filter((p) => p.category === active)).slice(0, VISIBLE),
    [posts, active],
  );

  return (
    <section
      ref={revealRef}
      aria-labelledby="articles-title"
      className="mx-auto max-w-6xl px-6 py-14"
    >
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

      <div className="mb-6 flex flex-wrap gap-3" role="group" aria-label="按分类筛选文章">
        {chips.map((name) => {
          const selected = name === active;
          return (
            <button
              key={name}
              type="button"
              aria-pressed={selected}
              onClick={() => setActive(name)}
              className={`h-9 rounded-[20px] px-4 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                selected
                  ? "bg-primary font-bold text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((post, index) => (
            <ArticleCard key={post.slug} post={post} priority={active === ALL && index === 0} />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          「{active}」暂时没有最新文章，去
          <Link to="/archive" className="mx-1 text-primary hover:underline">
            归档
          </Link>
          看看历史内容。
        </p>
      )}
    </section>
  );
}
