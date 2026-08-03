import { useEffect, useState } from "react";
import { slugify } from "@/lib/slugify";

// 保持既有导入路径可用（历史上 slugify 从本模块导出）。
export { slugify };

export type TocItem = { id: string; text: string; level: 1 | 2 };

export function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();
    let level: 1 | 2 | null = null;
    let text = "";
    if (line.startsWith("## ")) {
      level = 2;
      text = line.slice(3);
    } else if (line.startsWith("# ")) {
      level = 1;
      text = line.slice(2);
    }
    if (level && text) {
      items.push({ id: slugify(text), text, level });
    }
  }
  return items;
}

export function TableOfContents({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    if (items.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );
    items.forEach((it) => {
      const el = document.getElementById(it.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav aria-label="目录" className="text-sm">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        目录
      </p>
      <ul className="space-y-1.5 border-l border-border/70">
        {items.map((it) => {
          const isActive = activeId === it.id;
          return (
            <li key={it.id}>
              <a
                href={`#${it.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  const el = document.getElementById(it.id);
                  if (el) {
                    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                    window.scrollTo({
                      top: el.getBoundingClientRect().top + window.scrollY - 80,
                      behavior: reduce ? "auto" : "smooth",
                    });
                    history.replaceState(null, "", `#${it.id}`);
                  }
                }}
                className={`block border-l-2 -ml-px py-1 transition-colors ${
                  it.level === 2 ? "pl-5" : "pl-3"
                } ${
                  isActive
                    ? "border-accent-amber font-semibold text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {it.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
