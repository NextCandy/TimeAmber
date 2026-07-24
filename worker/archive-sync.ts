import type { IDatabase, IObjectStorage } from "./storage/interfaces";

const DEFAULT_POST_COVER = "/brand/timeamber-default-cover.png";

type ArchiveSyncEnv = {
  VS_DO_BASE_URL?: string;
  VS_DO_TOKEN?: string;
  VS_DO_EMAIL?: string;
  VS_DO_PASSWORD?: string;
  VS_DO_ARCHIVE_FOLDER_ID?: string;
  ARCHIVE_SYNC_FETCH_TIMEOUT_MS?: string;
  ARCHIVE_SYNC_MAX_PAGES?: string;
  ARCHIVE_SYNC_MAX_CONTENT_CHARS?: string;
};

type ArchivePage = {
  id: number;
  title: string;
  pageUrl: string;
  pageDesc?: string;
  folderId?: number | string | null;
  createdAt?: string;
  updatedAt?: string;
};

type ArchivePageBatch = {
  list: ArchivePage[];
  total: number;
};

type ArchiveSource = {
  id: "vsdo";
  label: string;
  baseUrl: string;
  token?: string;
  email?: string;
  password?: string;
  folderId?: number;
  fetchTimeoutMs: number;
};

type ArchiveContentSnapshot = {
  html: string;
  readableText: string;
  originalPublishedAt: string | null;
};

export type ArchiveKnowledgeDocument = {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: string;
  internalUrl: string;
  originalUrl: string;
  sourceCreatedAt: string;
  sourceUpdatedAt: string;
};

export type ArchiveSyncResult = {
  source: string;
  pageNumber: number;
  total: number;
  hasMore: boolean;
  nextPage: number;
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  changedSlugs: string[];
};

export type ArchiveSyncStatus = {
  configured: boolean;
  sources: {
    id: ArchiveSource["id"];
    label: string;
    configured: boolean;
    nextPage: number;
    lastRunAt: string;
    lastStatus: string;
    lastError: string;
    lastTotal: number;
    lastScanned: number;
    lastCreated: number;
    lastUpdated: number;
    lastSkipped: number;
    lastFailed: number;
    hasMore: boolean;
  }[];
};

