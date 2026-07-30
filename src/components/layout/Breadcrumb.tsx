import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

export type Crumb = {
  label: string;
  /** 不给 to 就是当前页，渲染成纯文本。 */
  to?: string;
  search?: Record<string, string>;
};

/**
 * 面包屑。最后一项是当前页，不做成链接（点了没去处，还会被读屏器念成可跳转）。
 * 中间项在窄屏会被压缩：标题那一段通常很长，让它 truncate 而不是把整行挤换行。
 */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="面包屑" className="mb-6 min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />}
              {isLast || !item.to ? (
                <span
                  className="truncate text-foreground/80"
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.to}
                  search={item.search}
                  className="shrink-0 rounded-sm transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
