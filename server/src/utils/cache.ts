/**
 * 边缘缓存 JSON 响应辅助函数
 * 利用 Cloudflare Cache API 实现 stale-while-revalidate
 */
export async function publicCachedJson<T>(
  c: any,
  options: { maxAge: number; sMaxAge: number; staleWhileRevalidate: number },
  producer: () => Promise<T>,
) {
  const cacheControl = `public, max-age=${options.maxAge}, s-maxage=${options.sMaxAge}, stale-while-revalidate=${options.staleWhileRevalidate}`;
  const cacheKey = new Request(c.req.url, { method: "GET" });

  // 尝试命中边缘缓存
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    const hit = new Response(cached.body, cached);
    hit.headers.set("X-TimeAmber-Cache", "HIT");
    return hit;
  }

  const data = await producer();
  const response = Response.json(data, {
    headers: {
      "Cache-Control": cacheControl,
      "X-TimeAmber-Cache": "MISS",
    },
  });
  c.executionCtx?.waitUntil(caches.default.put(cacheKey, response.clone()));
  return response;
}
