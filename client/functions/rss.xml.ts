import {
  buildTargetUrl,
  createPlainApiBaseErrorResponse,
  getBackendUrl,
} from "./_shared";

// 代理 /rss.xml 到 Workers 后端
export const onRequest: PagesFunction<{ API_BASE: string }> = async (context) => {
  const backend = getBackendUrl(context.env);
  if (!backend) {
    return createPlainApiBaseErrorResponse();
  }

  const target = buildTargetUrl(backend, context.request);
  const res = await fetch(target, {
    method: context.request.method,
    headers: context.request.headers,
  });
  return new Response(res.body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "application/rss+xml; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
};
