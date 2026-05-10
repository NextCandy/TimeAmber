/* ── AI 编辑路由 ─────────────────────────── */

import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { rewriteExternalImagesToSee } from "../utils/image";

type AIEditMode = "revise" | "seo" | "continue" | "custom";

type AIEditRequest = {
  provider: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  title: string;
  content: string;
  instruction: string;
  mode: AIEditMode;
};

function buildAIPrompt(req: AIEditRequest): string {
  const modeText: Record<AIEditMode, string> = {
    revise: "润色全文，保持原意、Markdown 结构和标题层级，提升表达清晰度。",
    seo: "进行 SEO 优化，补强摘要感、关键词覆盖、标题层级和可读性，但不要堆砌关键词。",
    continue: "在原文基础上自然续写，保持语气、结构和 Markdown 风格一致。",
    custom: req.instruction,
  };

  return [
    "你是 TimeAmber 博客的中文文章编辑助手。",
    "只返回修改后的 Markdown 正文，不要解释、不加代码围栏。",
    "保留已有图片、链接、代码块和 frontmatter 中的关键信息。",
    `文章标题：${req.title || "未命名"}`,
    `修改目标：${modeText[req.mode]}`,
    req.instruction && req.mode !== "custom" ? `补充要求：${req.instruction}` : "",
    "原文如下：",
    req.content,
  ].filter(Boolean).join("\n\n");
}

function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  return (value || fallback).replace(/\/+$/, "");
}

async function callOpenAICompatible(req: AIEditRequest, prompt: string): Promise<string> {
  const isDeepSeek = req.provider === "deepseek";
  const baseUrl = normalizeBaseUrl(req.baseUrl, isDeepSeek ? "https://api.deepseek.com" : "https://api.openai.com/v1");
  const model = req.model || (isDeepSeek ? "deepseek-chat" : "gpt-4o-mini");
  const endpoint = baseUrl.endsWith("/v1") ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        { role: "system", content: "你是严谨的中文 Markdown 编辑，只输出修改后的正文。" },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI API 请求失败 (${res.status})${text ? `: ${text.slice(0, 180)}` : ""}`);
  }

  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("AI 未返回可用内容");
  return content;
}

async function callGemini(req: AIEditRequest, prompt: string): Promise<string> {
  const model = req.model || "gemini-2.0-flash";
  const baseUrl = normalizeBaseUrl(req.baseUrl, "https://generativelanguage.googleapis.com/v1beta");
  const res = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(req.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4 },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini 请求失败 (${res.status})${text ? `: ${text.slice(0, 180)}` : ""}`);
  }

  const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!content) throw new Error("Gemini 未返回可用内容");
  return content;
}

export async function editMarkdownWithAI(req: AIEditRequest): Promise<string> {
  const prompt = buildAIPrompt(req);
  if (req.provider === "gemini") return callGemini(req, prompt);
  return callOpenAICompatible(req, prompt);
}

const ai = new Hono<{ Bindings: Bindings; Variables: Variables }>();

ai.post("/edit", async (c) => {
  const body = await c.req.json<{
    title?: string;
    content?: string;
    instruction?: string;
    mode?: "revise" | "seo" | "continue" | "custom";
  }>();
  const content = (body.content || "").trim();
  const mode = body.mode || "revise";
  const instruction = (body.instruction || "").trim();

  if (!content) return c.json({ error: "文章内容不能为空" }, 400);
  if (content.length > 80_000) return c.json({ error: "文章过长，请分段使用 AI 修改" }, 400);
  if (mode === "custom" && !instruction) return c.json({ error: "请填写修改要求" }, 400);

  const db = c.get("db");
  const settings = await db.getSettings();
  const provider = (settings.ai_provider || "deepseek").toLowerCase();
  const apiKey = (settings.ai_api_key || "").trim();
  if (!apiKey) return c.json({ error: "请先在后台设置中配置 AI API Key" }, 400);

  try {
    const result = await editMarkdownWithAI({
      provider,
      apiKey,
      model: settings.ai_model,
      baseUrl: settings.ai_base_url,
      title: body.title || "",
      content,
      instruction,
      mode,
    });
    return c.json({ content: result });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "AI 修改失败" }, 502);
  }
});

ai.post("/batch-optimize", async (c) => {
  const body = await c.req.json<{
    slugs?: string[];
    instruction?: string;
    mode?: AIEditMode;
  }>();
  const slugs = Array.from(new Set((body.slugs || []).map((slug) => String(slug).trim()).filter(Boolean)));
  const mode = body.mode || "seo";
  const instruction = (body.instruction || "").trim();

  if (slugs.length === 0) return c.json({ error: "请选择要优化的文章" }, 400);
  if (slugs.length > 5) return c.json({ error: "单次批量 AI 优化最多支持 5 篇文章，请分批执行" }, 400);
  if (mode === "custom" && !instruction) return c.json({ error: "请填写自定义优化要求" }, 400);

  const db = c.get("db");
  const settings = await db.getSettings();
  const provider = (settings.ai_provider || "deepseek").toLowerCase();
  const apiKey = (settings.ai_api_key || "").trim();
  if (!apiKey) return c.json({ error: "请先在后台设置中配置 AI API Key" }, 400);

  const results: {
    slug: string;
    title: string;
    status: "updated" | "skipped" | "failed";
    error?: string;
  }[] = [];
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const slug of slugs) {
    const post = await db.getPostBySlug(slug);
    if (!post) {
      failed++;
      results.push({ slug, title: slug, status: "failed", error: "文章不存在" });
      continue;
    }

    const content = (post.content || "").trim();
    if (!content) {
      skipped++;
      results.push({ slug, title: post.title, status: "skipped", error: "正文为空" });
      continue;
    }
    if (content.length > 80_000) {
      skipped++;
      results.push({ slug, title: post.title, status: "skipped", error: "正文过长，请进入编辑页单独优化" });
      continue;
    }

    try {
      const aiContent = await editMarkdownWithAI({
        provider,
        apiKey,
        model: settings.ai_model,
        baseUrl: settings.ai_base_url,
        title: post.title,
        content,
        instruction,
        mode,
      });
      const rewritten = await rewriteExternalImagesToSee(aiContent, settings);
      await db.createPostVersion(slug);
      await db.updatePost(slug, {
        content: rewritten.content,
        coverImage: "",
      });
      updated++;
      results.push({ slug, title: post.title, status: "updated" });
    } catch (err) {
      failed++;
      results.push({ slug, title: post.title, status: "failed", error: err instanceof Error ? err.message : "AI 优化失败" });
    }
  }

  return c.json({ success: failed === 0, updated, skipped, failed, posts: results }, failed === slugs.length ? 502 : 200);
});

export default ai;
