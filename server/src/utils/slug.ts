import type { IDatabase } from "../storage/interfaces";

/** 标准化 slug（英文小写、连字符、中文转编码） */
export function normalizeSlug(input: string): string {
  return (input || "")
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "")
    .replace(/[\u4e00-\u9fa5]+/g, (m) => m.split("").map((char) => char.charCodeAt(0).toString(36)).join(""))
    .replace(/--+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || `post-${Date.now().toString(36)}`;
}

/** 生成唯一 slug（避免与已有文章冲突） */
export async function uniqueSlug(db: IDatabase, baseSlug: string, reserved: Set<string>): Promise<string> {
  const base = normalizeSlug(baseSlug);
  let next = base;
  let index = 2;
  while (reserved.has(next) || await db.getPostBySlug(next)) {
    next = `${base}-${index}`;
    index++;
  }
  reserved.add(next);
  return next;
}
