import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { PostEditor } from "@/components/admin/PostEditor";
import { loadAdminPost } from "@/lib/state.functions";
import type { Post } from "@/lib/sample-posts";

export const Route = createFileRoute("/_authenticated/admin/posts/$slug/edit")({
  component: EditPostPage,
});

function EditPostPage() {
  const { slug } = Route.useParams();
  const loadPost = useServerFn(loadAdminPost);
  const [post, setPost] = useState<Post | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setPost(undefined);
    void loadPost({ data: { slug } })
      .then((next) => {
        if (!cancelled) setPost(next);
      })
      .catch(() => {
        if (!cancelled) setPost(null);
      });
    return () => {
      cancelled = true;
    };
  }, [loadPost, slug]);

  if (post === undefined) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center text-sm text-muted-foreground">
        正在加载文章…
      </div>
    );
  }

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
