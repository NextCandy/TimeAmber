import { createFileRoute } from "@tanstack/react-router";
import { PostEditor } from "@/components/admin/PostEditor";

export const Route = createFileRoute("/_authenticated/admin/posts/new")({
  component: () => (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-6 font-display text-2xl font-semibold">新建文章</h1>
      <PostEditor />
    </div>
  ),
});
