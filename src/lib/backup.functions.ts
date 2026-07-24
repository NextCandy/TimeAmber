import { createServerFn } from "@tanstack/react-start";
import { AwsClient } from "aws4fetch";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- WebDAV ----------

const webdavInput = z.object({
  url: z.string().url().max(1000),
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(500),
  filename: z.string().min(1).max(200).regex(/^[a-zA-Z0-9._-]+$/),
  body: z.string().max(10_000_000).optional(),
});

function webdavTarget(url: string, filename: string) {
  const base = url.endsWith("/") ? url : url + "/";
  return base + filename;
}

export const webdavUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof webdavInput>) => webdavInput.parse(d))
  .handler(async ({ data }) => {
    if (!data.body) throw new Error("缺少 body");
    const auth = "Basic " + btoa(`${data.username}:${data.password}`);
    const res = await fetch(webdavTarget(data.url, data.filename), {
      method: "PUT",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: data.body,
    });
    if (!res.ok) throw new Error(`WebDAV 上传失败 [${res.status}]: ${await res.text()}`);
    return { ok: true };
  });

export const webdavDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof webdavInput>) =>
    webdavInput.omit({ body: true }).parse(d),
  )
  .handler(async ({ data }) => {
    const auth = "Basic " + btoa(`${data.username}:${data.password}`);
    const res = await fetch(webdavTarget(data.url, data.filename), {
      method: "GET",
      headers: { Authorization: auth },
    });
    if (!res.ok) throw new Error(`WebDAV 下载失败 [${res.status}]`);
    return { body: await res.text() };
  });

// ---------- S3 ----------

const s3Input = z.object({
  endpoint: z.string().url().max(1000),
  region: z.string().min(1).max(50),
  bucket: z.string().min(1).max(63).regex(/^[a-z0-9.-]+$/),
  accessKeyId: z.string().min(1).max(200),
  secretAccessKey: z.string().min(1).max(500),
  key: z.string().min(1).max(300),
  body: z.string().max(10_000_000).optional(),
});

function s3Url(endpoint: string, bucket: string, key: string) {
  const base = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
  return `${base}/${bucket}/${encodeURIComponent(key)}`;
}

export const s3Upload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof s3Input>) => s3Input.parse(d))
  .handler(async ({ data }) => {
    if (!data.body) throw new Error("缺少 body");
    const client = new AwsClient({
      accessKeyId: data.accessKeyId,
      secretAccessKey: data.secretAccessKey,
      service: "s3",
      region: data.region,
    });
    const res = await client.fetch(s3Url(data.endpoint, data.bucket, data.key), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: data.body,
    });
    if (!res.ok) throw new Error(`S3 上传失败 [${res.status}]: ${await res.text()}`);
    return { ok: true };
  });

export const s3Download = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof s3Input>) => s3Input.omit({ body: true }).parse(d))
  .handler(async ({ data }) => {
    const client = new AwsClient({
      accessKeyId: data.accessKeyId,
      secretAccessKey: data.secretAccessKey,
      service: "s3",
      region: data.region,
    });
    const res = await client.fetch(s3Url(data.endpoint, data.bucket, data.key), {
      method: "GET",
    });
    if (!res.ok) throw new Error(`S3 下载失败 [${res.status}]`);
    return { body: await res.text() };
  });

// ---------- Dropbox ----------

const dropboxInput = z.object({
  token: z.string().min(10).max(2000),
  path: z.string().min(1).max(400).regex(/^\/[\w\-./]+$/, "路径需以 / 开头"),
  body: z.string().max(10_000_000).optional(),
});

export const dropboxUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof dropboxInput>) => dropboxInput.parse(d))
  .handler(async ({ data }) => {
    if (!data.body) throw new Error("缺少 body");
    const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.token}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          path: data.path,
          mode: "overwrite",
          autorename: false,
          mute: true,
        }),
      },
      body: data.body,
    });
    if (!res.ok) throw new Error(`Dropbox 上传失败 [${res.status}]: ${await res.text()}`);
    return { ok: true };
  });

export const dropboxDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof dropboxInput>) =>
    dropboxInput.omit({ body: true }).parse(d),
  )
  .handler(async ({ data }) => {
    const res = await fetch("https://content.dropboxapi.com/2/files/download", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.token}`,
        "Dropbox-API-Arg": JSON.stringify({ path: data.path }),
      },
    });
    if (!res.ok) throw new Error(`Dropbox 下载失败 [${res.status}]: ${await res.text()}`);
    return { body: await res.text() };
  });

// ---------- OneDrive (Microsoft Graph) ----------

const onedriveInput = z.object({
  token: z.string().min(10).max(4000),
  path: z.string().min(1).max(400).regex(/^[\w\-./]+$/, "路径不能以 / 开头，使用相对路径"),
  body: z.string().max(10_000_000).optional(),
});

function onedriveUrl(path: string) {
  return `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURI(path)}:/content`;
}

export const onedriveUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof onedriveInput>) => onedriveInput.parse(d))
  .handler(async ({ data }) => {
    if (!data.body) throw new Error("缺少 body");
    const res = await fetch(onedriveUrl(data.path), {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${data.token}`,
        "Content-Type": "application/json",
      },
      body: data.body,
    });
    if (!res.ok) throw new Error(`OneDrive 上传失败 [${res.status}]: ${await res.text()}`);
    return { ok: true };
  });

