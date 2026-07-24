import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Hero } from "@/components/home/Hero";
import { PostList } from "@/components/home/PostList";
import { Sidebar } from "@/components/home/Sidebar";
import { useAdminStore } from "@/lib/admin-store";
import { isPublished } from "@/lib/sample-posts";

export const Route = createFileRoute("/")({
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
  const { posts } = useAdminStore();
  const published = useMemo(() => posts.filter(isPublished), [posts]);

  return (
    <>
      <Hero query={query} onQueryChange={setQuery} />

      <div className="mx-auto max-w-6xl px-6 pb-16">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
          <PostList posts={published} query={query} />
          <Sidebar />
        </div>
      </div>
    </>
  );
}
