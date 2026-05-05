#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const args = process.argv.slice(2);
const apiBaseArg = args.find((arg) => arg.startsWith("--api-base="))?.slice("--api-base=".length);
const distArg = args.find((arg) => arg.startsWith("--dist="))?.slice("--dist=".length);
const apiBase = (apiBaseArg || process.env.API_BASE || process.env.VITE_API_URL || "").replace(/\/+$/, "");
const distDir = distArg || "client/dist";

if (!apiBase) {
  console.warn("[warn] 跳过首页静态快照：缺少 API_BASE。");
  process.exit(0);
}

async function fetchJson(path) {
  const res = await fetch(`${apiBase}${path}`, {
    headers: { "User-Agent": "timeamber-home-snapshot" },
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

function escapeInlineJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const snapshot = {
  generatedAt: new Date().toISOString(),
  posts: await fetchJson("/api/posts?limit=80"),
  categories: await fetchJson("/api/categories"),
  settings: await fetchJson("/api/settings/public"),
  traffic: await fetchJson("/api/stats/traffic"),
};

await mkdir(join(distDir, "__timeamber"), { recursive: true });
await writeFile(join(distDir, "__timeamber", "home-snapshot.json"), JSON.stringify(snapshot), "utf8");

const indexPath = join(distDir, "index.html");
const indexHtml = await readFile(indexPath, "utf8");
const marker = "<script type=\"module\" src=\"/src/main.tsx\"></script>";
const snapshotScript = `<script>window.__TIMEAMBER_HOME_SNAPSHOT__=${escapeInlineJson(snapshot)};</script>`;
const nextHtml = indexHtml.includes(marker)
  ? indexHtml.replace(marker, `${snapshotScript}\n    ${marker}`)
  : indexHtml.replace("</body>", `    ${snapshotScript}\n  </body>`);

await writeFile(indexPath, nextHtml, "utf8");
console.log(`[ok] 首页静态快照已写入：${snapshot.posts.length} 篇文章。`);
