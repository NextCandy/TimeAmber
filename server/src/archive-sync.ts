import type { IDatabase } from "./storage/interfaces";

type ArchiveSyncEnv = {
  SHUDONG_BASE_URL?: string;
  SHUDONG_TOKEN?: string;
  MEARCHIVE_BASE_URL?: string;
  MEARCHIVE_EMAIL?: string;
  MEARCHIVE_PASSWORD?: string;
  ARCHIVE_SYNC_MAX_PAGES?: string;
  ARCHIVE_SYNC_MAX_CONTENT_CHARS?: string;
};

type ArchivePage = {
  id: number;
  title: string;
  pageUrl: string;
  pageDesc?: string;
  createdAt?: string;
  updatedAt?: string;
};

type ArchivePageBatch = {
  list: ArchivePage[];
  total: number;
};

type ArchiveSource = {
  id: "shudong" | "mearchive";
  label: string;
  baseUrl: string;
  token?: string;
  email?: string;
  password?: string;
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
  source?: ArchiveSource["id"];
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function stableArchiveSlug(source: string, id: number): string {
  return `archive-${source}-${id}`;
}

function parseArchiveDate(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized.endsWith("Z") ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function htmlToReadableText(html: string, maxChars: number): string {
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
  const withoutNoise = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<(h[1-6]|p|li|blockquote|pre|tr|div|section|article|br)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return withoutNoise
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxChars);
}

function buildContent(source: ArchiveSource, page: ArchivePage, readableText: string): string {
  const sourceContentUrl = `${source.baseUrl}/api/pages/content?pageId=${page.id}`;
  const excerpt = page.pageDesc?.trim();
  const body = readableText.trim() || excerpt || "源站剪藏正文暂不可读，请通过下方链接查看原始页面或源站快照。";
  return [
    `> 同步来源：${source.label}`,
    `> 源站剪藏 ID：${page.id}`,
    `> 原文地址：${page.pageUrl}`,
    "",
    `[打开原文](${page.pageUrl}) · [打开源站剪藏快照](${sourceContentUrl})`,
    "",
    "---",
    "",
    body,
  ].join("\n");
}

async function archiveFetchJson<T>(url: string, token: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${url} failed with ${res.status}`);
  return res.json() as Promise<T>;
}

async function resolveToken(source: ArchiveSource): Promise<string> {
  if (source.token) return source.token;
  if (!source.email || !source.password) throw new Error(`${source.label} missing credentials`);
  const res = await fetch(`${source.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: source.email, password: source.password }),
  });
  if (!res.ok) throw new Error(`${source.label} login failed with ${res.status}`);
  const data = await res.json() as { data?: { token?: string } };
  if (!data.data?.token) throw new Error(`${source.label} login did not return a token`);
  return data.data.token;
}

async function queryPages(source: ArchiveSource, token: string, pageNumber: number, pageSize: number): Promise<ArchivePageBatch> {
  const data = await archiveFetchJson<{ data?: { list?: ArchivePage[]; total?: number } }>(
    `${source.baseUrl}/api/pages/query`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ pageNumber: String(pageNumber), pageSize: String(pageSize) }),
    },
  );
  return {
    list: Array.isArray(data.data?.list) ? data.data.list : [],
    total: Number(data.data?.total || 0),
  };
}

async function fetchReadableContent(source: ArchiveSource, token: string, pageId: number, maxChars: number): Promise<string> {
  const res = await fetch(`${source.baseUrl}/api/pages/content?pageId=${pageId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${source.label} content ${pageId} failed with ${res.status}`);
  return htmlToReadableText(await res.text(), maxChars);
}

function getSources(env: ArchiveSyncEnv): ArchiveSource[] {
  const sources: ArchiveSource[] = [];
  if (env.SHUDONG_TOKEN) {
    sources.push({
      id: "shudong",
      label: "树洞剪藏",
      baseUrl: trimSlash(env.SHUDONG_BASE_URL || "https://shudong.org"),
      token: env.SHUDONG_TOKEN,
    });
  }
  if (env.MEARCHIVE_EMAIL && env.MEARCHIVE_PASSWORD) {
    sources.push({
      id: "mearchive",
      label: "MeArchive",
      baseUrl: trimSlash(env.MEARCHIVE_BASE_URL || "https://mearchive.com"),
      email: env.MEARCHIVE_EMAIL,
      password: env.MEARCHIVE_PASSWORD,
    });
  }
  return sources;
}

