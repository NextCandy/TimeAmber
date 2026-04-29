import type { IDatabase } from "./storage/interfaces";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2026-03-11";
const DEFAULT_DATA_SOURCE_ID = "22837041-b78c-81d8-9670-000b9d50c21b";
const DEFAULT_NOTION_CATEGORY = "剪藏";

type NotionEnv = {
  NOTION_TOKEN?: string;
  NOTION_DATA_SOURCE_ID?: string;
};

type RichText = {
  plain_text?: string;
  href?: string | null;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    code?: boolean;
  };
};

type NotionPage = {
  id: string;
  created_time?: string;
  last_edited_time?: string;
  properties?: Record<string, NotionProperty>;
};

type NotionBlock = {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
};

type NotionProperty = {
  type?: string;
  title?: RichText[];
  rich_text?: RichText[];
  url?: string | null;
  date?: { start?: string | null } | null;
  created_time?: string;
  last_edited_time?: string;
  multi_select?: { name?: string }[];
  relation?: { id: string }[];
};

type NotionSyncPost = {
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  tags: string[];
  category: string;
  createdAt: string;
};

export type NotionSyncResult = {
  success: boolean;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  startedAt: string;
  finishedAt: string;
  durationMs: number;
};

type RewriteImages = (content: string) => Promise<string>;

type SyncOptions = {
  db: IDatabase;
  env: NotionEnv;
  settings: Record<string, string>;
  rewriteImages: RewriteImages;
};

export function getNotionDataSourceId(env: NotionEnv, settings: Record<string, string>): string {
  return (settings.notion_data_source_id || env.NOTION_DATA_SOURCE_ID || DEFAULT_DATA_SOURCE_ID).trim();
}

export function getNotionSyncStatus(settings: Record<string, string>, env: NotionEnv) {
  return {
    configured: Boolean((env.NOTION_TOKEN || "").trim()),
    dataSourceId: getNotionDataSourceId(env, settings),
    lastRunAt: settings.notion_sync_last_run_at || "",
    lastStatus: settings.notion_sync_last_status || "never",
    lastError: settings.notion_sync_last_error || "",
    lastCreated: Number(settings.notion_sync_last_created || 0),
    lastUpdated: Number(settings.notion_sync_last_updated || 0),
    lastSkipped: Number(settings.notion_sync_last_skipped || 0),
    lastFailed: Number(settings.notion_sync_last_failed || 0),
    lastDurationMs: Number(settings.notion_sync_last_duration_ms || 0),
  };
}

export async function syncNotionPosts(options: SyncOptions): Promise<NotionSyncResult> {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const token = (options.env.NOTION_TOKEN || "").trim();
  const dataSourceId = getNotionDataSourceId(options.env, options.settings);

  if (!token) {
    const result = finishResult(startedAt, startedMs, {
      success: false,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 1,
      errors: ["NOTION_TOKEN is not configured."],
    });
    await saveSyncStatus(options.db, result);
    return result;
  }

  if (!dataSourceId) {
    const result = finishResult(startedAt, startedMs, {
      success: false,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 1,
      errors: ["NOTION_DATA_SOURCE_ID is not configured."],
    });
    await saveSyncStatus(options.db, result);
    return result;
  }

  const client = new NotionClient(token);
  const resultBase = { success: true, created: 0, updated: 0, skipped: 0, failed: 0, errors: [] as string[] };

  try {
    const pages = await client.queryDataSource(dataSourceId);
    const tagTitleCache = new Map<string, string>();

    for (const page of pages) {
      try {
        const post = await notionPageToPost(client, page, tagTitleCache);
        if (!post.title) {
          resultBase.skipped++;
          continue;
        }

        post.content = await options.rewriteImages(post.content);
        const existing = await options.db.getPostBySlug(post.slug);

        if (existing) {
          await options.db.updatePost(post.slug, {
            title: post.title,
            content: post.content,
            excerpt: post.excerpt,
            tags: post.tags,
            category: post.category,
            coverImage: extractFirstImage(post.content) || existing.coverImage || "",
          });
          resultBase.updated++;
        } else {
          await options.db.createPost({
            slug: post.slug,
            title: post.title,
            content: post.content,
            excerpt: post.excerpt,
            tags: post.tags,
            coverImage: extractFirstImage(post.content) || "",
            coverColor: "from-cyan-500/20 to-blue-600/20",
            published: false,
            listed: true,
            pinned: false,
            publishAt: null,
            category: post.category,
            createdAt: post.createdAt,
            updatedAt: page.last_edited_time || new Date().toISOString(),
          });
          resultBase.created++;
        }
      } catch (error) {
        resultBase.failed++;
        resultBase.errors.push(`${page.id}: ${errorToMessage(error)}`);
      }
    }
  } catch (error) {
    resultBase.success = false;
    resultBase.failed++;
    resultBase.errors.push(errorToMessage(error));
  }

  const result = finishResult(startedAt, startedMs, resultBase);
  await saveSyncStatus(options.db, result);
  return result;
}

