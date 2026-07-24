import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildSearchTerms,
  cleanKnowledgeText,
  safeKnowledgeUrl,
  sanitizeAIAnswer,
  selectEvidence,
  type AskSource,
  type KnowledgeSourceType,
} from "@/lib/ask-core";

type RpcResult = {
  data: unknown;
  error: { message?: string } | null;
};

type RpcClient = {
  rpc: (name: string, params?: Record<string, unknown>) => PromiseLike<RpcResult>;
};

type KnowledgeStatusRow = {
  total?: number | string;
  blog?: number | string;
  notion?: number | string;
  web_archive?: number | string;
  archive_pending?: number | string;
};

type KnowledgeRow = {
  post_id?: number | string;
  source_type?: string;
  title?: string;
  excerpt?: string;
  body?: string;
  category?: string;
  internal_url?: string | null;
  original_url?: string | null;
  source_created_at?: string | null;
  score?: number | string;
  matched_terms?: string[] | null;
};

export type AskTimeAmberStatus = {
  provider: {
    configured: boolean;
    model?: string;
    endpointHost?: string;
    missing: string[];
  };
  index: {
    ready: boolean;
    total: number;
    blog: number;
    notion: number;
    webArchive: number;
    archivePending: number;
  };
};

export type AskTimeAmberResult = {
  answer: string;
  sources: AskSource[];
  noResults: boolean;
};

const askInput = z.object({
  question: z.string().trim().min(2).max(1000),
});

const requestWindows = new Map<string, number[]>();

function assertRateLimit(userId: string) {
  const now = Date.now();
  const recent = (requestWindows.get(userId) ?? []).filter((at) => now - at < 60_000);
  if (recent.length >= 12) throw new Error("请求过于频繁，请稍后再试");
  recent.push(now);
  requestWindows.set(userId, recent);
}

function rpcClient(value: unknown): RpcClient {
  return value as RpcClient;
}

async function assertAdmin(value: unknown): Promise<void> {
  const result = await rpcClient(value).rpc("is_admin");
  if (result.error || result.data !== true) throw new Error("Administrator access required");
}

function numberValue(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function sourceType(value: unknown): KnowledgeSourceType {
  if (value === "notion" || value === "web_archive") return value;
  return "blog";
}

function xmlEscape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character] ?? character,
  );
}

function noResultsAnswer(): AskTimeAmberResult {
  return {
    answer:
      "没有在现有 TimeAmber 内容中找到足够相关的资料。可以尝试使用更具体的产品名、域名、项目名或技术关键词。",
    sources: [],
    noResults: true,
  };
}

export const getAskTimeAmberStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AskTimeAmberStatus> => {
    await assertAdmin(context.supabase);
    const providerPromise = import("@/lib/ask-provider.server").then(({ getAIProviderStatus }) =>
      getAIProviderStatus(),
    );
    const indexPromise = rpcClient(context.supabase).rpc("get_timeamber_knowledge_status");
    const [provider, indexResult] = await Promise.all([providerPromise, indexPromise]);
    if (indexResult.error) {
      return {
        provider,
        index: {
          ready: false,
          total: 0,
          blog: 0,
          notion: 0,
          webArchive: 0,
          archivePending: 0,
        },
      };
    }

    const row = (Array.isArray(indexResult.data) ? indexResult.data[0] : null) as
      | KnowledgeStatusRow
      | undefined;
    return {
      provider,
      index: {
        ready: true,
        total: numberValue(row?.total),
        blog: numberValue(row?.blog),
        notion: numberValue(row?.notion),
        webArchive: numberValue(row?.web_archive),
        archivePending: numberValue(row?.archive_pending),
      },
    };
  });

export const askTimeAmber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: z.infer<typeof askInput>) => askInput.parse(value))
  .handler(async ({ data, context }): Promise<AskTimeAmberResult> => {
    await assertAdmin(context.supabase);
    assertRateLimit(context.userId);
    const providerModule = await import("@/lib/ask-provider.server");
    const provider = providerModule.getAIProviderStatus();
    if (!provider.configured) throw new Error("AI Provider 尚未配置");

    const terms = buildSearchTerms(data.question);
    const search = await rpcClient(context.supabase).rpc("search_timeamber_knowledge", {
      query_text: data.question,
      query_terms: terms,
      result_limit: 10,
    });
    if (search.error) throw new Error("知识索引暂时不可用，请稍后再试");

    const rows = (Array.isArray(search.data) ? search.data : []) as KnowledgeRow[];
    const credibleRows = rows.filter((row) => numberValue(row.score) >= 0.35).slice(0, 8);
    if (credibleRows.length === 0) return noResultsAnswer();

    const sources: AskSource[] = [];
    const evidenceParts: string[] = [];
    for (const [index, row] of credibleRows.entries()) {
      const id = `S${index + 1}`;
      const title = String(row.title ?? "未命名内容")
        .trim()
        .slice(0, 300);
      const excerpt = cleanKnowledgeText(String(row.excerpt ?? ""));
      const matchedTerms = Array.isArray(row.matched_terms) ? row.matched_terms.map(String) : terms;
      const evidence = selectEvidence(String(row.body ?? ""), matchedTerms, 3200);
      const summary = (excerpt || evidence).slice(0, 280);
      sources.push({
        id,
        title,
        sourceType: sourceType(row.source_type),
        summary,
        date: row.source_created_at ? String(row.source_created_at) : undefined,
        internalUrl: safeKnowledgeUrl(row.internal_url),
        originalUrl: safeKnowledgeUrl(row.original_url),
      });
      evidenceParts.push(
        [
          `<source id="${id}" type="${sourceType(row.source_type)}">`,
          `<title>${xmlEscape(title)}</title>`,
          `<category>${xmlEscape(String(row.category ?? ""))}</category>`,
          `<excerpt>${xmlEscape(excerpt)}</excerpt>`,
          `<content>${xmlEscape(evidence)}</content>`,
          "</source>",
        ].join("\n"),
      );
    }

    const rawAnswer = await providerModule.completeAskTimeAmber({
      question: data.question,
      evidence: evidenceParts.join("\n\n"),
    });
    const answer = sanitizeAIAnswer(rawAnswer, sources.length);
    if (!answer) throw new Error("AI 服务没有返回有效回答");
    return { answer, sources, noResults: false };
  });
