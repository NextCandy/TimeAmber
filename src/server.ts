import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// sitemap / RSS 在这里拦截而不是做成文件路由：它们是 XML 而非 HTML，
// 走页面路由会被 SSR 外壳包住。动态 import 保证不影响正常请求的启动开销。
async function feedResponse(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/sitemap.xml" && url.pathname !== "/rss.xml") return null;

  // 站点走 Cloudflare Tunnel，转发后的 request.url 可能是内网地址，
  // 以代理头里的原始 host 为准，否则 sitemap 里会写出 127.0.0.1。
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const host = forwardedHost ?? request.headers.get("host") ?? url.host;
  const proto =
    forwardedProto ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const origin = `${proto}://${host}`;

  try {
    const feeds = await import("./lib/feeds.server");
    const isSitemap = url.pathname === "/sitemap.xml";
    const body = isSitemap ? await feeds.buildSitemap(origin) : await feeds.buildRss(origin);
    return new Response(body, {
      headers: {
        "content-type": isSitemap
          ? "application/xml; charset=utf-8"
          : "application/rss+xml; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("[TimeAmber] failed to build feed", error);
    return new Response("feed temporarily unavailable", { status: 503 });
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const feed = await feedResponse(request);
      if (feed) return feed;

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
