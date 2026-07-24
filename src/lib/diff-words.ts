// LCS diff with multiple granularities (char/word, sentence, paragraph).
export type DiffPart = { type: "same" | "add" | "del"; text: string };
export type DiffMode = "word" | "sentence" | "paragraph";
export type DiffSummary = {
  added: number;
  removed: number;
  same: number;
  total: number;
};

function tokenizeWords(s: string): string[] {
  const out: string[] = [];
  const re = /[A-Za-z0-9]+|[\u4e00-\u9fff]|\s+|[^\sA-Za-z0-9\u4e00-\u9fff]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[0]);
  return out;
}

function tokenizeSentences(s: string): string[] {
  // 在中英文句末标点后保留分隔；保留分隔符在前一句末尾
  const out: string[] = [];
  const re = /[^。！？!?\.\n]+[。！？!?\.]?\n?|\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m[0]) out.push(m[0]);
  }
  return out.length ? out : [s];
}

function tokenizeParagraphs(s: string): string[] {
  const parts = s.split(/\n{2,}/);
  // 还原段落分隔
  const out: string[] = [];
  parts.forEach((p, i) => {
    out.push(p);
    if (i < parts.length - 1) out.push("\n\n");
  });
  return out;
}

function tokenize(s: string, mode: DiffMode): string[] {
  if (mode === "sentence") return tokenizeSentences(s);
  if (mode === "paragraph") return tokenizeParagraphs(s);
  return tokenizeWords(s);
}

export function diffParts(a: string, b: string, mode: DiffMode = "word"): DiffPart[] {
  const A = tokenize(a, mode);
  const B = tokenize(b, mode);
  const n = A.length;
  const m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      dp[i][j] = A[i - 1] === B[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const parts: DiffPart[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (A[i - 1] === B[j - 1]) {
      parts.unshift({ type: "same", text: A[i - 1] });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      parts.unshift({ type: "del", text: A[i - 1] });
      i--;
    } else {
      parts.unshift({ type: "add", text: B[j - 1] });
      j--;
    }
  }
  while (i > 0) parts.unshift({ type: "del", text: A[--i] });
  while (j > 0) parts.unshift({ type: "add", text: B[--j] });
  const merged: DiffPart[] = [];
  for (const p of parts) {
    const last = merged[merged.length - 1];
    if (last && last.type === p.type) last.text += p.text;
    else merged.push({ ...p });
  }
  return merged;
}

// Backward compat
export const diffWords = (a: string, b: string) => diffParts(a, b, "word");

export function summarize(parts: DiffPart[]): DiffSummary {
  let added = 0, removed = 0, same = 0;
  for (const p of parts) {
    const len = p.text.length;
    if (p.type === "add") added += len;
    else if (p.type === "del") removed += len;
    else same += len;
  }
  return { added, removed, same, total: added + removed + same };
}
