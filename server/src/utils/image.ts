/* ── 图片相关工具函数 ──────────────────────────── */

/** 从 markdown 中提取首张图片 URL，作为封面缺省兜底 */
export function extractFirstImage(markdown: string): string {
  if (!markdown) return "";
  // 优先匹配 ![](url)；只允许非空白与非右括号字符，避免回溯灾难
  const md = markdown.match(/!\[[^\]]*\]\(([^\s)]+)/);
  if (md?.[1]) return md[1];
  // 兜底匹配 <img src="url">
  const html = markdown.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (html?.[1]) return html[1];
  return "";
}

export function normalizeCoverImage(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 从 Markdown 内容中提取所有外链图片 URL */
export function extractExternalImageUrls(content: string): string[] {
  const urls = new Set<string>();
  const mdRegex = /!\[[^\]]*\]\(([^\s"')]+)/g;
  let match;
  while ((match = mdRegex.exec(content)) !== null) {
    const url = match[1].trim();
    if (url && !url.startsWith("/") && !url.startsWith("data:")) {
      try { new URL(url); urls.add(url); } catch { /* non-URL skip */ }
    }
  }
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  while ((match = imgRegex.exec(content)) !== null) {
    const url = match[1].trim();
    if (url && !url.startsWith("/") && !url.startsWith("data:")) {
      try { new URL(url); urls.add(url); } catch { /* skip */ }
    }
  }
  return Array.from(urls);
}

/** SSRF 防护：仅允许 https:// 开头的外部图片地址 */
export function isSafeImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|0\.|169\.254\.)/.test(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function isSeeHostedUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === "s.ee" || hostname.endsWith(".s.ee") || hostname === "i.see.you";
  } catch {
    return false;
  }
}

export function filenameFromImageUrl(url: string, contentType: string): string {
  const extFromType = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg"
    : contentType.includes("png") ? "png"
    : contentType.includes("gif") ? "gif"
    : contentType.includes("webp") ? "webp"
    : contentType.includes("svg") ? "svg"
    : contentType.includes("avif") ? "avif"
    : "png";

  try {
    const rawName = new URL(url).pathname.split("/").pop() || "";
    const cleanName = decodeURIComponent(rawName).replace(/[^\w.-]/g, "-").slice(0, 96);
    return cleanName && /\.[a-z0-9]{2,5}$/i.test(cleanName) ? cleanName : `timeamber-${Date.now()}.${extFromType}`;
  } catch {
    return `timeamber-${Date.now()}.${extFromType}`;
  }
}

export function normalizeSeePublicUrl(uploadedUrl: string | undefined, fileId: string | undefined): string | null {
  if (uploadedUrl) {
    try {
      const parsed = new URL(uploadedUrl);
      const hostname = parsed.hostname.toLowerCase();
      if (hostname === "i.see.you" || hostname === "s.ee" || hostname.endsWith(".s.ee")) {
        return parsed.toString();
      }
    } catch {
      // Fall back to file_id below.
    }
  }
  return fileId ? `https://s.ee/${fileId}` : null;
}

export async function uploadImageToSee(url: string, apiToken: string): Promise<string> {
  const abortCtrl = new AbortController();
  const timeoutId = setTimeout(() => abortCtrl.abort(), 15000);
  try {
    const sourceResp = await fetch(url, {
      headers: { "User-Agent": "TimeAmber-Bot/1.0" },
      signal: abortCtrl.signal,
    });
    if (!sourceResp.ok) throw new Error(`source HTTP ${sourceResp.status}`);

    const contentLength = sourceResp.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > 20 * 1024 * 1024) {
      throw new Error("image exceeds 20MB limit");
    }

    const contentType = sourceResp.headers.get("content-type") || "image/png";
    if (!contentType.toLowerCase().startsWith("image/")) {
      throw new Error(`unsupported content type: ${contentType}`);
    }

    const arrayBuffer = await sourceResp.arrayBuffer();
    if (arrayBuffer.byteLength > 20 * 1024 * 1024) {
      throw new Error("image exceeds 20MB limit");
    }

    const form = new FormData();
    form.append("file", new Blob([arrayBuffer], { type: contentType }), filenameFromImageUrl(url, contentType));

    const uploadResp = await fetch("https://s.ee/api/v1/file/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}` },
      body: form,
    });
    const payload = await uploadResp.json<{
      success?: boolean;
      message?: string;
      data?: { file_id?: string; url?: string };
    }>().catch(() => null);

    const publicUrl = normalizeSeePublicUrl(payload?.data?.url, payload?.data?.file_id);
    if (!uploadResp.ok || !payload?.success || !publicUrl) {
      throw new Error(payload?.message || `S.EE HTTP ${uploadResp.status}`);
    }
    return publicUrl;
  } finally {
    clearTimeout(timeoutId);
  }
}

type SeeRewriteResult = {
  content: string;
  replaced: number;
  failed: number;
  errors: string[];
};

export async function rewriteExternalImagesToSee(content: string, settings: Record<string, string>): Promise<SeeRewriteResult> {
  const enabled = settings.see_image_hosting_enabled === "true";
  const apiToken = (settings.see_api_token || "").trim();
  if (!enabled || !apiToken || !content) {
    return { content, replaced: 0, failed: 0, errors: [] };
  }

  const externalUrls = extractExternalImageUrls(content).filter((url) => !isSeeHostedUrl(url));
  let nextContent = content;
  let replaced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const url of externalUrls) {
    if (!isSafeImageUrl(url)) {
      failed++;
      errors.push(`${url}: only HTTPS public image URLs are allowed`);
      continue;
    }
    try {
      const seeUrl = await uploadImageToSee(url, apiToken);
      nextContent = nextContent.split(url).join(seeUrl);
      replaced++;
    } catch (err) {
      failed++;
      errors.push(`${url}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return { content: nextContent, replaced, failed, errors };
}
