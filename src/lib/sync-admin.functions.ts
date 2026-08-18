import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { db } from "@/lib/db.server";

/**
 * 后台「内容同步」中心的取数与配置。
 *
 * 文章有三个自动来源：Notion 的 Link 库、Notion 的 SmartClip 库、以及 NAS 上
 * web-archive 抓下来的离线 HTML 剪藏。它们的状态过去只散落在 settings 表的一堆
 * `*_last_*` 键和 sync_runs 里，后台只有四个裸按钮，出了问题（比如令牌没授权某个
 * 库导致常年 404）在界面上完全看不出来。这里把三者归一成同一个视图。
 *
 * 取数刻意分成两层：getSyncCenter 只读本地库所以很快，页面可以随便刷；
 * 探测 Notion 授权要走外网，单独放在 testNotionAccess 里由用户主动触发。
 */

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2026-03-11";

/** web-archive 的三个子源，键名对应 settings 里的 `archive_sync_<key>_*`。 */
const ARCHIVE_SOURCES: Array<{ key: string; label: string }> = [
  { key: "vsdo", label: "VS.DO" },
  { key: "shudong", label: "树洞" },
  { key: "mearchive", label: "MeArchive" },
];

export type NotionDataSource = {
  id: string;
  /** Notion 侧的库名，只有探测过才有。 */
  name?: string;
  reachable?: boolean;
  error?: string;
  /** Notion 库里的条目数，只有探测过才有。 */
  remoteCount?: number;
};

export type ArchiveSourceStatus = {
  key: string;
  label: string;
  lastStatus: string;
  lastRunAt: string;
  lastError: string;
  lastCreated: number;
  lastUpdated: number;
  lastSkipped: number;
  lastScanned: number;
  lastTotal: number;
  nextPage: number;
  hasMore: boolean;
};

export type SyncRunRow = {
  id: number;
  sourceKey: string;
  mode: string;
  status: string;
  startedAt: string;
  finishedAt: string;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  error: string;
};

export type SyncCenterData = {
  syncEnabled: boolean;
  workerReachable: boolean;
  workerError?: string;
  notion: {
    tokenConfigured: boolean;
    tokenMasked: string;
    dataSources: NotionDataSource[];
    lastStatus: string;
    lastRunAt: string;
    lastError: string;
    lastProcessed: number;
    lastUpdated: number;
    lastCreated: number;
    lastFailed: number;
    /** 已同步到本地的 Notion 文章总数。 */
    localCount: number;
    /** 正文还是空的，等 repair 回填。 */
    emptyBodyCount: number;
  };
  archive: {
    sources: ArchiveSourceStatus[];
    /** 本地离线 HTML 剪藏的文章数。 */
    localCount: number;
    /** 没有 external_url 的，点开会是空白页。 */
    brokenCount: number;
  };
  recentRuns: SyncRunRow[];
};

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 12) return token.slice(0, 3) + "***";
  return `${token.slice(0, 10)}…${token.slice(-4)}`;
}

async function readSettings(): Promise<Record<string, string>> {
  const rows = await db()<{ key: unknown; value: unknown }[]>`
    select key, value from public.settings
  `;
  const out: Record<string, string> = {};
  for (const row of rows) out[str(row.key)] = str(row.value);
  return out;
}