async function notionPageToPost(client: NotionClient, page: NotionPage, tagTitleCache: Map<string, string>): Promise<NotionSyncPost> {
  const properties = page.properties || {};
  const title = truncate(getTitle(properties["标题"]) || "未命名文章", 160);
  const excerpt = truncate(getRichText(properties["摘要"]), 300);
  const sourceUrl = properties["原文地址"]?.url || "";
  const createdAt = properties["发布日期"]?.date?.start || properties["创建时间"]?.date?.start || page.created_time || new Date().toISOString();
  const tags = await resolveTags(client, properties["标签"], tagTitleCache);
  const authorTags = (properties["作者"]?.multi_select || [])
    .map((item) => item.name?.trim())
    .filter((name): name is string => Boolean(name));
  const blocks = await client.listBlockChildren(page.id);
  const markdown = await blocksToMarkdown(client, blocks, 0);
  const fallbackContent = buildClippingFallback(title, excerpt, sourceUrl);
  const content = [
    markdown.trim() || fallbackContent,
    sourceUrl && markdown.trim() ? `\n\n> 原文地址: [${sourceUrl}](${sourceUrl})` : "",
  ].join("").trim();
  const normalizedTags = Array.from(new Set([DEFAULT_NOTION_CATEGORY, ...tags, ...authorTags])).slice(0, 20);

  return {
    slug: `notion-${page.id.replace(/-/g, "").slice(0, 12)}`,
    title,
    content,
    excerpt: excerpt || truncate(stripMarkdown(content), 220),
    tags: normalizedTags,
    category: DEFAULT_NOTION_CATEGORY,
    createdAt,
  };
}

function buildClippingFallback(title: string, excerpt: string, sourceUrl: string): string {
  const lines = [`# ${title}`];
  if (excerpt) lines.push(excerpt);
  if (sourceUrl) lines.push(`> 原文地址: [${sourceUrl}](${sourceUrl})`);
  return lines.join("\n\n");
}

async function resolveTags(client: NotionClient, property: NotionProperty | undefined, cache: Map<string, string>): Promise<string[]> {
  const relations = property?.relation || [];
  const tags: string[] = [];
  for (const relation of relations.slice(0, 20)) {
    if (cache.has(relation.id)) {
      const cached = cache.get(relation.id);
      if (cached) tags.push(cached);
      continue;
    }
    try {
      const page = await client.retrievePage(relation.id);
      const titleProperty = Object.values(page.properties || {}).find((item) => item.type === "title");
      const title = truncate(getTitle(titleProperty), 40);
      cache.set(relation.id, title);
      if (title) tags.push(title);
    } catch {
      cache.set(relation.id, "");
    }
  }
  return tags;
}

async function blocksToMarkdown(client: NotionClient, blocks: NotionBlock[], depth: number): Promise<string> {
  const lines: string[] = [];
  for (const block of blocks) {
    const line = await blockToMarkdown(client, block, depth);
    if (line) lines.push(line);
  }
  return lines.join("\n\n");
}

async function blockToMarkdown(client: NotionClient, block: NotionBlock, depth: number): Promise<string> {
  const data = (block[block.type] || {}) as Record<string, unknown>;
  const text = richTextToMarkdown((data.rich_text || []) as RichText[]);
  let current = "";

  switch (block.type) {
    case "paragraph":
      current = text;
      break;
    case "heading_1":
      current = `# ${text}`;
      break;
    case "heading_2":
      current = `## ${text}`;
      break;
    case "heading_3":
      current = `### ${text}`;
      break;
    case "bulleted_list_item":
      current = `${"  ".repeat(depth)}- ${text}`;
      break;
    case "numbered_list_item":
      current = `${"  ".repeat(depth)}1. ${text}`;
      break;
    case "quote":
      current = text.split("\n").map((line) => `> ${line}`).join("\n");
      break;
    case "callout":
      current = text ? `> ${text}` : "";
      break;
    case "to_do":
      current = `${(data.checked as boolean) ? "- [x]" : "- [ ]"} ${text}`;
      break;
    case "toggle":
      current = `<details>\n<summary>${escapeHtml(text || "展开")}</summary>`;
      break;
    case "code":
      current = `\`\`\`${String(data.language || "")}\n${plainText((data.rich_text || []) as RichText[])}\n\`\`\``;
      break;
    case "divider":
      current = "---";
      break;
    case "image":
      current = imageToMarkdown(data);
      break;
    case "bookmark":
    case "embed":
    case "video":
    case "file":
    case "pdf":
      current = fileLikeToMarkdown(data, text || block.type);
      break;
    default:
      current = text;
  }

  if (block.has_children && depth < 3) {
    const children = await client.listBlockChildren(block.id);
    const childMarkdown = await blocksToMarkdown(client, children, block.type.endsWith("_list_item") ? depth + 1 : depth);
    if (childMarkdown) {
      current = current ? `${current}\n\n${childMarkdown}` : childMarkdown;
    }
  }

  if (block.type === "toggle" && current) {
    current = `${current}\n</details>`;
  }

  return current.trim();
}

