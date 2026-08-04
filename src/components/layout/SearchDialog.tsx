import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { FileText, FolderTree, Loader2, Tag } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { EmptyState } from "@/components/ui/empty-state";
import { isExternalHref } from "@/lib/post-link";
import { searchPosts, type SearchResults } from "@/lib/public-posts.functions";

const EMPTY: SearchResults = { posts: [], categories: [], tags: [] };
const DEBOUNCE_MS = 180;

/** 每个条目的 value，选中态受控时要和渲染处用的字符串完全一致。 */
const categoryValue = (name: string) => `分类 ${name}`;
const tagValue = (name: string) => `标签 ${name}`;
const postValue = (post: SearchResults["posts"][number]) => `文章 ${post.slug} ${post.title}`;

/** 结果里的第一条，用来做默认高亮 —— 顺序与下面的渲染顺序一致。 */
function firstValue(results: SearchResults): string {
  if (results.categories[0]) return categoryValue(results.categories[0]);
  if (results.tags[0]) return tagValue(results.tags[0]);
  if (results.posts[0]) return postValue(results.posts[0]);
  return "";
}

/** 底部提示条里的按键标记。 */
function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="font-latin inline-flex h-5 min-w-5 items-center justify-center border border-border px-1.5 text-[10px] text-muted-foreground">
      {children}
    </kbd>
  );
}

/**
 * 全站搜索面板。Cmd/Ctrl+K 打开，也由 Navbar 的搜索按钮触发。
 *
 * 匹配放在服务端：原来是把全部文章连同 excerpt 序列化到浏览器再遍历，
 * 那是 root loader 必须下发全量文章的唯一理由。现在改成按键防抖查库，
 * 搜索范围反而从「标题+摘要」扩到了正文。
 */
export function SearchDialog({
  open,
  onOpenChange,
  placeholder = "搜索文章、分类、标签…",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder?: string;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  // shouldFilter 关掉后 cmdk 不再自己维护高亮，这里受控 —— 否则 ↑↓ 和回车全是摆设。
  const [selected, setSelected] = useState("");
  // 网络回来的顺序不保证和敲键顺序一致，用递增序号丢弃过期响应。
  const seqRef = useRef(0);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(EMPTY);
      setSelected("");
      return;
    }
    const seq = ++seqRef.current;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void searchPosts({ data: { q: query } })
        .then((res) => {
          if (seqRef.current !== seq) return;
          setResults(res);
          // 结果换了就把高亮落回第一条，回车才有明确目标
          setSelected(firstValue(res));
        })
        .catch(() => {
          if (seqRef.current === seq) setResults(EMPTY);
        })
        .finally(() => {
          if (seqRef.current === seq) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  const go = (to: string, search?: Record<string, string>) => {
    onOpenChange(false);
    void navigate({ to, search });
  };

  // 剪藏类文章的正文是站内 /cdn/… 的离线页，不是 router 管得到的路由，
  // 直接整页打开；走 navigate 会当成前端路由匹配不到而 404。
  const openHit = (hit: SearchResults["posts"][number]) => {
    onOpenChange(false);
    if (hit.externalUrl) {
      if (isExternalHref(hit.externalUrl)) {
        window.open(hit.externalUrl, "_blank", "noopener,noreferrer");
      } else {
        window.location.assign(hit.externalUrl);
      }
      return;
    }
    void navigate({ to: `/posts/${hit.slug}` });
  };

  const hasAny =
    results.posts.length > 0 || results.categories.length > 0 || results.tags.length > 0;

  return (
    // 结果已经是服务端筛好的，再让 cmdk 过一次模糊匹配会把命中正文的结果滤掉。
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      shouldFilter={false}
      value={selected}
      onValueChange={setSelected}
      title="站内搜索"
      description="搜索文章、分类与标签"
    >
      <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />

      <CommandList>
        {!hasAny && (
          <CommandEmpty>
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> 搜索中…
              </span>
            ) : query ? (
              <EmptyState
                compact
                title={`没有匹配「${query}」的内容`}
                description="换个关键词再试试。"
              />
            ) : (
              <EmptyState
                compact
                title="输入关键词开始搜索"
                description="可搜索文章、分类与标签。"
              />
            )}
          </CommandEmpty>
        )}

        {results.categories.length > 0 && (
          <CommandGroup heading="分类">
            {results.categories.map((name) => (
              <CommandItem
                key={`c-${name}`}
                value={categoryValue(name)}
                onSelect={() => go("/categories", { c: name })}
              >
                <FolderTree />
                <span className="min-w-0 flex-1 truncate">{name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results.tags.length > 0 && (
          <CommandGroup heading="标签">
            {results.tags.map((name) => (
              <CommandItem
                key={`t-${name}`}
                value={tagValue(name)}
                onSelect={() => go("/categories", { tag: name })}
              >
                <Tag />
                <span className="min-w-0 flex-1 truncate">{name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results.posts.length > 0 && (
          <CommandGroup heading={query ? "文章" : "最新文章"}>
            {results.posts.map((post) => (
              <CommandItem key={post.slug} value={postValue(post)} onSelect={() => openHit(post)}>
                <FileText />
                <span className="min-w-0 flex-1 truncate">{post.title}</span>
                {post.category && (
                  <span className="shrink-0 border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {post.category}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>

      {/* 底部提示条：告诉读者能用键盘，也给面板一个收口 */}
      <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-2.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Key>↑</Key>
          <Key>↓</Key>
          选择
          <span className="mx-1 opacity-40">·</span>
          <Key>↵</Key>
          打开
          <span className="mx-1 opacity-40">·</span>
          <Key>esc</Key>
          关闭
        </span>
        {loading && hasAny && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>
    </CommandDialog>
  );
}
