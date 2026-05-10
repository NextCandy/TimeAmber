/* ── 数据备份与恢复路由 (R2 / WebDAV) ──────── */

import { Hono } from "hono";
import type { Bindings, Variables } from "../types";

const backup = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── 通用辅助 ──────────────────────────────

async function readStreamToText(body: ReadableStream): Promise<string> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let done = false;
  while (!done) {
    const result = await reader.read();
    if (result.value) chunks.push(result.value);
    done = result.done;
  }
  return new TextDecoder().decode(new Uint8Array(chunks.flatMap((c) => [...c])));
}

// ── R2 备份 ───────────────────────────────

backup.get("/export", async (c) => {
  const db = c.get("db");
  const data = await db.exportAll();
  return c.json(data);
});

backup.post("/r2", async (c) => {
  const db = c.get("db");
  const storage = c.get("storage");
  const data = await db.exportAll();
  const json = JSON.stringify(data, null, 2);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const key = `backups/timeamber-backup-${timestamp}.json`;
  await storage.put(key, json, { contentType: "application/json", customMetadata: { type: "backup", version: "1.0" } });
  return c.json({ success: true, key, size: json.length, timestamp: data.exportedAt });
});

backup.get("/r2-list", async (c) => {
  const storage = c.get("storage");
  const items = await storage.list("backups/", 50);
  const backups = items
    .map((obj) => ({ key: obj.key, size: obj.size, uploaded: obj.uploaded, name: obj.key.replace("backups/", "") }))
    .sort((a, b) => b.uploaded.localeCompare(a.uploaded));
  return c.json(backups);
});

backup.post("/r2-delete", async (c) => {
  const { name } = await c.req.json<{ name: string }>();
  if (!name) return c.json({ error: "缺少文件名" }, 400);
  const storage = c.get("storage");
  await storage.delete(`backups/${name}`);
  return c.json({ success: true });
});

backup.post("/r2-preview", async (c) => {
  const { name } = await c.req.json<{ name: string }>();
  const storage = c.get("storage");
  const object = await storage.get(`backups/${name}`);
  if (!object) return c.json({ error: "备份文件不存在" }, 404);

  const text = await readStreamToText(object.body);
  try {
    const data = JSON.parse(text);
    return c.json({
      version: data.version || "unknown",
      exportedAt: data.exportedAt || "unknown",
      postCount: data.posts?.length || 0,
      tagCount: data.tags?.length || 0,
      postTitles: (data.posts || []).slice(0, 10).map((p: { title: string; slug: string }) => ({ title: p.title, slug: p.slug })),
      settingsKeys: Object.keys(data.settings || {}),
    });
  } catch {
    return c.json({ error: "备份文件格式无效" }, 400);
  }
});

backup.post("/restore", async (c) => {
  const body = await c.req.json();
  const db = c.get("db");
  try {
    const imported = await db.importAll({ posts: body.posts, tags: body.tags, settings: body.settings, mode: body.mode || "merge" });
    return c.json({ success: true, imported, mode: body.mode || "merge" });
  } catch (err) {
    return c.json({ error: `恢复失败: ${err instanceof Error ? err.message : "未知错误"}` }, 500);
  }
});

backup.post("/r2-restore", async (c) => {
  const { name, mode } = await c.req.json<{ name: string; mode?: "merge" | "overwrite" }>();
  if (!name) return c.json({ error: "缺少备份文件名" }, 400);
  const storage = c.get("storage");
  const db = c.get("db");
  const object = await storage.get(`backups/${name}`);
  if (!object) return c.json({ error: "备份文件不存在" }, 404);

  const text = await readStreamToText(object.body);
  let data: { posts?: unknown[]; tags?: unknown[]; settings?: Record<string, string> };
  try { data = JSON.parse(text); } catch { return c.json({ error: "备份文件格式无效，无法解析 JSON" }, 400); }
  if (!data.posts && !data.tags && !data.settings) return c.json({ error: "备份文件缺少有效数据字段（posts / tags / settings）" }, 400);

  try {
    const imported = await db.importAll({
      posts: data.posts as Parameters<typeof db.importAll>[0]["posts"],
      tags: data.tags as Parameters<typeof db.importAll>[0]["tags"],
      settings: data.settings,
      mode: mode || "merge",
    });
    return c.json({ success: true, imported, source: name, mode: mode || "merge" });
  } catch (err) {
    return c.json({ error: `恢复失败: ${err instanceof Error ? err.message : "未知错误"}` }, 500);
  }
});

// ── WebDAV 备份 ───────────────────────────

function isBlockedWebdavHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "::1" || host.startsWith("fc") || host.startsWith("fd") ||
    /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|0\.|169\.254\.)/.test(host);
}

