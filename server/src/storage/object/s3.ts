/* ──────────────────────────────────────────────
   S3 适配器 — S3 兼容对象存储实现
   支持：AWS S3 / Backblaze B2 / 阿里云 OSS / 腾讯云 COS
   通过 endpoint 参数区分不同厂商
   ────────────────────────────────────────────── */

import { AwsClient } from "aws4fetch";
import type { IObjectStorage, StorageObject, StorageListItem } from "../interfaces";

export type S3Config = {
  endpoint: string;      // 如 https://s3.us-west-002.backblazeb2.com
  region?: string;       // 默认 auto
  accessKey: string;
  secretKey: string;
  bucket: string;
  /** 公开访问 URL 前缀（可选，用于生成直链） */
  publicUrl?: string;
};

export class S3Adapter implements IObjectStorage {
  private client: AwsClient;
  private endpoint: string;
  private bucket: string;

  constructor(config: S3Config) {
    this.endpoint = config.endpoint.replace(/\/+$/, "");
    this.bucket = config.bucket;
    this.client = new AwsClient({
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
      region: config.region || "auto",
      service: "s3",
    });
  }

  private objectUrl(key: string): string {
    const keyPath = key.split("/").map(encodeURIComponent).join("/");
    return `${this.endpoint}/${encodeURIComponent(this.bucket)}/${keyPath}`;
  }

  private listUrl(prefix: string, limit: number): string {
    const url = new URL(`${this.endpoint}/${encodeURIComponent(this.bucket)}`);
    url.searchParams.set("list-type", "2");
    url.searchParams.set("prefix", prefix);
    url.searchParams.set("max-keys", String(limit));
    return url.toString();
  }

  async put(
    key: string,
    data: ReadableStream | ArrayBuffer | string,
    options?: { contentType?: string; customMetadata?: Record<string, string> }
  ): Promise<void> {
    // 将各种输入统一转为 Uint8Array
    let body: Uint8Array | string;
    if (typeof data === "string") {
      body = data;
    } else if (data instanceof ArrayBuffer) {
      body = new Uint8Array(data);
    } else {
      // ReadableStream → Uint8Array
      const reader = data.getReader();
      const chunks: Uint8Array[] = [];
      let done = false;
      while (!done) {
        const result = await reader.read();
        if (result.value) chunks.push(result.value);
        done = result.done;
      }
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      body = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
    }

    const headers = new Headers();
    if (options?.contentType) headers.set("Content-Type", options.contentType);
    for (const [name, value] of Object.entries(options?.customMetadata || {})) {
      headers.set(`x-amz-meta-${name}`, value);
    }

    const response = await this.client.fetch(this.objectUrl(key), {
      method: "PUT",
      headers,
      body,
    });

    if (!response.ok) {
      throw new Error(`S3 upload failed: ${response.status} ${response.statusText}`);
    }
  }

  async get(key: string): Promise<StorageObject | null> {
    const response = await this.client.fetch(this.objectUrl(key));

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`S3 download failed: ${response.status} ${response.statusText}`);
    }
    if (!response.body) return null;

    const contentType = response.headers.get("Content-Type") || "application/octet-stream";
    return {
      body: response.body,
      contentType,
      writeHeaders(headers: Headers) {
        headers.set("Content-Type", contentType);
        const contentLength = response.headers.get("Content-Length");
        if (contentLength) {
          headers.set("Content-Length", contentLength);
        }
        const etag = response.headers.get("ETag");
        if (etag) {
          headers.set("ETag", etag);
        }
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
      },
    };
  }

  async delete(key: string): Promise<void> {
    const response = await this.client.fetch(this.objectUrl(key), { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
      throw new Error(`S3 delete failed: ${response.status} ${response.statusText}`);
    }
  }

  async list(prefix: string, limit = 50): Promise<StorageListItem[]> {
    const response = await this.client.fetch(this.listUrl(prefix, limit));
    if (!response.ok) {
      throw new Error(`S3 list failed: ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    return parseListObjects(xml);
  }
}

function parseListObjects(xml: string): StorageListItem[] {
  const items: StorageListItem[] = [];
  const contentsPattern = /<Contents>([\s\S]*?)<\/Contents>/g;
  for (const match of xml.matchAll(contentsPattern)) {
    const block = match[1];
    items.push({
      key: decodeXml(readXmlTag(block, "Key")),
      size: Number(readXmlTag(block, "Size") || 0),
      uploaded: readXmlTag(block, "LastModified") || new Date().toISOString(),
    });
  }
  return items;
}

function readXmlTag(xml: string, tag: string): string {
  const openTag = `<${tag}>`;
  const closeTag = `</${tag}>`;
  const start = xml.indexOf(openTag);
  if (start === -1) return "";
  const contentStart = start + openTag.length;
  const end = xml.indexOf(closeTag, contentStart);
  return end === -1 ? "" : xml.slice(contentStart, end);
}

function decodeXml(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}