function imageToMarkdown(data: Record<string, unknown>): string {
  const caption = richTextToMarkdown((data.caption || []) as RichText[]);
  const file = data.file as { url?: string } | undefined;
  const external = data.external as { url?: string } | undefined;
  const url = external?.url || file?.url || "";
  if (!url) return "";
  return `![${caption || "Notion image"}](${url})`;
}

function fileLikeToMarkdown(data: Record<string, unknown>, label: string): string {
  const url = (data.url as string | undefined)
    || (data.external as { url?: string } | undefined)?.url
    || (data.file as { url?: string } | undefined)?.url
    || "";
  return url ? `[${label}](${url})` : "";
}

function getTitle(property: NotionProperty | undefined): string {
  return plainText(property?.title || []);
}

function getRichText(property: NotionProperty | undefined): string {
  return plainText(property?.rich_text || []);
}

function richTextToMarkdown(text: RichText[]): string {
  return text.map((part) => {
    let value = part.plain_text || "";
    if (!value) return "";
    if (part.annotations?.code) value = `\`${value}\``;
    if (part.annotations?.bold) value = `**${value}**`;
    if (part.annotations?.italic) value = `*${value}*`;
    if (part.annotations?.strikethrough) value = `~~${value}~~`;
    if (part.href) value = `[${value}](${part.href})`;
    return value;
  }).join("");
}

function plainText(text: RichText[]): string {
  return text.map((part) => part.plain_text || "").join("");
}

function stripMarkdown(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFirstImage(markdown: string): string {
  const md = markdown.match(/!\[[^\]]*\]\(([^\s)]+)/);
  return md?.[1] || "";
}

function truncate(value: string, length: number): string {
  return value.trim().slice(0, length);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char] || char));
}

function finishResult(startedAt: string, startedMs: number, result: Omit<NotionSyncResult, "startedAt" | "finishedAt" | "durationMs">): NotionSyncResult {
  return {
    ...result,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedMs,
  };
}

async function saveSyncStatus(db: IDatabase, result: NotionSyncResult): Promise<void> {
  await db.saveSettings({
    notion_sync_last_run_at: result.finishedAt,
    notion_sync_last_status: result.success && result.failed === 0 ? "success" : "error",
    notion_sync_last_error: result.errors.slice(0, 3).join("\n").slice(0, 500),
    notion_sync_last_created: String(result.created),
    notion_sync_last_updated: String(result.updated),
    notion_sync_last_skipped: String(result.skipped),
    notion_sync_last_failed: String(result.failed),
    notion_sync_last_duration_ms: String(result.durationMs),
  });
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class NotionClient {
  constructor(private readonly token: string) {}

  async queryDataSource(dataSourceId: string): Promise<NotionPage[]> {
    const pages: NotionPage[] = [];
    let cursor: string | undefined;
    do {
      const body: Record<string, unknown> = {
        page_size: 50,
        sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      };
      if (cursor) body.start_cursor = cursor;
      const data = await this.request<{ results?: NotionPage[]; has_more?: boolean; next_cursor?: string | null }>(
        `/data_sources/${encodeURIComponent(dataSourceId)}/query`,
        { method: "POST", body: JSON.stringify(body) },
      );
      pages.push(...(data.results || []));
      cursor = data.has_more ? data.next_cursor || undefined : undefined;
    } while (cursor && pages.length < 2000);
    return pages;
  }

  async retrievePage(pageId: string): Promise<NotionPage> {
    return this.request<NotionPage>(`/pages/${encodeURIComponent(pageId)}`);
  }

  async listBlockChildren(blockId: string): Promise<NotionBlock[]> {
    const blocks: NotionBlock[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({ page_size: "100" });
      if (cursor) query.set("start_cursor", cursor);
      const data = await this.request<{ results?: NotionBlock[]; has_more?: boolean; next_cursor?: string | null }>(
        `/blocks/${encodeURIComponent(blockId)}/children?${query.toString()}`,
      );
      blocks.push(...(data.results || []));
      cursor = data.has_more ? data.next_cursor || undefined : undefined;
    } while (cursor && blocks.length < 300);
    return blocks;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${NOTION_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_VERSION,
        ...(init.headers || {}),
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Notion API ${res.status}: ${text.slice(0, 300)}`);
    }

    return res.json() as Promise<T>;
  }
}