function parseDataSourceIds(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

async function workerFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = process.env.WORKER_URL || "http://timeamber-worker:3001";
  const secret = process.env.WORKER_SECRET;
  if (!secret) throw new Error("WORKER_SECRET is not configured");
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Worker-Secret": secret,
      ...init?.headers,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Worker ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

/** worker 的 /run/* 回包。字段都可选：不同任务返回的子集不一样。 */
export type SyncRunResult = {
  success?: boolean;
  created?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  processed?: number;
  hasMore?: boolean;
  durationMs?: number;
  errors?: string[];
  ok?: boolean;
};

export const getSyncCenter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<SyncCenterData> => {
    const settings = await readSettings();

    const [[postStats], [archiveStats], runRows] = await Promise.all([
      db()<{ local: unknown; empty: unknown }[]>`
        select
          count(*) filter (where post_type = 'markdown') as local,
          count(*) filter (where post_type = 'markdown' and coalesce(content, '') = '') as empty
        from public.posts
      `,
      db()<{ local: unknown; broken: unknown }[]>`
        select
          count(*) as local,
          count(*) filter (where coalesce(external_url, '') = '') as broken
        from public.posts
        where post_type = 'html'
      `,
      db()<Record<string, unknown>[]>`
        select id, source_key, mode, status, started_at, finished_at,
               created_count, updated_count, skipped_count, failed_count, error
        from public.sync_runs
        order by started_at desc
        limit 30
      `,
    ]);

    let syncEnabled = false;
    let workerReachable = false;
    let workerError: string | undefined;
    try {
      const status = await workerFetch<{ syncEnabled?: boolean }>("/status");
      syncEnabled = status.syncEnabled === true;
      workerReachable = true;
    } catch (error) {
      workerError = error instanceof Error ? error.message : String(error);
    }

    const token = settings.notion_token || "";

    return {
      syncEnabled,
      workerReachable,
      workerError,
      notion: {
        tokenConfigured: Boolean(token),
        tokenMasked: maskToken(token),
        dataSources: parseDataSourceIds(settings.notion_data_source_id || "").map((id) => ({ id })),
        lastStatus: settings.notion_sync_last_status || "unknown",
        lastRunAt: settings.notion_sync_last_run_at || "",
        lastError: settings.notion_sync_last_error || "",
        lastProcessed: num(settings.notion_sync_last_processed),
        lastUpdated: num(settings.notion_sync_last_updated),
        lastCreated: num(settings.notion_sync_last_created),
        lastFailed: num(settings.notion_sync_last_failed),
        localCount: num(postStats?.local),
        emptyBodyCount: num(postStats?.empty),
      },
      archive: {
        sources: ARCHIVE_SOURCES.map(({ key, label }) => ({
          key,
          label,
          lastStatus: settings[`archive_sync_${key}_last_status`] || "unknown",
          lastRunAt: settings[`archive_sync_${key}_last_run_at`] || "",
          lastError: settings[`archive_sync_${key}_last_error`] || "",
          lastCreated: num(settings[`archive_sync_${key}_last_created`]),
          lastUpdated: num(settings[`archive_sync_${key}_last_updated`]),
          lastSkipped: num(settings[`archive_sync_${key}_last_skipped`]),
          lastScanned: num(settings[`archive_sync_${key}_last_scanned`]),
          lastTotal: num(settings[`archive_sync_${key}_last_total`]),
          nextPage: num(settings[`archive_sync_${key}_next_page`]),
          hasMore: settings[`archive_sync_${key}_has_more`] === "true",
        })),
        localCount: num(archiveStats?.local),
        brokenCount: num(archiveStats?.broken),
      },
      recentRuns: runRows.map((row) => ({
        id: num(row.id),
        sourceKey: str(row.source_key),
        mode: str(row.mode),
        status: str(row.status),
        startedAt: str(row.started_at),
        finishedAt: str(row.finished_at),
        created: num(row.created_count),
        updated: num(row.updated_count),
        skipped: num(row.skipped_count),
        failed: num(row.failed_count),
        error: str(row.error),
      })),
    };
  });

export type NotionAccessResult = {
  tokenValid: boolean;
  accountName: string;
  error?: string;
  sources: NotionDataSource[];
};

/**
 * 主动探测 Notion 授权。
 *
 * 之所以要有这个：令牌本身有效（/users/me 通）不代表每个库都授权了 —— 集成必须
 * 在 Notion 侧被逐个库「连接」。之前 SmartClip 库常年 404 就是这种情况，而后台
 * 完全看不出来，只能翻 worker 日志。
 */
