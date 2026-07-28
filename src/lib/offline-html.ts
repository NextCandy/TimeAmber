const OFFLINE_HTML_MARKER =
  /<!--\s*timeamber-offline-html:v1\s+source:[a-z0-9_-]+\s+id:\d+\s+url:([^\s>]+)\s*-->/i;

/**
 * 兼容早期剪藏记录：HTML 地址写在正文注释里，而不是 external_url 字段。
 * 只接受站内 /cdn/ 路径，避免把任意正文内容当成跳转地址。
 */
export function getOfflineHtmlUrl(content: unknown): string | undefined {
  if (typeof content !== "string") return undefined;
  const url = content.match(OFFLINE_HTML_MARKER)?.[1]?.trim();
  return url?.startsWith("/cdn/") ? url : undefined;
}
