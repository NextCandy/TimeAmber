// 共享的、无依赖的 slug 生成器。
// 文章目录（TOC）与服务端 Markdown 渲染器共用它，保证标题 id 与目录锚点始终一致。
export function slugify(text: string) {
  return (
    "h-" +
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/(^-|-$)/g, "")
  );
}
