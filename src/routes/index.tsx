import { createFileRoute } from "@tanstack/react-router";

import { ArticleSection } from "@/components/home/ArticleSection";
import { FeaturedCarousel } from "@/components/home/FeaturedCarousel";
import { HeroTwoPane } from "@/components/home/HeroTwoPane";
import { SubscribeSection } from "@/components/home/SubscribeSection";
import { VisitPulse } from "@/components/home/VisitPulse";
import { loadHomeData } from "@/lib/home.functions";
import { loadPublicVisitTrend } from "@/lib/state.functions";

export const Route = createFileRoute("/")({
  // 首页数据与访问趋势都在服务端取好，首屏直出真实内容。
  loader: async () => {
    const [home, visitTrend] = await Promise.all([
      loadHomeData(),
      loadPublicVisitTrend().catch(() => []),
    ]);
    return { home, visitTrend };
  },
  head: () => ({
    meta: [
      { title: "TimeAmber · 时光琥珀" },
      { name: "description", content: "时光成珀，字字如初。最新剪藏、自建服务与 AI Agent 笔记。" },
      { property: "og:title", content: "TimeAmber · 时光琥珀" },
      { property: "og:description", content: "时光成珀，字字如初。" },
    ],
  }),
  component: Index,
});

function Index() {
  const { home, visitTrend } = Route.useLoaderData();

  return (
    <div className="flex flex-col">
      <HeroTwoPane totalPosts={home.totalPosts} />

      <div className="mx-auto w-full max-w-6xl px-6">
        <VisitPulse trend={visitTrend} />
      </div>

      <ArticleSection
        posts={home.latest}
        byCategory={home.byCategory}
        categories={home.categories}
      />

      <FeaturedCarousel posts={home.featured} />

      <SubscribeSection />
    </div>
  );
}
