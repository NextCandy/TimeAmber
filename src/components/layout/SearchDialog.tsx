import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileText, FolderTree, Tag } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAdminStore } from "@/lib/admin-store";
import { isPublished } from "@/lib/sample-posts";

const MAX_POSTS = 8;
const MAX_FACETS = 6;

/** 全站搜索面板。Cmd/Ctrl+K 打开，也由 Navbar 的搜索按钮触发。 */
export function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { posts } = useAdminStore();
  const [query, setQuery] = useState("");

  const published = useMemo(() => posts.filter(isPublished), [posts]);

  // cmdk 自带的模糊过滤在近两千条上会明显掉帧，这里自己按关键词裁剪后再交给它渲染。
  const { matchedPosts, matchedCategories, matchedTags } = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return {
        matchedPosts: published.slice(0, MAX_POSTS),
        matchedCategories: [] as string[],
        matchedTags: [] as string[],
      };
    }

    const categories = new Set<string>();
    const tags = new Set<string>();
    const hits = [];

    for (const post of published) {
      if (post.category.toLowerCase().includes(q)) categories.add(post.category);
      for (const tag of post.tags) {
        if (tag.toLowerCase().includes(q)) tags.add(tag);
      }
      if (hits.length < MAX_POSTS) {
        const haystack =
          `${post.title} ${post.excerpt} ${post.category} ${post.tags.join(" ")}`.toLowerCase();
        if (haystack.includes(q)) hits.push(post);
      }
    }

    return {
      matchedPosts: hits,
      matchedCategories: [...categories].slice(0, MAX_FACETS),
      matchedTags: [...tags].slice(0, MAX_FACETS),
    };
  }, [published, query]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const go = (to: string, search?: Record<string, string>) => {
    onOpenChange(false);
    void navigate({ to, search });
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="搜索文章、分类、标签…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>没有匹配的内容。</CommandEmpty>

        {matchedCategories.length > 0 && (
          <CommandGroup heading="分类">
            {matchedCategories.map((name) => (
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

        {matchedTags.length > 0 && (
          <CommandGroup heading="标签">
            {matchedTags.map((name) => (
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

        <CommandGroup heading={query ? "文章" : "最新文章"}>
          {matchedPosts.map((post) => (
            <CommandItem
              key={post.slug}
              value={`文章 ${post.slug} ${post.title}`}
              onSelect={() => go(`/posts/${post.slug}`)}
            >
              <FileText className="text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{post.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{post.category}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