export const onedriveDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof onedriveInput>) =>
    onedriveInput.omit({ body: true }).parse(d),
  )
  .handler(async ({ data }) => {
    const res = await fetch(onedriveUrl(data.path), {
      method: "GET",
      headers: { Authorization: `Bearer ${data.token}` },
    });
    if (!res.ok) throw new Error(`OneDrive 下载失败 [${res.status}]`);
    return { body: await res.text() };
  });

// ---------- Google Drive ----------

const gdriveInput = z.object({
  token: z.string().min(10).max(4000),
  filename: z.string().min(1).max(200).regex(/^[a-zA-Z0-9._-]+$/),
  body: z.string().max(10_000_000).optional(),
});

async function gdriveFindId(token: string, filename: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${filename.replace(/'/g, "\\'")}' and trashed=false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&pageSize=1&fields=files(id,name,modifiedTime)`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`GoogleDrive 查找失败 [${res.status}]: ${await res.text()}`);
  const j = (await res.json()) as { files: Array<{ id: string }> };
  return j.files?.[0]?.id ?? null;
}

export const gdriveUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof gdriveInput>) => gdriveInput.parse(d))
  .handler(async ({ data }) => {
    if (!data.body) throw new Error("缺少 body");
    const existingId = await gdriveFindId(data.token, data.filename);
    const boundary = "lovable_" + Math.random().toString(36).slice(2);
    const metadata = existingId ? {} : { name: data.filename };
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
      data.body +
      `\r\n--${boundary}--`;
    const url = existingId
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
    const res = await fetch(url, {
      method: existingId ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${data.token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    if (!res.ok) throw new Error(`GoogleDrive 上传失败 [${res.status}]: ${await res.text()}`);
    return { ok: true };
  });

export const gdriveDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof gdriveInput>) =>
    gdriveInput.omit({ body: true }).parse(d),
  )
  .handler(async ({ data }) => {
    const id = await gdriveFindId(data.token, data.filename);
    if (!id) throw new Error(`GoogleDrive 上找不到文件: ${data.filename}`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
      { headers: { Authorization: `Bearer ${data.token}` } },
    );
    if (!res.ok) throw new Error(`GoogleDrive 下载失败 [${res.status}]`);
    return { body: await res.text() };
  });

// ---------- Notion (incremental sync) ----------

const notionInput = z.object({
  token: z.string().min(10).max(500),
  databaseId: z.string().min(10).max(100),
});

const notionPageInput = z.object({
  token: z.string().min(10).max(500),
  pageId: z.string().min(10).max(100),
});

function richText(arr: Array<{ plain_text?: string }> = []): string {
  return arr.map((x) => x.plain_text ?? "").join("");
}

function blockToMarkdown(block: Record<string, unknown>): string {
  const type = block.type as string;
  const data = (block as Record<string, { rich_text?: Array<{ plain_text?: string }> }>)[type];
  const text = richText(data?.rich_text);
  switch (type) {
    case "heading_1": return `# ${text}`;
    case "heading_2": return `## ${text}`;
    case "heading_3": return `### ${text}`;
    case "bulleted_list_item":
    case "numbered_list_item": return `- ${text}`;
    case "quote": return `> ${text}`;
    case "code": return "```\n" + text + "\n```";
    case "paragraph":
    default: return text;
  }
}

export type NotionListItem = {
  id: string;
  title: string;
  lastEditedTime: string;
  createdTime: string;
};

export const notionList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof notionInput>) => notionInput.parse(d))
  .handler(async ({ data }): Promise<{ items: NotionListItem[] }> => {
    const headers = {
      Authorization: `Bearer ${data.token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    };
    const items: NotionListItem[] = [];
    let cursor: string | undefined;
    for (let safety = 0; safety < 20; safety++) {
      const body: Record<string, unknown> = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      const r = await fetch(
        `https://api.notion.com/v1/databases/${encodeURIComponent(data.databaseId)}/query`,
        { method: "POST", headers, body: JSON.stringify(body) },
      );
      if (!r.ok) throw new Error(`Notion 查询失败 [${r.status}]: ${await r.text()}`);
      const j = (await r.json()) as {
        results: Array<Record<string, unknown>>;
        has_more?: boolean;
        next_cursor?: string;
      };
      for (const page of j.results) {
        const props = (page as { properties?: Record<string, unknown> }).properties ?? {};
        let title = "";
        for (const v of Object.values(props)) {
          const p = v as { type?: string; title?: Array<{ plain_text?: string }> };
          if (p?.type === "title" && p.title) {
            title = richText(p.title);
            break;
          }
        }
        items.push({
          id: page.id as string,
          title: title || "Untitled",
          lastEditedTime: (page.last_edited_time as string) ?? new Date().toISOString(),
          createdTime: (page.created_time as string) ?? new Date().toISOString(),
        });
      }
      if (!j.has_more || !j.next_cursor) break;
      cursor = j.next_cursor;
    }
    return { items };
  });

export const notionFetchPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof notionPageInput>) => notionPageInput.parse(d))
  .handler(async ({ data }) => {
    const headers = {
      Authorization: `Bearer ${data.token}`,
      "Notion-Version": "2022-06-28",
    };
    const r = await fetch(
      `https://api.notion.com/v1/blocks/${encodeURIComponent(data.pageId)}/children?page_size=100`,
      { headers },
    );
    if (!r.ok) throw new Error(`Notion 内容获取失败 [${r.status}]: ${await r.text()}`);
    const j = (await r.json()) as { results: Array<Record<string, unknown>> };
    const content = j.results.map(blockToMarkdown).filter(Boolean).join("\n\n");
    return { content };
  });