type ArchiveSyncOptions = {
  maxPages?: number;
  pageNumber?: number;
  resetCursor?: boolean;
  advanceCursor?: boolean;
  includeLatestPage?: boolean;
  source?: ArchiveSource["id"];
  indexDocument?: (document: ArchiveKnowledgeDocument) => Promise<void>;
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function optionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function withTimeout<T>(
  timeoutMs: number,
  label: string,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function stableArchiveSlug(source: string, id: number): string {
  return `archive-${source}-${id}`;
}

function stableOfflineHtmlKey(source: string, id: number): string {
  return `${source}-html/${id}/index.html`;
}

function stableOfflineHtmlUrl(source: string, id: number): string {
  return `/cdn/${stableOfflineHtmlKey(source, id)}`;
}

function buildOfflineHtmlMarker(source: ArchiveSource, page: ArchivePage): string {
  return `<!-- timeamber-offline-html:v1 source:${source.id} id:${page.id} url:${stableOfflineHtmlUrl(source.id, page.id)} -->`;
}

export function getArchiveOfflineHtmlUrl(content: string): string | null {
  const match = content.match(
    /<!--\s*timeamber-offline-html:v1\s+source:[a-z0-9_-]+\s+id:\d+\s+url:([^\s>]+)\s*-->/i,
  );
  const url = match?.[1]?.trim();
  return url && url.startsWith("/cdn/") ? url : null;
}

function parseArchiveDate(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized.endsWith("Z") ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function parseSourcePublishedDate(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  const date = Number.isFinite(numeric)
    ? new Date(trimmed.length <= 10 ? numeric * 1000 : numeric)
    : new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  const now = Date.now();
  if (date.getTime() < 631152000000 || date.getTime() > now + 86400000) return null;
  return date.toISOString();
}

export function extractArchivePublishedAt(html: string): string | null {
  const publishedPatterns = [
    /<meta[^>]+(?:property|name)=["'](?:article:published_time|datePublished|pubdate|publishdate|publishDate)["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:article:published_time|datePublished|pubdate|publishdate|publishDate)["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /"dateCreated"\s*:\s*"([^"]+)"/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
  ];

  for (const pattern of publishedPatterns) {
    const parsed = parseSourcePublishedDate(html.match(pattern)?.[1]);
    if (parsed) return parsed;
  }

  const timestamps = Array.from(html.matchAll(/data-time=["']?(\d{10,13})["']?/gi))
    .map((match) => parseSourcePublishedDate(match[1]))
    .filter((date): date is string => Boolean(date))
    .sort();

  return timestamps[0] || null;
}

export function extractArchiveOriginalUrl(html: string): string | null {
  const patterns = [
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i,
    /<meta[^>]+(?:property|name)=["']og:url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:url["']/i,
  ];
  for (const pattern of patterns) {
    const value = html.match(pattern)?.[1]?.trim();
    if (value && /^https?:\/\//i.test(value)) return decodeHtmlEntities(value);
  }
  return null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function cleanHtmlFragment(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<button[\s\S]*?<\/button>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ");
}

function fragmentToReadableText(html: string): string {
  return decodeHtmlEntities(
    cleanHtmlFragment(html)
      .replace(/<(h[1-6]|p|li|blockquote|pre|tr|div|section|article|br)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractClassBlocks(html: string, className: string, endClassName?: string): string[] {
  const starts: { tagStart: number; contentStart: number }[] = [];
  const barriers: number[] = [];

  // Archived pages may contain multi-megabyte inline image attributes. Keep the
  // tag matcher bounded so malformed or enormous tags cannot trigger runaway
  // backtracking while we look for Discourse's small structural elements.
  const tagRe = /<[a-z][\w:-]*\b[^>]{0,8192}>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html))) {
    const classes = getHtmlAttr(match[0], "class").toLowerCase().split(/\s+/).filter(Boolean);
    if (classes.includes(className.toLowerCase())) {
      starts.push({ tagStart: match.index, contentStart: match.index + match[0].length });
    }
    if (endClassName && classes.includes(endClassName.toLowerCase())) {
      barriers.push(match.index);
    }
  }

  return starts.flatMap((start, index) => {
    const nextStart = starts[index + 1]?.tagStart ?? html.length;
    const barrier = barriers.find(
      (position) => position > start.contentStart && position < nextStart,
    );
    const end = barrier ?? nextStart;
    return end > start.contentStart ? [html.slice(start.contentStart, end)] : [];
  });
}

export function archiveHtmlToReadableText(html: string, maxChars: number): string {
  const discoursePosts = extractClassBlocks(html, "cooked", "cooked-selection-barrier")
    .map(fragmentToReadableText)
    .filter((text) => text.length > 30);
  if (discoursePosts.length > 0) {
    return discoursePosts.join("\n\n---\n\n").slice(0, maxChars).trim();
  }

  const articleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const body =
    articleMatch?.[1] ||
    mainMatch?.[1] ||
    html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ||
    html;
  return fragmentToReadableText(body).slice(0, maxChars).trim();
}

function buildOfflineContent(source: ArchiveSource, page: ArchivePage): string {
  return buildOfflineHtmlMarker(source, page);
}

function getHtmlAttr(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[1] || match?.[2] || match?.[3] || "";
}

function replaceHtmlAttr(tag: string, name: string, value: string): string {
  const escapedValue = value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const attrPattern = new RegExp(`(\\s${name}\\s*=\\s*)(?:"[^"]*"|'[^']*'|[^\\s>]+)`, "i");
  if (attrPattern.test(tag)) {
    return tag.replace(attrPattern, (_match, prefix) => `${prefix}"${escapedValue}"`);
  }
  return tag.replace(/\/?>$/, (end) => ` ${name}="${escapedValue}"${end}`);
}

export function normalizeArchiveOfflineHtml(html: string): string {
  if (!html.includes("data:image") || !/\sdata-(?:src|original|lazy-src)\s*=/i.test(html)) {
    return html;
  }

  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = getHtmlAttr(tag, "src");
    if (!/^data:image\//i.test(src)) return tag;

    const originalUrl = (
      getHtmlAttr(tag, "data-src") ||
      getHtmlAttr(tag, "data-original") ||
      getHtmlAttr(tag, "data-lazy-src")
    ).trim();
    if (!/^https?:\/\//i.test(originalUrl)) return tag;

    return replaceHtmlAttr(tag, "src", originalUrl);
  });
}

async function archiveFetchJson<T>(
  source: ArchiveSource,
  url: string,
  token: string,
  init: RequestInit,
  label: string,
): Promise<T> {
  const res = await withTimeout(source.fetchTimeoutMs, label, (signal) =>
    fetch(url, {
      ...init,
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
    }),
  );
  if (!res.ok) throw new Error(`${url} failed with ${res.status}`);
  return res.json() as Promise<T>;
}

async function resolveToken(source: ArchiveSource): Promise<string> {
  if (source.token) return source.token;
  if (!source.password) throw new Error(`${source.label} missing credentials`);
  const res = await withTimeout(source.fetchTimeoutMs, `${source.label} login`, (signal) =>
    fetch(`${source.baseUrl}/api/auth`, {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${source.password}` },
    }),
  );
  if (!res.ok) throw new Error(`${source.label} login failed with ${res.status}`);
  const data = (await res.json()) as { code?: number; data?: boolean; message?: string };
  if (data.code !== 200 || data.data !== true) {
    throw new Error(data.message || `${source.label} login failed`);
  }
  return source.password;
}

async function queryPages(
  source: ArchiveSource,
  token: string,
  pageNumber: number,
  pageSize: number,
): Promise<ArchivePageBatch> {
  const body: Record<string, string | number> = {
    pageNumber: String(pageNumber),
    pageSize: String(pageSize),
  };
  if (source.folderId !== undefined) body.folderId = source.folderId;

  const data = await archiveFetchJson<{ data?: { list?: ArchivePage[]; total?: number } }>(
    source,
    `${source.baseUrl}/api/pages/query`,
    token,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    `${source.label} page query ${pageNumber}`,
  );
  return {
    list: Array.isArray(data.data?.list) ? data.data.list : [],
    total: Number(data.data?.total || 0),
  };
}

async function fetchReadableContent(
  source: ArchiveSource,
  token: string,
  pageId: number,
  maxChars: number,
): Promise<ArchiveContentSnapshot> {
  const res = await withTimeout(
    source.fetchTimeoutMs,
    `${source.label} content ${pageId}`,
    (signal) =>
      fetch(`${source.baseUrl}/api/pages/content?pageId=${pageId}`, {
        signal,
        headers: { Authorization: `Bearer ${token}` },
      }),
  );
  if (!res.ok) throw new Error(`${source.label} content ${pageId} failed with ${res.status}`);
  const html = normalizeArchiveOfflineHtml(await res.text());
  return {
    html,
    readableText: archiveHtmlToReadableText(html, maxChars),
    originalPublishedAt: extractArchivePublishedAt(html),
  };
}

function getSources(env: ArchiveSyncEnv): ArchiveSource[] {
  const sources: ArchiveSource[] = [];
  const fetchTimeoutMs = clampInt(env.ARCHIVE_SYNC_FETCH_TIMEOUT_MS, 1000, 30000, 8000);
  if (env.VS_DO_TOKEN || env.VS_DO_PASSWORD) {
    sources.push({
      id: "vsdo",
      label: "VS.DO 剪藏",
      baseUrl: trimSlash(env.VS_DO_BASE_URL || "https://vs.do"),
      token: env.VS_DO_TOKEN,
      email: env.VS_DO_EMAIL,
      password: env.VS_DO_PASSWORD,
      folderId: optionalInt(env.VS_DO_ARCHIVE_FOLDER_ID) ?? 0,
      fetchTimeoutMs,
    });
  }
  return sources;
}

export function getArchiveSyncStatus(
  settings: Record<string, string>,
  env: ArchiveSyncEnv,
): ArchiveSyncStatus {
  const fetchTimeoutMs = clampInt(env.ARCHIVE_SYNC_FETCH_TIMEOUT_MS, 1000, 30000, 8000);
  const knownSources: ArchiveSource[] = [
    {
      id: "vsdo",
      label: "VS.DO 剪藏",
      baseUrl: trimSlash(env.VS_DO_BASE_URL || "https://vs.do"),
      token: env.VS_DO_TOKEN,
      email: env.VS_DO_EMAIL,
      password: env.VS_DO_PASSWORD,
      folderId: optionalInt(env.VS_DO_ARCHIVE_FOLDER_ID) ?? 0,
      fetchTimeoutMs,
    },
  ];
  const sources = knownSources.map((source) => {
    const prefix = `archive_sync_${source.id}`;
    const configured = Boolean(source.token || source.password);
    return {
      id: source.id,
      label: source.label,
      configured,
      nextPage: clampInt(settings[`${prefix}_next_page`], 1, 100000, 1),
      lastRunAt: settings[`${prefix}_last_run_at`] || "",
      lastStatus: settings[`${prefix}_last_status`] || "never",
      lastError: settings[`${prefix}_last_error`] || "",
      lastTotal: clampInt(settings[`${prefix}_last_total`], 0, 1000000, 0),
      lastScanned: clampInt(settings[`${prefix}_last_scanned`], 0, 1000000, 0),
      lastCreated: clampInt(settings[`${prefix}_last_created`], 0, 1000000, 0),
      lastUpdated: clampInt(settings[`${prefix}_last_updated`], 0, 1000000, 0),
      lastSkipped: clampInt(settings[`${prefix}_last_skipped`], 0, 1000000, 0),
      lastFailed: clampInt(settings[`${prefix}_last_failed`], 0, 1000000, 0),
      hasMore: settings[`${prefix}_has_more`] === "true",
    };
  });
  return {
    configured: sources.some((source) => source.configured),
    sources,
  };
}

export async function syncArchiveSources(
  db: IDatabase,
  storage: IObjectStorage,
  env: ArchiveSyncEnv,
  options: ArchiveSyncOptions = {},
): Promise<ArchiveSyncResult[]> {
  const maxPages = clampInt(options.maxPages || env.ARCHIVE_SYNC_MAX_PAGES, 1, 50, 10);
  const maxContentChars = Math.min(
    Math.max(Number(env.ARCHIVE_SYNC_MAX_CONTENT_CHARS || 60000) || 60000, 5000),
    180000,
  );
  const results: ArchiveSyncResult[] = [];
  const settings = options.advanceCursor ? await db.getSettings() : {};
  const cursorUpdates: Record<string, string> = {};

  for (const source of getSources(env).filter(
    (item) => !options.source || item.id === options.source,
  )) {
    const settingsPrefix = `archive_sync_${source.id}`;
    const cursorKey = `${settingsPrefix}_next_page`;
    const pageNumber = clampInt(
      options.pageNumber || (options.resetCursor ? 1 : settings[cursorKey]),
      1,
      100000,
      1,
    );
    const result: ArchiveSyncResult = {
      source: source.id,
      pageNumber,
      total: 0,
      hasMore: false,
      nextPage: pageNumber,
      scanned: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      changedSlugs: [],
    };
    results.push(result);
    try {
      const token = await resolveToken(source);
      const pageNumbers =
        options.includeLatestPage && pageNumber !== 1 ? [1, pageNumber] : [pageNumber];
      const seenPageIds = new Set<number>();
      if (options.advanceCursor) cursorUpdates[cursorKey] = String(result.nextPage);

      for (const currentPageNumber of pageNumbers) {
        const batch = await queryPages(source, token, currentPageNumber, maxPages);
        const pages = batch.list.filter((page) => {
          if (seenPageIds.has(page.id)) return false;
          if (
            source.folderId !== undefined &&
            Number(page.folderId ?? source.folderId) !== source.folderId
          ) {
            result.skipped++;
            return false;
          }
          seenPageIds.add(page.id);
          return true;
        });

        if (currentPageNumber === pageNumber) {
          result.total = batch.total;
          result.hasMore = pageNumber * maxPages < batch.total;
          result.nextPage = result.hasMore ? pageNumber + 1 : 1;
          if (options.advanceCursor) cursorUpdates[cursorKey] = String(result.nextPage);
        } else if (result.total === 0) {
          result.total = batch.total;
        }
        result.scanned += pages.length;

        for (const page of pages) {
          try {
            const slug = stableArchiveSlug(source.id, page.id);
            const existing = await db.getPostBySlug(slug);
            const sourceUpdatedAt = parseArchiveDate(page.updatedAt || page.createdAt);
            if (
              existing &&
              existing.category === source.label &&
              existing.published &&
              existing.listed &&
              Boolean(getArchiveOfflineHtmlUrl(existing.content)) &&
              new Date(existing.updatedAt).getTime() >= new Date(sourceUpdatedAt).getTime()
            ) {
              result.skipped++;
              continue;
            }

            const snapshot = await fetchReadableContent(source, token, page.id, maxContentChars);
            const htmlKey = stableOfflineHtmlKey(source.id, page.id);
            await storage.put(htmlKey, snapshot.html, {
              contentType: "text/html; charset=utf-8",
              customMetadata: {
                source: source.id,
                pageId: String(page.id),
                pageUrl: page.pageUrl || "",
              },
            });
            const readableText = snapshot.readableText;
            const content = buildOfflineContent(source, page);
            const createdAt = snapshot.originalPublishedAt || parseArchiveDate(page.createdAt);
            const tags = ["剪藏", source.label];
            const payload = {
              title: page.title.slice(0, 160),
              content,
              excerpt: (page.pageDesc || readableText || page.pageUrl || "").trim().slice(0, 300),
              coverColor: "from-cyan-500/20 to-blue-600/20",
              coverImage: DEFAULT_POST_COVER,
              published: true,
              listed: true,
              pinned: false,
              publishAt: null,
              tags,
              category: source.label,
              createdAt,
              updatedAt: sourceUpdatedAt,
            };

            if (existing) {
              await db.updatePost(slug, payload);
              result.updated++;
            } else {
              await db.createPost({ slug, ...payload, createdAt });
              result.created++;
            }
            if (options.indexDocument) {
              await options.indexDocument({
                slug,
                title: payload.title,
                excerpt: payload.excerpt,
                body: readableText || payload.excerpt || page.title,
                category: payload.category,
                internalUrl: stableOfflineHtmlUrl(source.id, page.id),
                originalUrl: page.pageUrl || extractArchiveOriginalUrl(snapshot.html) || "",
                sourceCreatedAt: createdAt,
                sourceUpdatedAt,
              });
            }
            result.changedSlugs.push(slug);
          } catch (error) {
            result.failed++;
            result.errors.push(
              `${page.id}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }
    } catch (error) {
      result.failed++;
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
    if (options.advanceCursor) {
      cursorUpdates[`${settingsPrefix}_last_run_at`] = new Date().toISOString();
      cursorUpdates[`${settingsPrefix}_last_status`] = result.failed === 0 ? "success" : "error";
      cursorUpdates[`${settingsPrefix}_last_error`] = result.errors
        .slice(0, 3)
        .join("\n")
        .slice(0, 500);
      cursorUpdates[`${settingsPrefix}_last_total`] = String(result.total);
      cursorUpdates[`${settingsPrefix}_last_scanned`] = String(result.scanned);
      cursorUpdates[`${settingsPrefix}_last_created`] = String(result.created);
      cursorUpdates[`${settingsPrefix}_last_updated`] = String(result.updated);
      cursorUpdates[`${settingsPrefix}_last_skipped`] = String(result.skipped);
      cursorUpdates[`${settingsPrefix}_last_failed`] = String(result.failed);
      cursorUpdates[`${settingsPrefix}_has_more`] = String(result.hasMore);
    }
  }

  if (Object.keys(cursorUpdates).length > 0) {
    await db.saveSettings(cursorUpdates);
  }

  return results;
}
