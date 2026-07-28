import { Link } from "@tanstack/react-router";
import { formatDateKey } from "@/lib/date";
import type { Post } from "@/lib/sample-posts";

export function PostCard({ post }: { post: Post }) {
  const isHtml = post.type === "html" && post.externalUrl;

  const body = (
    <div className="flex min-w-0 flex-1 items-start justify-between gap-6 py-4">
      <h2 className="line-clamp-2 min-w-0 break-words font-sans text-[17px] leading-[1.45] font-medium tracking-[-0.012em] text-foreground transition-colors [overflow-wrap:anywhere] group-hover:text-primary">
        {post.title}
      </h2>
      <time
        dateTime={post.publishAt}
        className="font-latin mt-0.5 shrink-0 text-[11px] leading-5 tracking-[0.06em] text-[var(--text-faint)]"
      >
        {formatDateKey(post.publishAt)}
      </time>
    </div>
  );

  const className =
    "group flex min-w-0 w-full border-t border-border px-2 transition-colors hover:bg-accent/35 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

  if (isHtml) {
    const target = post.openIn ?? "_blank";
    return (
      <a
        href={post.externalUrl}
        target={target}
        rel={target === "_blank" ? "noopener noreferrer" : undefined}
        className={className}
      >
        {body}
      </a>
    );
  }

  return (
    <Link to="/posts/$slug" params={{ slug: post.slug }} className={className}>
      {body}
    </Link>
  );
}
