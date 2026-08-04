import { createFileRoute, redirect } from "@tanstack/react-router";

import { HomeDashboard } from "@/components/home/HomeDashboard";
import { loadHomeData, normalizeHomePage } from "@/lib/home.functions";
import { SITE_URL } from "@/lib/brand";

export const Route = createFileRoute("/")({
  validateSearch: (search) => {
    const raw = search.page;
    const page = normalizeHomePage(raw);
    return {
      page: Number.isInteger(page) && page > 1 && page <= 10_000 ? page : undefined,
    };
  },
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  // 首页数据在服务端取好，首屏直出真实内容。
  loader: async ({ deps }) => {
    const home = await loadHomeData({ data: { page: deps.page } });
    if (home.page !== deps.page) {
      throw redirect({
        to: "/",
        search: home.page > 1 ? { page: home.page } : { page: undefined },
        replace: true,
      });
    }
    return { home };
  },
  head: ({ match }) => {
    const page = match.search.page ?? 1;
    const canonical = page > 1 ? `${SITE_URL}/?page=${page}` : SITE_URL;
    return {
      meta: [
        { title: page > 1 ? `TimeAmber · 时光琥珀 · 第 ${page} 页` : "TimeAmber · 时光琥珀" },
        { name: "description", content: "时光成珀，字字如初。最新剪藏、自建服务与 AI Agent 笔记。" },
        { property: "og:title", content: page > 1 ? `TimeAmber · 第 ${page} 页` : "TimeAmber · 时光琥珀" },
        { property: "og:description", content: "时光成珀，字字如初。" },
        { property: "og:url", content: canonical },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: Index,
});

function Index() {
  const { home } = Route.useLoaderData();
  return <HomeDashboard home={home} />;
}
