// 把 Markdown 摘要压成纯文本，供 <meta description> / og:description / RSS 使用。
// 文章 excerpt 直接来自 Notion 同步，里面常带 ![](…)、``` 、**粗体** 等语法，
// 原样塞进 meta 会被搜索引擎与社交卡片当正文展示。
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}([-*+]|\d+\.)\s+/gm, "")
    .replace(/(\*\*|__|\*|_|~~)/g, "")
    .replace(/^\s*\|.*\|\s*$/gm, " ")
    .replace(/^\s*[-:|\s]+$/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 截断到适合 meta description 的长度，不切断在半个词上。 */
export function toMetaDescription(md: string, max = 160): string {
  const text = stripMarkdown(md);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
