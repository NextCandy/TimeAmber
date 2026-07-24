import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

const port = Number(process.env.PORT || 3000);
const clientRoot = resolve(process.cwd(), "dist/client");
const mediaRoot = resolve(process.env.MEDIA_ROOT || "/data/media");
const handler = (await import("../dist/server/server.js")).default;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function fileResponse(root, pathname, immutable = false) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^([/\\]*\.\.[/\\])+/, "");
  const target = resolve(root, clean.replace(/^[/\\]+/, ""));
  if (!target.startsWith(root) || target === root) return null;
  try {
    const info = await stat(target);
    if (!info.isFile()) return null;
    const headers = new Headers({
      "content-type": contentTypes[extname(target).toLowerCase()] || "application/octet-stream",
      "content-length": String(info.size),
      "cache-control": immutable || target.includes(`${join("assets", "")}`)
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300",
    });
    return new Response(Readable.toWeb(createReadStream(target)), { headers });
  } catch {
    return null;
  }
}

function acceptsGzip(req) {
  return /\bgzip\b/i.test(req.headers["accept-encoding"] || "");
}

function isCompressible(response) {
  const type = response.headers.get("content-type") || "";
  return /^(text\/|application\/(?:javascript|json|xml)|image\/svg\+xml)/i.test(type);
}

async function sendResponse(req, res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));

  if (!response.body || req.method === "HEAD") {
    if (response.body) await response.body.cancel();
    res.end();
    return;
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  const shouldCompress =
    acceptsGzip(req) &&
    !response.headers.has("content-encoding") &&
    isCompressible(response) &&
    (contentLength === 0 || contentLength >= 1024);

  if (shouldCompress) {
    res.removeHeader("content-length");
    res.setHeader("content-encoding", "gzip");
    const vary = response.headers.get("vary");
    res.setHeader("vary", vary ? `${vary}, Accept-Encoding` : "Accept-Encoding");
    await pipeline(Readable.fromWeb(response.body), createGzip({ level: 6 }), res);
    return;
  }

  await pipeline(Readable.fromWeb(response.body), res);
}

async function proxySupabase(req, url) {
  const upstream = new URL(
    url.pathname.slice("/supabase".length) + url.search,
    process.env.SUPABASE_URL || "http://kong:8000",
  );
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null || ["host", "connection", "content-length", "transfer-encoding"].includes(key)) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  headers.set("accept-encoding", "identity");
  if (!headers.has("apikey") && process.env.SUPABASE_PUBLISHABLE_KEY) {
    headers.set("apikey", process.env.SUPABASE_PUBLISHABLE_KEY);
  }

  return fetch(upstream, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : Readable.toWeb(req),
    duplex: "half",
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
}

createServer(async (req, res) => {
  try {
    const origin = `http://${req.headers.host || `127.0.0.1:${port}`}`;
    const url = new URL(req.url || "/", origin);
    if (url.pathname.startsWith("/supabase/")) {
      await sendResponse(req, res, await proxySupabase(req, url));
      return;
    }
    const mediaPath = url.pathname.startsWith("/cdn/") ? url.pathname.slice(5) : "";
    const staticResult = mediaPath
      ? await fileResponse(mediaRoot, mediaPath, true)
      : await fileResponse(clientRoot, url.pathname);
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : Readable.toWeb(req),
      duplex: "half",
    });
    const response = staticResult || await handler.fetch(request, process.env, {});
    await sendResponse(req, res, response);
  } catch (error) {
    console.error("[TimeAmber] request failed", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end("Internal Server Error");
    } else if (!res.writableEnded) {
      res.destroy();
    }
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`[TimeAmber] listening on 0.0.0.0:${port}`);
});
