export type KnowledgeSourceType = "blog" | "notion" | "web_archive";

export type AskSource = {
  id: string;
  title: string;
  sourceType: KnowledgeSourceType;
  summary: string;
  date?: string;
  internalUrl?: string;
  originalUrl?: string;
};

const QUERY_SCAFFOLDING = [
  "相关文章和收藏",
  "文章和收藏",
  "我以前是怎么",
  "我以前保存过",
  "我过去关于",
  "我收藏的",
  "我保存的",
  "以前保存过",
  "以前收藏过",
  "帮我找出",
  "帮我查找",
  "有哪些",
  "是什么",
  "是怎么",
  "怎么样",
  "为什么",
  "如何",
  "哪些",
  "什么",
  "怎么",
  "总结",
  "归纳",
  "找出",
  "查找",
  "搜索",
  "关于",
  "相关的",
  "相关",
  "内容",
  "资料",
  "记录",
  "笔记",
  "文章",
  "收藏",
  "以前",
  "过去",
  "曾经",
  "保存过",
  "收藏过",
  "请",
  "帮我",
  "告诉我",
  "我的",
  "我",
  "的",
  "和",
];

const ENGLISH_STOP_WORDS = new Set([
  "about",
  "and",
  "articles",
  "find",
  "from",
  "how",
  "saved",
  "show",
  "summarize",
  "the",
  "what",
  "with",
]);

function uniqueTerms(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const term = value.trim().toLowerCase();
    if (term.length < 2 || seen.has(term)) continue;
    seen.add(term);
    result.push(term);
    if (result.length >= 12) break;
  }
  return result;
}

export function buildSearchTerms(question: string): string[] {
  const normalized = question.normalize("NFKC").toLowerCase().trim();
  const latin = (normalized.match(/[a-z0-9][a-z0-9._+/-]{1,79}/g) ?? []).filter(
    (term) => !ENGLISH_STOP_WORDS.has(term),
  );

  let semanticText = normalized.replace(/[a-z0-9][a-z0-9._+/-]*/g, " ");
  for (const phrase of QUERY_SCAFFOLDING) {
    semanticText = semanticText.split(phrase).join(" ");
  }
  const han = semanticText.match(/[\p{Script=Han}]{2,40}/gu) ?? [];
  const terms = uniqueTerms([...latin, ...han]);
  if (terms.length > 0) return terms;

  return uniqueTerms([...(normalized.match(/[\p{Script=Han}]{2,40}/gu) ?? []), ...latin]);
}

export function cleanKnowledgeText(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/```[^\n]*\n?/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function selectEvidence(body: string, terms: string[], maxChars = 3200): string {
  const text = cleanKnowledgeText(body);
  if (text.length <= maxChars) return text;

  const paragraphs = text
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const normalizedTerms = uniqueTerms(terms);
  const scored = paragraphs.map((paragraph, index) => {
    const lower = paragraph.toLowerCase();
    const score = normalizedTerms.reduce(
      (total, term) => total + (lower.includes(term) ? Math.min(term.length, 12) : 0),
      index === 0 ? 0.1 : 0,
    );
    return { index, paragraph, score };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  const selected: Array<{ index: number; paragraph: string }> = [];
  let length = 0;
  for (const item of scored) {
    if (selected.length > 0 && item.score <= 0) break;
    const remaining = maxChars - length;
    if (remaining <= 0) break;
    selected.push({
      index: item.index,
      paragraph: item.paragraph.slice(0, remaining),
    });
    length += Math.min(item.paragraph.length, remaining) + 2;
  }

  if (selected.length === 0) return text.slice(0, maxChars);
  return selected
    .sort((a, b) => a.index - b.index)
    .map((item) => item.paragraph)
    .join("\n\n")
    .slice(0, maxChars);
}

export function safeKnowledgeUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  const containsControlCharacter = [...trimmed].some((character) => character.charCodeAt(0) < 32);
  if (containsControlCharacter) return undefined;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function sanitizeAIAnswer(value: string, sourceCount: number): string {
  return value
    .trim()
    .slice(0, 12_000)
    .replace(/\[S(\d+)\]/gi, (citation, rawIndex) => {
      const index = Number(rawIndex);
      return index >= 1 && index <= sourceCount ? `[S${index}]` : "";
    })
    .trim();
}
