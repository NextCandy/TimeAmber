import { createFileRoute } from "@tanstack/react-router";

import { ArticleSection } from "@/components/home/ArticleSection";
import { AuthorPane } from "@/components/home/AuthorPane";
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
      <ArticleSection posts={home.latest} />

      <AuthorPane totalPosts={home.totalPosts} />

      <div className="mx-auto w-full max-w-6xl px-6 pb-14">
        <VisitPulse trend={visitTrend} />
      </div>
    </div>
  );
}
