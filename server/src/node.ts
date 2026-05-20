import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { serve } from "@hono/node-server";
import worker from "./index";

type CacheEntry = { response: Response; expiresAt: number };

class MemoryCache {
  private readonly items = new Map<string, CacheEntry>();

  async match(request: Request): Promise<Response | undefined> {
    const key = request.url;
    const item = this.items.get(key);
    if (!item) return undefined;
    if (item.expiresAt <= Date.now()) {
      this.items.delete(key);
      return undefined;
    }
    return item.response.clone();
  }

  async put(request: Request, response: Response): Promise<void> {
    const cacheControl = response.headers.get("Cache-Control") || "";
    const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 60);
    this.items.set(request.url, {
      response: response.clone(),
      expiresAt: Date.now() + Math.max(maxAge, 1) * 1000,
    });
  }

  async delete(request: Request): Promise<boolean> {
    return this.items.delete(request.url);
  }
}

if (!("caches" in globalThis)) {
  Object.defineProperty(globalThis, "caches", {
    value: { default: new MemoryCache() },
    configurable: true,
  });
}

const port = Number(process.env.PORT || 8787);
const staticDir = path.resolve(process.env.STATIC_DIR || path.join(process.cwd(), "client", "dist"));
const env = process.env as Record<string, string | undefined>;
const workerPaths = new Set(["/rss.xml", "/sitemap.xml", "/robots.txt"]);

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function waitUntil(promise: Promise<unknown>) {
  promise.catch((err) => console.error("[waitUntil]", err));
}

function isWorkerPath(pathname: string) {
  return pathname.startsWith("/api/") || pathname.startsWith("/cdn/") || workerPaths.has(pathname);
}

async function fileResponse(filePath: string, request: Request): Promise<Response | null> {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return null;
    const headers = new Headers({
      "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": filePath.includes(`${path.sep}assets${path.sep}`)
        ? "public, max-age=31536000, immutable"
        : "public, max-age=60",
    });
    if (request.method === "HEAD") return new Response(null, { headers });
    return new Response(Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream, { headers });
  } catch {
    return null;
  }
}

serve({
  port,
  fetch: async (request) => {
    const url = new URL(request.url);
    if (isWorkerPath(url.pathname)) {
      return worker.fetch(request, env, { waitUntil } as ExecutionContext);
    }

    const requestedPath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
    const candidate = path.resolve(staticDir, safePath || "index.html");
    const target = candidate.startsWith(staticDir) ? candidate : path.join(staticDir, "index.html");
    return (await fileResponse(target, request))
      || (await fileResponse(path.join(staticDir, "index.html"), request))
      || new Response("TimeAmber static assets not found", { status: 404 });
  },
});

console.log(`[TimeAmber] listening on 0.0.0.0:${port}`);
