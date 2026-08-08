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
  .validator((d: z.infer<typeof seeInput>) => seeInput.parse(d))
  .handler(async ({ data }) => {
    const bin = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (data.endpoint === "supabase://media") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
      const objectPath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;
      const { error } = await supabaseAdmin.storage.from("media").upload(objectPath, bin, {
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
  .validator((d: z.infer<typeof fetchInput>) => fetchInput.parse(d))
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

/* ── 本地上传（存到树莓派，不经图床）─────────────── */

// 写入的是容器里单独挂的可写目录；读取仍走只读的 /data/media，URL 前缀 /cdn/uploads/。
const LOCAL_UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR || "/data/uploads";
const LOCAL_PUBLIC_PREFIX = "/cdn/uploads/";
const LOCAL_MAX_BYTES = Number(process.env.LOCAL_UPLOAD_MAX_BYTES || 512 * 1024 * 1024);

/**
 * 只留文件名本身。路径分隔符、控制字符、以及各种会让 shell/URL 犯迷糊的符号
 * 统统换成连字符，确保写不到 uploads 目录外面去。
 */
function safeFileName(raw: string) {
  const base = raw.split(/[\\/]/).pop() || "file";
  const cleaned = base
    .replace(/[^\w.\-一-龥]/g, "-")
    .replace(/^\.+/, "")
    .slice(-120);
  return cleaned || "file";
}

export const uploadToLocal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: FormData) => {
    if (!(data instanceof FormData)) throw new Error("需要 FormData");
    const file = data.get("file");
    if (!(file instanceof File)) throw new Error("缺少文件");
    if (file.size <= 0) throw new Error("文件是空的");
    if (file.size > LOCAL_MAX_BYTES)
      throw new Error(`文件超过上限 ${Math.floor(LOCAL_MAX_BYTES / 1024 / 1024)}MB`);
    return { file };
  })
  .handler(async ({ data, context }) => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 只有管理员能往盘上写东西
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (profile?.role !== "admin") throw new Error("Administrator access required");

    const file = data.file;
    const name = safeFileName(file.name);
    // 按月分目录，免得单个目录堆几万个文件
    const bucketDir = new Date().toISOString().slice(0, 7);
    const objectPath = `${bucketDir}/${crypto.randomUUID()}-${name}`;
    const target = join(LOCAL_UPLOAD_DIR, objectPath);

    await mkdir(join(LOCAL_UPLOAD_DIR, bucketDir), { recursive: true });
    await writeFile(target, Buffer.from(await file.arrayBuffer()));

    const url = `${LOCAL_PUBLIC_PREFIX}${objectPath.split("/").map(encodeURIComponent).join("/")}`;
    const id = crypto.randomUUID();
    await supabaseAdmin.from("media_items").insert({
      id,
      bucket: "local",
      object_path: objectPath,
      name: file.name.slice(0, 200),
      public_url: url,
      size_bytes: file.size,
      content_type: file.type || "application/octet-stream",
      source: "local",
    });

    return {
      id,
      url,
      name: file.name,
      size: file.size,
      contentType: file.type || "application/octet-stream",
      // 树莓派上的真实位置，方便直接去盘上找
      diskPath: `legacy-media/uploads/${objectPath}`,
    };
  });
