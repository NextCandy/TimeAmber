import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { REPORTS_ROOT, parseArgs, readJson, redactUrl, safeFileName, writeJson, writeText } from "./lib/common.mjs";

const LAYERS = [
  { name: "contract", label: "契约/可用性", test: /HTTP|sitemap|robots|canonical|JSON-LD|schema|路由未覆盖|页面主体为空/i },
  { name: "runtime", label: "浏览器/运行时", test: /Chromium|Lighthouse|browser|pageerror|控制台|超时|导航|未生效/i },
  { name: "asset-seo", label: "资源/SEO", test: /图片|image|alt|宽高|现代图片|资源|JSON-LD|canonical|sitemap/i },
  { name: "budget", label: "预算/回归", test: /budget|预算|LCP|CLS|TBT|firstScreen|totalKB|requests|imageShare|突变/i },
];

function classify(item) {
  const text = `${item.scope || ""} ${item.reason || item.message || ""} ${item.metric || ""}`;
  return LAYERS.find((layer) => layer.test.test(text)) || LAYERS[1];
}

function safeFailure(item) {
  return {
    ...item,
    reason: String(item.reason || item.message || "未通过").replace(/https?:\/\/[^\s"'<>]+/gi, (match) => redactUrl(match)),
    layer: classify(item).name,
    layerLabel: classify(item).label,
  };
}

async function main() {
  const args = parseArgs();
  const input = String(args.input || "");
  if (!input) throw new Error("用法：node scripts/opt/failure-annotate.mjs --input reports/opt/<report>/raw.json");
  const raw = await readJson(input, null);
  if (!raw) throw new Error(`无法读取验证原始数据：${input}`);
  const failures = (raw.failures || []).map(safeFailure);
  const counts = Object.fromEntries(LAYERS.map((layer) => [layer.name, failures.filter((item) => item.layer === layer.name).length]));
  const output = { generatedAt: new Date().toISOString(), reportId: raw.reportId || basename(input), counts, failures };
  const outputPath = String(args.output || join(REPORTS_ROOT, "history", `failure-attribution-${safeFileName(raw.reportId || basename(input))}.json`));
  await writeJson(outputPath, output);
  const annotations = failures.map((failure) => `::error title=${failure.layerLabel}::${failure.scope || "验证项"}：${failure.reason}`);
  const summary = [
    "# 优化验证失败归因",
    "",
    `- 报告：${raw.reportId || basename(input)}`,
    "- 归因层级：契约/可用性 → 浏览器/运行时 → 资源/SEO → 预算/回归",
    "",
    "| 层级 | 数量 |",
    "| --- | ---: |",
    ...LAYERS.map((layer) => `| ${layer.label} | ${counts[layer.name]} |`),
    "",
    "## 失败项",
    "",
    ...(failures.length ? failures.map((failure) => `- **${failure.layerLabel}** [${failure.scope || "验证项"}]：${failure.reason}`) : ["- 无失败项。"]),
    "",
  ].join("\n");
  const reportPath = String(args.report || outputPath.replace(/\.json$/i, ".md"));
  await writeText(reportPath, summary);
  for (const annotation of annotations) console.log(annotation);
  console.log(JSON.stringify({ status: failures.length ? "FAIL" : "PASS", output: outputPath, report: reportPath, counts }, null, 2));
  if (failures.length) process.exitCode = 1;
}

await main();
