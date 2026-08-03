import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import postgres from "postgres";

import { PROJECT_ROOT, fetchWithTimeout, readJson } from "./common.mjs";

export const DEFAULT_THUMBNAIL_WIDTH = 260;
export const THUMBNAIL_FORMAT = "webp";

const SUPPORTED_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);

function extension(value = "") {
  const clean = String(value).split(/[?#]/, 1)[0].toLowerCase();
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.slice(dot) : "";
}

export function isSupportedImage(item) {
  const type = String(item.contentType ?? "").toLowerCase();
  return type.startsWith("image/") && type !== "image/svg+xml" || SUPPORTED_EXTENSIONS.has(extension(item.objectPath || item.name));
}

export function thumbnailPath(item, width = DEFAULT_THUMBNAIL_WIDTH) {
  const original = String(item.objectPath || item.name || item.id).replace(/^\/+/, "");
  return `thumbnails/${original}.${width}.${THUMBNAIL_FORMAT}`;
}

export function normalizeMediaItem(row) {
  return {
    id: String(row.id ?? ""),
    bucket: String(row.bucket ?? "media"),
    objectPath: String(row.objectPath ?? row.object_path ?? ""),
    name: String(row.name ?? row.objectPath ?? row.object_path ?? row.id ?? "media"),
    publicUrl: (row.publicUrl ?? row.public_url) ? String(row.publicUrl ?? row.public_url) : "",
    sizeBytes: row.sizeBytes == null && row.size_bytes == null ? undefined : Number(row.sizeBytes ?? row.size_bytes),
    contentType: (row.contentType ?? row.content_type) ? String(row.contentType ?? row.content_type) : "",
    source: String(row.source ?? "manual"),
    createdAt: (row.createdAt ?? row.created_at) ? String(row.createdAt ?? row.created_at) : undefined,
    fixture: row.fixture ?? undefined,
  };
}

export async function loadMediaInventory(inputFile = "") {
  if (inputFile) {
    const value = await readJson(inputFile, null);
    if (!value) throw new Error(`无法读取媒体清单：${inputFile}`);
    const items = Array.isArray(value) ? value : value.items;
    if (!Array.isArray(items)) throw new Error("媒体清单必须是数组或 { items: [] }");
    return items.map(normalizeMediaItem);
  }
  if (!process.env.DATABASE_URL) throw new Error("未配置 DATABASE_URL；请使用 --input 或只读数据库连接");
  const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10, idle_timeout: 20, prepare: false });
  try {
    const rows = await sql`
      select id, bucket, object_path, name, public_url, size_bytes, content_type, source, created_at
      from public.media_items
      order by created_at desc
      limit 5000
    `;
    return rows.map(normalizeMediaItem);
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

function safeLocalPath(root, bucket, objectPath) {
  const rootPath = resolve(root);
  const target = resolve(rootPath, bucket, objectPath.replaceAll("/", "\\"));
  const relativeTarget = relative(rootPath, target);
  if (!relativeTarget || relativeTarget.startsWith("..") || isAbsolute(relativeTarget)) {
    throw new Error(`媒体路径越界：${objectPath}`);
  }
  return target;
}

export async function createMediaStorageAdapter({ root = "" } = {}) {
  if (root) {
    const rootPath = resolve(PROJECT_ROOT, root);
    return {
      kind: "local",
      async inspect(item, objectPath, withBuffer = false) {
        try {
          const file = safeLocalPath(rootPath, item.bucket, objectPath);
          const info = await stat(file);
          return { exists: info.isFile(), bytes: info.size, path: file, buffer: withBuffer ? await readFile(file) : undefined };
        } catch (error) {
          return { exists: false, bytes: 0, error: error instanceof Error ? error.message : String(error) };
        }
      },
      async put(item, objectPath, buffer) {
        const file = safeLocalPath(rootPath, item.bucket, objectPath);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, buffer);
        return { path: file, bytes: buffer.byteLength };
      },
    };
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (supabaseUrl && serviceKey) {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    return {
      kind: "supabase",
      async inspect(item, objectPath, withBuffer = false) {
        const { data, error } = await client.storage.from(item.bucket).download(objectPath);
        if (error || !data) return { exists: false, bytes: 0, error: error?.message ?? "对象不存在" };
        const buffer = Buffer.from(await data.arrayBuffer());
        return { exists: true, bytes: buffer.byteLength, buffer: withBuffer ? buffer : undefined };
      },
      async put(item, objectPath, buffer, contentType = "image/webp") {
        const { error } = await client.storage.from(item.bucket).upload(objectPath, buffer, { contentType, upsert: true });
        if (error) throw error;
        return { path: objectPath, bytes: buffer.byteLength };
      },
    };
  }

  return {
    kind: "public-head",
    async inspect(item, objectPath) {
      const isOriginal = objectPath === item.objectPath;
      const rawUrl = isOriginal ? item.publicUrl : "";
      const baseUrl = process.env.MEDIA_BASE_URL || process.env.OPT_BASE_URL || "http://127.0.0.1:3000";
      let url = "";
      try {
        url = rawUrl ? new URL(rawUrl, baseUrl).toString() : "";
      } catch {
        url = "";
      }
      if (!url) return { exists: false, bytes: 0, error: "没有可用存储适配器或公开 URL" };
      try {
        const response = await fetchWithTimeout(url, { method: "HEAD" }, 10_000);
        const length = Number(response.headers.get("content-length") ?? 0);
        return { exists: response.ok, bytes: length, error: response.ok ? undefined : `HTTP ${response.status}` };
      } catch (error) {
        return { exists: false, bytes: 0, error: error instanceof Error ? error.message : String(error) };
      }
    },
    async put() {
      throw new Error("只读 public-head 适配器不能生成缩略图；请提供 --root 或 Supabase service key");
    },
  };
}

export function fixtureProbe(item, kind) {
  const data = item.fixture?.[kind];
  if (!data) return null;
  return {
    exists: Boolean(data.exists),
    bytes: Number(data.bytes ?? 0),
    error: data.error,
    path: data.path,
  };
}
