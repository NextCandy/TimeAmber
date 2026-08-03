import { createFileRoute, Link } from "@tanstack/react-router";
import { PostEditor } from "@/components/admin/PostEditor";
import { useAdminStore } from "@/lib/admin-store";

export const Route = createFileRoute("/_authenticated/admin/posts/$slug/edit")({
  component: EditPostPage,
});

function EditPostPage() {
  const { slug } = Route.useParams();
  const { posts } = useAdminStore();
  const post = posts.find((p) => p.slug === slug);

  if (!post) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="font-display text-lg">没有找到这篇文章</p>
        <Link to="/admin/posts" className="mt-3 inline-block text-sm text-primary hover:underline">
          ← 返回文章列表
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-6 font-display text-2xl font-semibold">
        编辑文章 · <span className="font-mono text-base text-muted-foreground">{post.slug}</span>
      </h1>
      <PostEditor initial={post} />
    </div>
  );
}
