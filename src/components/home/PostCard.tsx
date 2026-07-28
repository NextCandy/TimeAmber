import { Link } from "@tanstack/react-router";
import { formatDate, type Post } from "@/lib/sample-posts";

export function PostCard({ post }: { post: Post }) {
  const isHtml = post.type === "html" && post.externalUrl;

  const body = (
    <div className="flex min-w-0 flex-1 items-baseline justify-between gap-4 px-4 py-3 sm:px-5">
      <h2 className="line-clamp-2 min-w-0 break-words font-sans text-base leading-snug font-semibold tracking-tight text-foreground transition-colors [overflow-wrap:anywhere] group-hover:text-primary">
        {post.title}
      </h2>
      <time dateTime={post.publishAt} className="font-latin shrink-0 text-xs text-muted-foreground">
        {formatDate(post.publishAt)}
      </time>
    </div>
  );

  const className =
    "group flex min-w-0 w-full border border-border bg-card transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

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
