import { createFileRoute } from "@tanstack/react-router";

import { HomeDashboard } from "@/components/home/HomeDashboard";
import { loadHomeData } from "@/lib/home.functions";
import { SITE_URL } from "@/lib/brand";

export const Route = createFileRoute("/")({
  // 首页数据在服务端取好，首屏直出真实内容。
  loader: async () => ({ home: await loadHomeData() }),
  head: () => ({
    meta: [
      { title: "TimeAmber · 时光琥珀" },
      { name: "description", content: "时光成珀，字字如初。最新剪藏、自建服务与 AI Agent 笔记。" },
      { property: "og:title", content: "TimeAmber · 时光琥珀" },
      { property: "og:description", content: "时光成珀，字字如初。" },
      { property: "og:url", content: SITE_URL },
    ],
    links: [{ rel: "canonical", href: SITE_URL }],
  }),
  component: Index,
});

function Index() {
  const { home } = Route.useLoaderData();
  return <HomeDashboard home={home} />;
}
