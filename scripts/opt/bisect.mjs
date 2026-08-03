import { join } from "node:path";

import {
  PROJECT_ROOT,
  REPORTS_ROOT,
  createReportDirectory,
  ensureDir,
  gitValue,
  nowIso,
  parseArgs,
  runProcess,
  toCsv,
  writeJson,
  writeText,
} from "./lib/common.mjs";

function splitRange(value) {
  const parts = String(value || "").split("..");
  return { start: parts[0] || "", end: parts[1] || "HEAD" };
}

async function runCandidate(cwd, args, commit) {
  const custom = process.env.OPT_BISECT_TEST_COMMAND;
  if (custom) {
    const shell = process.platform === "win32" ? "cmd.exe" : "bash";
    const shellArgs = process.platform === "win32" ? ["/d", "/s", "/c", custom] : ["-lc", custom];
    const result = await runProcess(shell, shellArgs, { cwd, timeoutMs: 300_000, env: { OPT_BISECT_COMMIT: commit } });
    return { code: result.code, stdout: result.stdout, stderr: result.stderr, source: "OPT_BISECT_TEST_COMMAND" };
  }
  const result = await runProcess(process.execPath, ["scripts/opt/bisect-run.mjs", "--metric", String(args.metric), "--threshold", String(args.threshold)], { cwd, timeoutMs: 360_000 });
  return { code: result.code, stdout: result.stdout, stderr: result.stderr, source: "bisect-run.mjs" };
}

async function main() {
  const args = parseArgs();
  const range = splitRange(args.range || "last-passing..HEAD");
  if (!args.metric || args.threshold === undefined || !range.start) {
    console.error("用法：npm run opt:bisect -- --metric 首页/mobile/fast/LCP --threshold 2500 --range <good>..<bad>");
    process.exitCode = 1;
    return;
  }
  const commitsText = gitValue(["rev-list", "--ancestry-path", "--reverse", `${range.start}..${range.end}`], PROJECT_ROOT);
  let commits = commitsText.split(/\r?\n/).filter(Boolean);
  if (commits.length > 32) {
    const touched = gitValue(["diff", "--name-only", `${range.start}..${range.end}`], PROJECT_ROOT).split(/\r?\n/).filter(Boolean);
    const candidates = commits.filter((commit) => {
      const files = gitValue(["diff-tree", "--no-commit-id", "--name-only", "-r", commit], PROJECT_ROOT).split(/\r?\n/);
      return files.some((file) => touched.includes(file));
    });
    if (candidates.length >= 2) commits = candidates;
  }
  const maxSteps = Number(args["max-steps"] || 6);
  const reportDir = await createReportDirectory("bisect", REPORTS_ROOT);
  const worktree = join(PROJECT_ROOT, ".opt-bisect", String(Date.now()));
  const steps = [];
  let worktreeReady = false;
  try {
    await ensureDir(join(PROJECT_ROOT, ".opt-bisect"));
    const added = await runProcess("git", ["worktree", "add", "--detach", worktree, range.end], { cwd: PROJECT_ROOT, timeoutMs: 60_000 });
    if (added.code !== 0) throw new Error(added.stderr || "无法创建 bisect worktree");
    worktreeReady = true;
    const install = await runProcess(process.platform === "win32" ? "npm.cmd" : "npm", ["ci", "--no-audit", "--no-fund"], { cwd: worktree, timeoutMs: 300_000 });
    if (install.code !== 0) throw new Error(`依赖安装失败：${install.stderr.slice(-2000)}`);
    let low = -1;
    let high = commits.length - 1;
    let step = 0;
    while (high - low > 1 && step < maxSteps) {
      const index = Math.floor((low + high) / 2);
      const commit = commits[index];
      const checkout = await runProcess("git", ["-C", worktree, "checkout", "--detach", commit], { cwd: PROJECT_ROOT, timeoutMs: 60_000 });
      if (checkout.code !== 0) {
        steps.push({ step: step + 1, commit, status: "skip", reason: checkout.stderr });
        step += 1;
        continue;
      }
      const build = await runProcess(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], { cwd: worktree, timeoutMs: 300_000 });
      if (build.code !== 0) {
        steps.push({ step: step + 1, commit, status: "skip", reason: `build 失败：${build.stderr.slice(-1000)}` });
        step += 1;
        continue;
      }
      const tested = await runCandidate(worktree, args, commit);
      const status = tested.code === 0 ? "good" : tested.code === 1 ? "bad" : "skip";
      steps.push({ step: step + 1, commit, status, stdout: tested.stdout.slice(-1500), stderr: tested.stderr.slice(-1500) });
      if (status === "good") low = index;
      if (status === "bad") high = index;
      step += 1;
    }
    const firstBad = commits[high] || "unknown";
    const resultData = {
      generatedAt: nowIso(),
      range,
      metric: args.metric,
      threshold: Number(args.threshold),
      candidates: commits,
      maxSteps,
      status: high < commits.length && steps.some((item) => item.status === "bad") ? "PASS" : "INDETERMINATE",
      firstBad,
      steps,
    };
    await writeJson(join(reportDir, "raw.json"), resultData);
    await writeText(join(reportDir, "steps.csv"), toCsv(steps, ["step", "commit", "status", "reason", "stdout", "stderr"]));
    await writeText(join(reportDir, "bisect-log.txt"), steps.map((item) => `${item.step}\t${item.commit}\t${item.status}`).join("\n"));
    const metricParts = String(args.metric).split("/");
    await writeText(join(reportDir, "repro.sh"), `#!/usr/bin/env bash\nset -euo pipefail\ngit show ${firstBad}\nnpm run opt:verify -- --page "${metricParts.slice(0, -3).join("/")}" --viewport "${metricParts.at(-3)}" --scenario "${metricParts.at(-2)}"\n`);
    await writeText(join(reportDir, "result.md"), [
      "# Git bisect 定位报告",
      "",
      `- 指标：${args.metric}`,
      `- 阈值：${args.threshold}`,
      `- 范围：${range.start}..${range.end}`,
      `- 首个疑似坏提交：${firstBad}`,
      `- 结论：${resultData.status}`,
      "",
      "证据不足时保留 `INDETERMINATE`，不把多提交叠加编造成单一元凶。",
      "",
      "| 步骤 | Commit | 判定 |",
      "| ---: | --- | --- |",
      ...steps.map((item) => `| ${item.step} | ${item.commit} | ${item.status} |`),
      "",
    ].join("\n"));
    console.log(JSON.stringify({ reportDir, ...resultData }, null, 2));
  } finally {
    if (worktreeReady) await runProcess("git", ["worktree", "remove", "--force", worktree], { cwd: PROJECT_ROOT, timeoutMs: 60_000 });
  }
}

await main();

