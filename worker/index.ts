import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import postgres from "postgres";

import { syncArchiveSources } from "./archive-sync";
import { KnowledgeIndexer } from "./knowledge-index";
import { syncNotionPosts } from "./notion-sync";
import { PostgresAdapter } from "./storage/db/postgres";
import { FileSystemAdapter } from "./storage/object/fs";
import { rewriteExternalImagesToSee } from "./utils/image";

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const sql = postgres(databaseUrl, {
  max: 3,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
});
const database = new PostgresAdapter(databaseUrl);
const storage = new FileSystemAdapter(process.env.MEDIA_ROOT || "/data/media");
const knowledgeIndexer = new KnowledgeIndexer(databaseUrl, storage);
const workerSecret = process.env.WORKER_SECRET || "";
const port = Number(process.env.WORKER_PORT || 3001);

type TaskResult = Record<string, unknown> | Record<string, unknown>[];

async function writeRun(
  sourceKey: string,
  runId: number,
  status: "success" | "failed",
  result?: TaskResult,
  error?: unknown,
) {
  const values = Array.isArray(result) ? result : result ? [result] : [];
  const sum = (key: string) => values.reduce((total, value) => total + Number(value[key] ?? 0), 0);
  await sql`
    update public.sync_runs set
      status = ${status},
      finished_at = now(),
      created_count = ${sum("created")},
      updated_count = ${sum("updated")},
      skipped_count = ${sum("skipped")},
      failed_count = ${sum("failed")},
      details = ${sql.json(result ?? {})},
      error = ${error instanceof Error ? error.message : error ? String(error) : null}
    where id = ${runId}
  `;
}

function taskResultFailed(result: TaskResult): boolean {
  const values = Array.isArray(result) ? result : [result];
  return values.some((value) => value.success === false || Number(value.failed ?? 0) > 0);
}

async function runLockedTask(sourceKey: string, mode: string, task: () => Promise<TaskResult>) {
  const [run] = await sql`
    insert into public.sync_runs (source_key, mode)
    values (${sourceKey}, ${mode})
    returning id
  `;
  try {
    const result = await sql.begin(async (tx) => {
      const [lock] = await tx`
        select pg_try_advisory_xact_lock(hashtext(${`timeamber:${sourceKey}`})) as acquired
      `;
      if (!lock.acquired) throw new Error(`${sourceKey} is already running`);
      await tx`select pg_advisory_xact_lock(hashtext('timeamber_content_write'))`;
      return task();
    });
    await writeRun(
      sourceKey,
      Number(run.id),
      taskResultFailed(result) ? "failed" : "success",
      result,
    );
    return result;
  } catch (error) {
    await writeRun(sourceKey, Number(run.id), "failed", undefined, error);
    throw error;
  }
}

// 每轮 repair 能回填多少篇正文。历史值是 1（Cloudflare Workers 时代的
// 子请求预算所迫），在 NAS 上没有这个限制，积压时按这个速率要跑好几天。
const DEFAULT_REPAIR_BODY_PAGES = Number(process.env.NOTION_REPAIR_BODY_PAGES || 8);

type NotionRunOverrides = {
  maxPages?: number;
  maxBodyPages?: number;
  maxSubrequests?: number;
  minRequestIntervalMs?: number;
};

async function runNotion(repairOnly = false, overrides: NotionRunOverrides = {}) {
  return runLockedTask(
    repairOnly ? "notion-repair" : "notion",
    repairOnly ? "repair" : "incremental",
    async () => {
      const settings = await database.getSettings();
      const rewriteImages = settings.notion_sync_rewrite_images === "true";
      return syncNotionPosts({
        db: database,
        env: process.env,
        settings,
        rewriteImages: async (content) =>
          rewriteImages ? (await rewriteExternalImagesToSee(content, settings)).content : content,
        maxPages: overrides.maxPages ?? 1,
        repairOnly,
        maxBodyPages:
          overrides.maxBodyPages ?? (repairOnly ? DEFAULT_REPAIR_BODY_PAGES : undefined),
        maxSubrequests: overrides.maxSubrequests,
        minRequestIntervalMs: overrides.minRequestIntervalMs,
      });
    },
  );
}

async function runArchive() {
  return runLockedTask("web-archive", "incremental", () =>
    syncArchiveSources(database, storage, process.env, {
      maxPages: 10,
      advanceCursor: true,
      includeLatestPage: true,
      indexDocument: (document) => knowledgeIndexer.upsertArchiveDocument(document),
    }),
  );
}