export const testNotionAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<NotionAccessResult> => {
    const settings = await readSettings();
    const token = settings.notion_token || process.env.NOTION_TOKEN || "";
    const ids = parseDataSourceIds(settings.notion_data_source_id || "");

    if (!token) {
      return { tokenValid: false, accountName: "", error: "尚未配置 Notion 令牌", sources: [] };
    }

    const headers = { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION };

    let tokenValid = false;
    let accountName = "";
    let error: string | undefined;
    try {
      const me = await fetch(`${NOTION_API_BASE}/users/me`, { headers });
      if (me.ok) {
        const body = (await me.json()) as { name?: string; bot?: { workspace_name?: string } };
        tokenValid = true;
        accountName = body.bot?.workspace_name || body.name || "";
      } else {
        error = `令牌校验失败 ${me.status}: ${(await me.text()).slice(0, 160)}`;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    const sources: NotionDataSource[] = [];
    for (const id of ids) {
      if (!tokenValid) {
        sources.push({ id, reachable: false, error: "令牌无效，未探测" });
        continue;
      }
      try {
        const res = await fetch(`${NOTION_API_BASE}/data_sources/${encodeURIComponent(id)}`, { headers });
        if (!res.ok) {
          sources.push({
            id,
            reachable: false,
            error: `${res.status}: ${(await res.text()).slice(0, 120)}`,
          });
          continue;
        }
        const body = (await res.json()) as { title?: Array<{ plain_text?: string }> };
        const name = (body.title || []).map((t) => t.plain_text || "").join("") || "(未命名)";
        sources.push({ id, name, reachable: true, remoteCount: await countDataSource(id, headers) });
      } catch (e) {
        sources.push({ id, reachable: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return { tokenValid, accountName, error, sources };
  });

/** 数条目数要翻页，库大的时候别把后台卡死，最多翻 30 页（3000 条）。 */
async function countDataSource(id: string, headers: Record<string, string>): Promise<number> {
  let cursor: string | undefined;
  let total = 0;
  for (let page = 0; page < 30; page++) {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`${NOTION_API_BASE}/data_sources/${encodeURIComponent(id)}/query`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) break;
    const json = (await res.json()) as { results?: unknown[]; has_more?: boolean; next_cursor?: string };
    total += (json.results || []).length;
    if (!json.has_more) break;
    cursor = json.next_cursor;
  }
  return total;
}

const saveAuthInput = z.object({
  token: z.string().trim().min(1).max(300).optional(),
  dataSourceIds: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});

export const saveNotionAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: z.infer<typeof saveAuthInput>) => saveAuthInput.parse(value))
  .handler(async ({ data }) => {
    const sql = db();
    if (data.token) {
      // 换令牌前留一份，改错了能立刻退回去。
      await sql`
        insert into public.settings (key, value)
        select 'notion_token_previous', value from public.settings where key = 'notion_token'
        on conflict (key) do update set value = excluded.value
      `;
      await sql`
        insert into public.settings (key, value) values ('notion_token', ${data.token})
        on conflict (key) do update set value = excluded.value
      `;
    }
    if (data.dataSourceIds) {
      await sql`
        insert into public.settings (key, value)
        values ('notion_data_source_id', ${data.dataSourceIds.join(",")})
        on conflict (key) do update set value = excluded.value
      `;
    }
    return { ok: true };
  });

const resolveInput = z.object({ url: z.string().trim().min(6).max(500) });

export type ResolvedNotionUrl = {
  databaseId: string;
  databaseTitle: string;
  dataSources: Array<{ id: string; name: string }>;
};

/**
 * 把用户从浏览器地址栏复制来的 Notion 链接解析成 data_source id。
 *
 * 这一步是必须的，也是最容易搞错的地方：链接里那串 id 是 **database** id，而同步
 * 要用的是它下面的 **data_source** id，两者不同。直接把链接里的 id 填进配置，
 * 查询时就会得到 404 object_not_found。
 */
export const resolveNotionUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: z.infer<typeof resolveInput>) => resolveInput.parse(value))
  .handler(async ({ data }): Promise<ResolvedNotionUrl> => {
    const settings = await readSettings();
    const token = settings.notion_token || process.env.NOTION_TOKEN || "";
    if (!token) throw new Error("尚未配置 Notion 令牌");

    const hex = data.url.replace(/-/g, "").match(/[0-9a-f]{32}/i);
    if (!hex) throw new Error("链接里找不到 Notion ID");
    const raw = hex[0];
    const databaseId = `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;

    const res = await fetch(`${NOTION_API_BASE}/databases/${databaseId}`, {
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION },
    });
    if (!res.ok) {
      throw new Error(`读取 database 失败 ${res.status}: ${(await res.text()).slice(0, 160)}`);
    }
    const body = (await res.json()) as {
      title?: Array<{ plain_text?: string }>;
      data_sources?: Array<{ id?: string; name?: string }>;
    };
    return {
      databaseId,
      databaseTitle: (body.title || []).map((t) => t.plain_text || "").join("") || "(未命名)",
      dataSources: (body.data_sources || []).map((d) => ({
        id: str(d.id),
        name: str(d.name, "(未命名)"),
      })),
    };
  });

const runInput = z.object({
  task: z.enum(["notion", "notion-repair", "archive", "knowledge-index"]),
  /** 只对 notion / notion-repair 有意义：一次补多少篇正文。 */
  maxBodyPages: z.number().int().min(1).max(200).optional(),
  maxPages: z.number().int().min(1).max(50).optional(),
});

export const runSyncNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: z.infer<typeof runInput>) => runInput.parse(value))
  .handler(async ({ data }) => {
    const payload: Record<string, number> = {};
    if (data.maxBodyPages) payload.maxBodyPages = data.maxBodyPages;
    if (data.maxPages) payload.maxPages = data.maxPages;
    return workerFetch<SyncRunResult>(`/run/${data.task}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  });
