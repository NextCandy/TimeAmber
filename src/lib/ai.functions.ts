import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// 通用 OpenAI-Compatible Chat Completions 代理
// 默认指向 DeepSeek (https://api.deepseek.com/v1/chat/completions, model: deepseek-chat)

const input = z.object({
  endpoint: z.string().url().max(500),
  apiKey: z.string().min(1).max(500),
  model: z.string().min(1).max(120),
  system: z.string().max(4000).optional(),
  prompt: z.string().min(1).max(20_000),
  temperature: z.number().min(0).max(2).optional(),
});

export const aiComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof input>) => input.parse(d))
  .handler(async ({ data }) => {
    const messages: Array<{ role: string; content: string }> = [];
    if (data.system) messages.push({ role: "system", content: data.system });
    messages.push({ role: "user", content: data.prompt });

    const res = await fetch(data.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.apiKey}`,
      },
      body: JSON.stringify({
        model: data.model,
        messages,
        temperature: data.temperature ?? 0.7,
        stream: false,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`AI 请求失败 [${res.status}]: ${text.slice(0, 400)}`);
    }
    let json: {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`AI 返回非法响应：${text.slice(0, 200)}`);
    }
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error(json.error?.message ?? "AI 未返回内容");
    return { content };
  });
