import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

import { clipShellResponse, isClipHtml } from "./clip-shell.mjs";

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
  // 后台本地上传的媒体：类型给对了浏览器才会内联播放/预览，而不是当附件下载。
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".zip": "application/zip",
  ".7z": "application/x-7z-compressed",
  ".gz": "application/gzip",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** 解析 `Range: bytes=start-end`，越界或语法不认的一律返回 null，退回整文件响应。 */
function parseRange(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec((rangeHeader || "").trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;
  let start;
  let end;
  if (rawStart) {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : size - 1;
  } else {
    // bytes=-N 表示最后 N 字节
    start = size - Number(rawEnd);
    end = size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  start = Math.max(0, start);
  end = Math.min(size - 1, end);
  if (start > end) return null;
  return { start, end };
}

async function fileResponse(root, pathname, immutable = false, clip = false, rangeHeader = "") {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^([/\\]*\.\.[/\\])+/, "");
  const target = resolve(root, clean.replace(/^[/\\]+/, ""));
  if (!target.startsWith(root) || target === root) return null;
  try {
    const info = await stat(target);
    if (!info.isFile()) return null;
    const contentType = contentTypes[extname(target).toLowerCase()] || "application/octet-stream";

    // 剪藏快照在正文前插一条本站标注条（来源、剪藏时间、返回入口），见 clip-shell.mjs。
    // 套壳失败一律回退成原样的静态响应，不让读者吃到 500。
    if (clip && isClipHtml(target)) {
      const shelled = await clipShellResponse(target, info, contentType);
      if (shelled) return shelled;
    }

    const cacheControl =
      immutable || target.includes(`${join("assets", "")}`)
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300";

    // 视频/音频要能拖进度条，就得认 Range —— 否则浏览器只能整段下完再播。
    const range = parseRange(rangeHeader, info.size);
    if (range) {
      const { start, end } = range;
      return new Response(Readable.toWeb(createReadStream(target, { start, end })), {
        status: 206,
        headers: new Headers({
          "content-type": contentType,
          "content-length": String(end - start + 1),
          "content-range": `bytes ${start}-${end}/${info.size}`,
          "accept-ranges": "bytes",
          "cache-control": cacheControl,
        }),
      });
    }

    const headers = new Headers({
      "content-type": contentType,
      "content-length": String(info.size),
      "accept-ranges": "bytes",
      "cache-control": cacheControl,
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
      ? await fileResponse(mediaRoot, mediaPath, true, true, req.headers.range)
      : await fileResponse(clientRoot, url.pathname, false, false, req.headers.range);
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
