import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { renderMarkdown } from "@/lib/markdown.server";

const renderInput = z.object({ md: z.string() });

// 把一段 Markdown 在服务端渲染成安全 HTML（含语法高亮）。
// 正文可能较大，用 POST 传输，避免 GET 的 URL 长度限制。
export const renderMarkdownFn = createServerFn({ method: "POST" })
  .inputValidator((value: z.infer<typeof renderInput>) => renderInput.parse(value))
  .handler(async ({ data }): Promise<string> => renderMarkdown(data.md));
