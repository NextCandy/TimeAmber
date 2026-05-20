import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { IObjectStorage, StorageListItem, StorageObject } from "../interfaces";

const metadataName = ".timeamber-meta.json";

export class FileSystemAdapter implements IObjectStorage {
  constructor(private readonly rootDir: string) {}

  private resolveKey(key: string): string {
    const normalized = path.normalize(key).replace(/^(\.\.[/\\])+/, "");
    const target = path.resolve(this.rootDir, normalized);
    if (!target.startsWith(path.resolve(this.rootDir))) {
      throw new Error("Invalid storage key");
    }
    return target;
  }

  private metadataPath(filePath: string): string {
    return `${filePath}${metadataName}`;
  }

  async put(
    key: string,
    data: ReadableStream | ArrayBuffer | string,
    options?: { contentType?: string; customMetadata?: Record<string, string> },
  ): Promise<void> {
    const filePath = this.resolveKey(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    let body: string | Buffer;
    if (typeof data === "string") {
      body = data;
    } else if (data instanceof ArrayBuffer) {
      body = Buffer.from(data);
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of Readable.fromWeb(data as never)) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      body = Buffer.concat(chunks);
    }
    await writeFile(filePath, body);
    await writeFile(this.metadataPath(filePath), JSON.stringify({
      contentType: options?.contentType || "application/octet-stream",
      customMetadata: options?.customMetadata || {},
      uploaded: new Date().toISOString(),
    }));
  }

  async get(key: string): Promise<StorageObject | null> {
    const filePath = this.resolveKey(key);
    try {
      const info = await stat(filePath);
      if (!info.isFile()) return null;
      let contentType = "application/octet-stream";
      try {
        const meta = JSON.parse(await readFile(this.metadataPath(filePath), "utf8"));
        if (typeof meta.contentType === "string") contentType = meta.contentType;
      } catch {}
      return {
        body: Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream,
        contentType,
        writeHeaders(headers: Headers) {
          headers.set("Content-Type", contentType);
          headers.set("Content-Length", String(info.size));
          headers.set("Cache-Control", "public, max-age=31536000, immutable");
        },
      };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolveKey(key);
    await rm(filePath, { force: true });
    await rm(this.metadataPath(filePath), { force: true });
  }

  async list(prefix: string, limit = 50): Promise<StorageListItem[]> {
    const baseDir = this.resolveKey(prefix);
    const items: StorageListItem[] = [];
    await this.walk(baseDir, prefix.replace(/\\/g, "/"), items, limit);
    return items;
  }

  private async walk(dir: string, prefix: string, items: StorageListItem[], limit: number): Promise<void> {
    if (items.length >= limit) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (items.length >= limit || entry.name.endsWith(metadataName)) continue;
      const fullPath = path.join(dir, entry.name);
      const key = `${prefix.replace(/\/?$/, "/")}${entry.name}`;
      if (entry.isDirectory()) {
        await this.walk(fullPath, key, items, limit);
      } else if (entry.isFile()) {
        const info = await stat(fullPath);
        items.push({ key, size: info.size, uploaded: info.mtime.toISOString() });
      }
    }
  }
}
