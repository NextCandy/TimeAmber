import { useNavigate } from "@tanstack/react-router";
import { FileText, FolderTree, Search, Tags } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { useAdminStore } from "@/lib/admin-store";

type SearchResult =
  | { kind: "post"; key: string; label: string; meta: string; slug: string }
  | { kind: "category"; key: string; label: string; meta: string }
  | { kind: "tag"; key: string; label: string; meta: string };

const normalize = (value: string) => value.trim().toLocaleLowerCase("zh-CN");

/** 后台常驻搜索：复用已经载入的管理数据，不额外发送全量查询。 */
export function AdminGlobalSearch() {
  const navigate = useNavigate();
  const { posts, categories, tags } = useAdminStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const q = normalize(useDeferredValue(query));
  const postIndex = useMemo(
    () =>
      posts.map((post) => ({
        post,
        haystack: normalize([post.title, post.category, ...post.tags].join(" ")),
      })),
    [posts],
  );

  const results = useMemo<SearchResult[]>(() => {
    if (!q) return [];
    const postHits = postIndex
      .filter(({ haystack }) => haystack.includes(q))
      .slice(0, 6)
      .map(({ post }) => ({
        kind: "post" as const,
        key: `post:${post.slug}`,
        label: post.title,
        meta: [post.category, post.tags.slice(0, 2).join(" · ")].filter(Boolean).join(" · "),
        slug: post.slug,
      }));
    const categoryHits = categories
      .filter((category) => normalize(category.name).includes(q))
      .slice(0, 2)
      .map((category) => ({
        kind: "category" as const,
        key: `category:${category.name}`,
        label: category.name,
        meta: "分类管理",
      }));
    const tagHits = tags
      .filter((tag) => normalize(tag.name).includes(q))
      .slice(0, 2)
      .map((tag) => ({
        kind: "tag" as const,
        key: `tag:${tag.name}`,
        label: tag.name,
        meta: "标签管理",
      }));
    return [...postHits, ...categoryHits, ...tagHits];
  }, [categories, postIndex, q, tags]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  function choose(result: SearchResult) {
    setQuery("");
    setFocused(false);
    if (result.kind === "post") {
      void navigate({ to: "/admin/posts/$slug/edit", params: { slug: result.slug } });
    } else if (result.kind === "category") {
      void navigate({ to: "/admin/categories" });
    } else {
      void navigate({ to: "/admin/tags" });
    }
  }

  const open = focused && Boolean(q);

  return (
    <div className="relative ml-auto hidden w-full max-w-sm md:block">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label="后台全局搜索"
        aria-expanded={open}
        aria-controls="admin-search-results"
        aria-activedescendant={
          open && results[activeIndex] ? `admin-${results[activeIndex].key}` : undefined
        }
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && results.length) {
            event.preventDefault();
            setActiveIndex((index) => (index + 1) % results.length);
          } else if (event.key === "ArrowUp" && results.length) {
            event.preventDefault();
            setActiveIndex((index) => (index - 1 + results.length) % results.length);
          } else if (event.key === "Enter" && results[activeIndex]) {
            event.preventDefault();
            choose(results[activeIndex]);
          } else if (event.key === "Escape") {
            setQuery("");
            inputRef.current?.blur();
          }
        }}
        placeholder="搜索文章、标签、分类…"
        className="h-9 w-full rounded-md border border-border bg-background/80 pr-14 pl-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-accent-amber/60 focus:ring-2 focus:ring-ring"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 font-latin text-[10px] text-muted-foreground">
        ⌘K
      </kbd>

      {open && (
        <div
          id="admin-search-results"
          role="listbox"
          className="absolute top-full right-0 z-50 mt-2 max-h-80 w-full min-w-80 overflow-y-auto rounded-lg border border-border bg-popover p-1.5 shadow-xl"
        >
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">没有匹配结果</p>
          ) : (
            results.map((result, index) => {
              const Icon =
                result.kind === "post" ? FileText : result.kind === "category" ? FolderTree : Tags;
              return (
                <button
                  key={result.key}
                  id={`admin-${result.key}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(result)}
                  className={`flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                    index === activeIndex ? "bg-accent-amber-soft" : "hover:bg-accent"
                  }`}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{result.label}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {result.meta}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
