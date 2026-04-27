let markdownModulePromise: Promise<typeof import("./markdown")> | null = null;

function loadMarkdownModule() {
  if (!markdownModulePromise) {
    markdownModulePromise = import("./markdown");
  }
  return markdownModulePromise;
}

export async function renderMarkdownAsync(md: string) {
  const { renderMarkdown } = await loadMarkdownModule();
  return renderMarkdown(md);
}

export async function extractHeadingsAsync(md: string) {
  const { extractHeadings } = await loadMarkdownModule();
  return extractHeadings(md);
}