export function getArchiveSyncStatus(settings: Record<string, string>, env: ArchiveSyncEnv): ArchiveSyncStatus {
  const knownSources: ArchiveSource[] = [
    {
      id: "shudong",
      label: "树洞剪藏",
      baseUrl: trimSlash(env.SHUDONG_BASE_URL || "https://shudong.org"),
      token: env.SHUDONG_TOKEN,
    },
    {
      id: "mearchive",
      label: "MeArchive",
      baseUrl: trimSlash(env.MEARCHIVE_BASE_URL || "https://mearchive.com"),
      email: env.MEARCHIVE_EMAIL,
      password: env.MEARCHIVE_PASSWORD,
    },
  ];
  const sources = knownSources.map((source) => {
    const prefix = `archive_sync_${source.id}`;
    const configured = source.id === "shudong" ? Boolean(source.token) : Boolean(source.email && source.password);
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

export async function syncArchiveSources(db: IDatabase, env: ArchiveSyncEnv, options: ArchiveSyncOptions = {}): Promise<ArchiveSyncResult[]> {
  const maxPages = clampInt(options.maxPages || env.ARCHIVE_SYNC_MAX_PAGES, 1, 50, 10);
  const maxContentChars = Math.min(Math.max(Number(env.ARCHIVE_SYNC_MAX_CONTENT_CHARS || 60000) || 60000, 5000), 180000);
  const results: ArchiveSyncResult[] = [];
  const settings = options.advanceCursor ? await db.getSettings() : {};
  const cursorUpdates: Record<string, string> = {};

  for (const source of getSources(env).filter((item) => !options.source || item.id === options.source)) {
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
    };
    results.push(result);
    try {
      const token = await resolveToken(source);
      const batch = await queryPages(source, token, pageNumber, maxPages);
      const pages = batch.list;
      result.total = batch.total;
      result.hasMore = pageNumber * maxPages < batch.total;
      result.nextPage = result.hasMore ? pageNumber + 1 : 1;
      result.scanned = pages.length;
      if (options.advanceCursor) cursorUpdates[cursorKey] = String(result.nextPage);

      for (const page of pages) {
        try {
          const slug = stableArchiveSlug(source.id, page.id);
          const existing = await db.getPostBySlug(slug);
          const sourceUpdatedAt = parseArchiveDate(page.updatedAt || page.createdAt);
          if (existing && existing.category === source.label && new Date(existing.updatedAt).getTime() >= new Date(sourceUpdatedAt).getTime()) {
            result.skipped++;
            continue;
          }

          const readableText = await fetchReadableContent(source, token, page.id, maxContentChars);
          const content = buildContent(source, page, readableText);
          const createdAt = parseArchiveDate(page.createdAt);
          const tags = ["剪藏", source.label];
          const payload = {
            title: page.title.slice(0, 160),
            content,
            excerpt: (page.pageDesc || readableText).trim().slice(0, 300),
            coverColor: "from-cyan-500/20 to-blue-600/20",
            coverImage: "",
            published: true,
            listed: true,
            pinned: false,
            publishAt: null,
            tags,
            category: source.label,
            updatedAt: sourceUpdatedAt,
          };

          if (existing && existing.category !== source.label) {
            await db.updatePost(slug, {
              tags,
              category: source.label,
              excerpt: payload.excerpt,
              coverColor: payload.coverColor,
              coverImage: payload.coverImage,
            });
            result.updated++;
          } else if (existing) {
            await db.updatePost(slug, payload);
            result.updated++;
          } else {
            await db.createPost({ slug, ...payload, createdAt });
            result.created++;
          }
        } catch (error) {
          result.failed++;
          result.errors.push(`${page.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      result.failed++;
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
    if (options.advanceCursor) {
      cursorUpdates[`${settingsPrefix}_last_run_at`] = new Date().toISOString();
      cursorUpdates[`${settingsPrefix}_last_status`] = result.failed === 0 ? "success" : "error";
      cursorUpdates[`${settingsPrefix}_last_error`] = result.errors.slice(0, 3).join("\n").slice(0, 500);
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
