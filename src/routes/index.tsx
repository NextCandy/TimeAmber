import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Hero } from "@/components/home/Hero";
import { PostList } from "@/components/home/PostList";
import { Sidebar } from "@/components/home/Sidebar";
import { useAdminStore } from "@/lib/admin-store";
import { isPublished } from "@/lib/sample-posts";
import { loadPublicVisitTrend } from "@/lib/state.functions";

export const Route = createFileRoute("/")({
  // 访问趋势在服务端取好，侧栏卡片首屏直出。放在客户端 useEffect 里取会让
  // SSR 输出一个空的柱状图容器，首屏看到的就是一张空卡片。
  loader: async () => ({
    visitTrend: await loadPublicVisitTrend().catch(() => []),
  }),
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
  const [query, setQuery] = useState("");
  const { visitTrend } = Route.useLoaderData();
  const { posts } = useAdminStore();
  const published = useMemo(() => posts.filter(isPublished), [posts]);

  return (
    <>
      <Hero query={query} onQueryChange={setQuery} />

      <div className="mx-auto max-w-6xl px-6 pb-16">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
          <PostList posts={published} query={query} />
          <Sidebar initialTrend={visitTrend} />
        </div>
      </div>
    </>
  );
}