async function runKnowledgeIndex() {
  const batchSize = Number(process.env.KNOWLEDGE_INDEX_BATCH_SIZE || 100);
  return runLockedTask("knowledge-index", "incremental", () =>
    knowledgeIndexer.backfillPendingArchives(batchSize),
  );
}

function shanghaiParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

async function runBackup() {
  const root = process.env.BACKUP_ROOT || "/data/backups";
  await mkdir(root, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(root, `timeamber-${stamp}.dump`);
  const [run] = await sql`
    insert into public.backup_runs (target) values ('local') returning id
  `;
  try {
    await execFileAsync("pg_dump", [
      "--format=custom",
      "--no-owner",
      "--no-acl",
      `--file=${target}`,
      databaseUrl,
    ]);
    const info = await stat(target);
    await sql`
      update public.backup_runs set
        status = 'success', object_key = ${target}, size_bytes = ${info.size}, finished_at = now()
      where id = ${run.id}
    `;
    const files = (await readdir(root))
      .filter((name) => name.startsWith("timeamber-") && name.endsWith(".dump"))
      .sort()
      .reverse();
    for (const old of files.slice(Number(process.env.BACKUP_RETENTION || 30))) {
      await rm(path.join(root, old), { force: true });
    }
  } catch (error) {
    await sql`
      update public.backup_runs set
        status = 'failed', error = ${error instanceof Error ? error.message : String(error)},
        finished_at = now()
      where id = ${run.id}
    `;
    throw error;
  }
}

let lastMinute = "";
async function tick() {
  const now = new Date();
  const minuteKey = now.toISOString().slice(0, 16);
  if (minuteKey === lastMinute) return;
  lastMinute = minuteKey;
  const minute = now.getUTCMinutes();
  const syncEnabled = process.env.SYNC_ENABLED === "true";

  if (syncEnabled && minute % 10 === 0) {
    await runNotion(false).catch((error) => console.error("[worker] notion", error));
  }
  if (syncEnabled && minute % 10 === 5) {
    await runNotion(true).catch((error) => console.error("[worker] notion repair", error));
  }
  if (syncEnabled && minute % 20 === 5) {
    await runArchive().catch((error) => console.error("[worker] web archive", error));
  }
  if (syncEnabled && minute % 20 === 18) {
    await runKnowledgeIndex().catch((error) => console.error("[worker] knowledge index", error));
  }

  const shanghai = shanghaiParts(now);
  if (
    process.env.BACKUP_ENABLED !== "false" &&
    shanghai.hour === "03" &&
    shanghai.minute === "30"
  ) {
    await runLockedTask("backup", "scheduled", async () => {
      await runBackup();
      return { ok: true };
    }).catch((error) => console.error("[worker] backup", error));
  }
}

async function jsonBody(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

createServer(async (request, response) => {
  response.setHeader("content-type", "application/json; charset=utf-8");
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "worker"}`);
    if (url.pathname !== "/health" && request.headers["x-worker-secret"] !== workerSecret) {
      response.statusCode = 401;
      response.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    if (url.pathname === "/health") {
      const [check] = await sql`select now() as now`;
      response.end(JSON.stringify({ ok: true, database: check.now }));
      return;
    }
    if (url.pathname === "/status") {
      const runs = await sql`
        select * from public.sync_runs order by started_at desc limit 100
      `;
      response.end(JSON.stringify({ syncEnabled: process.env.SYNC_ENABLED === "true", runs }));
      return;
    }
    const body: NotionRunOverrides =
      request.method === "POST" ? await jsonBody(request) : {};
    let result: TaskResult;
    if (url.pathname === "/run/notion") result = await runNotion(false, body);
    else if (url.pathname === "/run/notion-repair") result = await runNotion(true, body);
    else if (url.pathname === "/run/archive") result = await runArchive();
    else if (url.pathname === "/run/knowledge-index") result = await runKnowledgeIndex();
    else if (url.pathname === "/run/backup") {
      await runBackup();
      result = { ok: true };
    } else {
      response.statusCode = 404;
      response.end(JSON.stringify({ error: "Not found" }));
      return;
    }
    response.end(JSON.stringify(result));
  } catch (error) {
    response.statusCode = 500;
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`[worker] listening on 0.0.0.0:${port}`);
});

await database.ensureCoreTables();
setInterval(() => void tick(), 60_000);
setTimeout(() => void tick(), 5_000);
