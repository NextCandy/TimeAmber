import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// 兼容 SM.MS v2 协议的图床（s.ee 默认，可切换至其他兼容端点）
// 文档: https://s.ee/docs/zh-CN/developers/smms-compatibility/

const seeInput = z.object({
  endpoint: z.string().url().max(300).optional(), // 默认 https://s.ee/api/v2/upload
  token: z.string().max(500),
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(200),
  base64: z.string().min(1).max(15_000_000),
});

const DEFAULT_ENDPOINT = "https://s.ee/api/v2/upload";
const MEDIA_PUBLIC_PREFIX = "/supabase/storage/v1/object/public/media/";

function publicMediaUrl(objectPath: string) {
  return `${MEDIA_PUBLIC_PREFIX}${objectPath.split("/").map(encodeURIComponent).join("/")}`;
}

export const seeUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof seeInput>) => seeInput.parse(d))
  .handler(async ({ data }) => {
    const bin = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (data.endpoint === "supabase://media") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
      const objectPath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;
      const { error } = await supabaseAdmin.storage
        .from("media")
        .upload(objectPath, bin, {
          contentType: data.contentType,
          upsert: false,
        });
      if (error) throw error;
      const url = publicMediaUrl(objectPath);
      const id = crypto.randomUUID();
      await supabaseAdmin.from("media_items").insert({
        id,
        bucket: "media",
        object_path: objectPath,
        name: data.filename,
        public_url: url,
        size_bytes: bin.byteLength,
        content_type: data.contentType,
        source: "supabase",
      });
      return { url, name: data.filename, id };
    }
    const blob = new Blob([bin], { type: data.contentType });
    const fd = new FormData();
    fd.append("smfile", blob, data.filename);
    const ep = data.endpoint?.trim() || DEFAULT_ENDPOINT;
    const res = await fetch(ep, {
      method: "POST",
      headers: { Authorization: data.token },
      body: fd,
    });
    const text = await res.text();
    let json: { success?: boolean; code?: string; message?: string; data?: { url?: string } };
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`图床返回非法响应 [${res.status}]: ${text.slice(0, 200)}`);
    }
    if (!json.success && json.code !== "image_repeated") {
      throw new Error(`图床上传失败：${json.message ?? json.code ?? "未知错误"}`);
    }
    const url = json.data?.url;
    if (!url) throw new Error("图床未返回图片 URL");
    return { url, name: data.filename };
  });

const fetchInput = z.object({ url: z.string().url().max(2000) });

export const fetchImageAsBase64 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof fetchInput>) => fetchInput.parse(d))
  .handler(async ({ data }) => {
    const res = await fetch(data.url);
    if (!res.ok) throw new Error(`抓取失败 [${res.status}]`);
    const ct = res.headers.get("content-type") ?? "image/jpeg";
    if (!ct.startsWith("image/")) throw new Error("不是图片");
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const base64 = btoa(bin);
    return { base64, contentType: ct };
  });
