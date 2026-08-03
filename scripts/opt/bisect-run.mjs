import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { median, parseArgs, REPORTS_ROOT, runProcess, safeFileName } from "./lib/common.mjs";

function metricParts(value) {
  const raw = String(value || "");
  if (raw.startsWith("visual:")) return { visual: raw.slice("visual:".length) };
  const parts = raw.split("/");
  return { page: parts.slice(0, -3).join("/"), viewport: parts.at(-3), scenario: parts.at(-2), metric: parts.at(-1) };
}

async function latestRaw(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const reports = entries.filter((entry) => entry.isDirectory()).toSorted((a, b) => b.name.localeCompare(a.name));
  for (const entry of reports) {
    try { return JSON.parse(await readFile(join(directory, entry.name, "raw.json"), "utf8")); } catch {}
  }
  return null;
}

async function main() {
  const args = parseArgs();
  const target = metricParts(args.metric);
  const threshold = Number(args.threshold);
  if (!args.metric || !Number.isFinite(threshold)) {
    console.error("用法：node scripts/opt/bisect-run.mjs --metric 首页/mobile/fast/LCP --threshold 2500");
    process.exitCode = 125;
    return;
  }
  const label = `bisect-${safeFileName(args.metric)}-${Date.now()}`;
  if (target.visual) {
    const [page, viewport] = target.visual.split("/");
    const command = process.platform === "win32" ? "npm.cmd" : "npm";
    const run = await runProcess(command, ["run", "opt:visual", "--", "--label", label, "--page", page, "--viewport", viewport, "--scenario", args.scenario || "fast"], { cwd: process.cwd(), timeoutMs: 180_000 });
    process.stdout.write(run.stdout);
    process.stderr.write(run.stderr);
    process.exitCode = run.code === 0 ? 0 : run.code === 1 ? 1 : 125;
    return;
  }
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const run = await runProcess(command, [
    "run", "opt:verify", "--", "--label", label, "--page", target.page, "--viewport", target.viewport, "--scenario", target.scenario, "--skip-image-http",
  ], { cwd: process.cwd(), timeoutMs: 300_000 });
  process.stdout.write(run.stdout);
  process.stderr.write(run.stderr);
  const raw = await latestRaw(join(process.cwd(), "reports", "opt"));
  const record = raw?.pageRecords?.find((item) => item.page === target.page && item.viewport === target.viewport && item.scenario === target.scenario);
  const actual = record?.metrics?.[target.metric];
  if (!Number.isFinite(Number(actual))) {
    console.error(`无法从 bisect 报告读取 ${args.metric}，视为环境/构建 skip。`);
    process.exitCode = 125;
    return;
  }
  const measured = median([Number(actual)]);
  console.log(JSON.stringify({ metric: args.metric, threshold, measured, values: [Number(actual)], status: measured > threshold ? "bad" : "good" }));
  process.exitCode = measured > threshold ? 1 : 0;
}

await main();

