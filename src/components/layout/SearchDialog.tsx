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
import { searchPosts, type SearchResults } from "@/lib/public-posts.functions";

const EMPTY: SearchResults = { posts: [], categories: [], tags: [] };
const DEBOUNCE_MS = 180;

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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  // 网络回来的顺序不保证和敲键顺序一致，用递增序号丢弃过期响应。
  const seqRef = useRef(0);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(EMPTY);
      return;
    }
    const seq = ++seqRef.current;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void searchPosts({ data: { q: query } })
        .then((res) => {
          if (seqRef.current === seq) setResults(res);
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
      if ((hit.openIn ?? "_blank") === "_blank") {
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
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput placeholder="搜索文章、分类、标签…" value={query} onValueChange={setQuery} />
      <CommandList>
        {!hasAny && (
          <CommandEmpty>
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> 搜索中…
              </span>
            ) : (
              "没有匹配的内容。"
            )}
          </CommandEmpty>
        )}

        {results.categories.length > 0 && (
          <CommandGroup heading="分类">
            {results.categories.map((name) => (
              <CommandItem
                key={`c-${name}`}
                value={`分类 ${name}`}
                onSelect={() => go("/categories", { c: name })}
              >
                <FolderTree className="text-muted-foreground" />
                {name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results.tags.length > 0 && (
          <CommandGroup heading="标签">
            {results.tags.map((name) => (
              <CommandItem
                key={`t-${name}`}
                value={`标签 ${name}`}
                onSelect={() => go("/categories", { tag: name })}
              >
                <Tag className="text-muted-foreground" />
                {name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results.posts.length > 0 && (
          <CommandGroup heading={query ? "文章" : "最新文章"}>
            {results.posts.map((post) => (
              <CommandItem
                key={post.slug}
                value={`文章 ${post.slug} ${post.title}`}
                onSelect={() => openHit(post)}
              >
                <FileText className="text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{post.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{post.category}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