function normalizeWebdavBaseUrl(url: URL): string {
  url.hash = ""; url.search = "";
  return url.toString().replace(/\/+$/, "");
}

function normalizeWebdavPath(path: string): string {
  const clean = path.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!clean) return "";
  return `/${clean.split("/").filter(Boolean).map(encodeURIComponent).join("/")}`;
}

function buildWebdavUrl(baseUrl: string, remotePath: string, filename?: string): string {
  return `${baseUrl}${remotePath}${filename ? `/${encodeURIComponent(filename)}` : ""}`;
}

function basicAuthHeader(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

function makeWebdavHeaders(authHeader: string): Record<string, string> {
  return { Authorization: authHeader, Accept: "*/*", "User-Agent": "TimeAmber-Backup/1.0" };
}

async function putWebdavFile(url: string, headers: Record<string, string>, payload: Uint8Array): Promise<Response> {
  const uploadHeaders = { ...headers, "Content-Type": "application/octet-stream", "Content-Length": String(payload.byteLength) };
  try {
    return await fetch(url, { method: "PUT", headers: uploadHeaders, body: payload });
  } catch {
    const { "Content-Length": _cl, ...fallbackHeaders } = uploadHeaders;
    return fetch(url, { method: "PUT", headers: fallbackHeaders, body: payload });
  }
}

async function ensureWebdavDirectory(baseUrl: string, remotePath: string, headers: Record<string, string>): Promise<string | null> {
  const segments = remotePath.split("/").filter(Boolean);
  let currentPath = "";
  const warnings: string[] = [];
  for (const segment of segments) {
    currentPath += `/${segment}`;
    const res = await fetch(buildWebdavUrl(baseUrl, currentPath), { method: "MKCOL", headers });
    if (res.status === 405) continue;
    if (res.status >= 500) { const d = await safeResponseText(res); warnings.push(`${res.status} ${res.statusText}${d ? ` - ${d}` : ""}`); continue; }
    if (res.status < 200 || res.status >= 300) { const d = await safeResponseText(res); return `WebDAV 目录创建失败: ${res.status} ${res.statusText}${d ? ` - ${d}` : ""}`; }
  }
  return warnings.length ? warnings.join("; ") : null;
}

async function safeResponseText(res: Response): Promise<string> {
  try { return (await res.text()).slice(0, 300).replace(/\s+/g, " ").trim(); } catch { return ""; }
}

backup.post("/webdav", async (c) => {
  const body = await c.req.json<{ url: string; username: string; password: string; path?: string }>();
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(body.url);
    if (parsedUrl.protocol !== "https:") return c.json({ error: "仅允许 HTTPS 协议的 WebDAV 地址" }, 400);
    if (isBlockedWebdavHost(parsedUrl.hostname)) return c.json({ error: "不允许内网地址" }, 400);
  } catch { return c.json({ error: "无效的 WebDAV 地址" }, 400); }

  if (!body.username?.trim() || !body.password) return c.json({ error: "请填写 WebDAV 用户名和密码/应用密钥" }, 400);

  const db = c.get("db");
  const data = await db.exportAll();
  const json = JSON.stringify(data, null, 2);
  const payload = new TextEncoder().encode(json);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `time-amber-backup-${timestamp}.json`;
  const baseUrl = normalizeWebdavBaseUrl(parsedUrl);
  const remotePath = normalizeWebdavPath(body.path || "/time-amber-backups");
  const authHeader = basicAuthHeader(body.username.trim(), body.password);
  const webdavHeaders = makeWebdavHeaders(authHeader);
  const fullUrl = buildWebdavUrl(baseUrl, remotePath, filename);

  try {
    const mkdirWarning = await ensureWebdavDirectory(baseUrl, remotePath, webdavHeaders);
    const res = await putWebdavFile(fullUrl, webdavHeaders, payload);
    if (res.status < 200 || res.status >= 300) {
      const detail = await safeResponseText(res);
      if (res.status === 403 && /ip has been blocked|security system|blocked by/i.test(detail)) {
        return c.json({ code: "webdav_ip_blocked", error: `WebDAV 服务商拦截了当前服务器出口 IP。${mkdirWarning ? ` 目录创建提示：${mkdirWarning}` : ""}` }, 502);
      }
      return c.json({ error: `WebDAV 上传失败: ${res.status} ${res.statusText}${detail ? ` - ${detail}` : ""}${mkdirWarning ? `；目录创建提示：${mkdirWarning}` : ""}` }, 500);
    }
    return c.json({ success: true, url: fullUrl, size: payload.byteLength, timestamp: data.exportedAt, warning: mkdirWarning || undefined });
  } catch (err) {
    return c.json({ error: `WebDAV 连接失败: ${err instanceof Error ? err.message : "未知错误"}` }, 500);
  }
});

export default backup;
