import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  PROJECT_ROOT,
  REPORTS_ROOT,
  createReportDirectory,
  fileExists,
  gitMetadata,
  parseArgs,
  runProcess,
  writeJson,
  writeText,
} from "./lib/common.mjs";

async function main() {
  const args = parseArgs();
  const input = String(args.report || args._[0] || "");
  if (!input) {
    console.error("用法：npm run opt:repro -- --report reports/opt/<label-time> [--only 首页/mobile/fast]");
    process.exitCode = 1;
    return;
  }
  const reportDir = resolve(PROJECT_ROOT, input);
  const envFile = join(reportDir, "env.json");
  const rawFile = join(reportDir, "raw.json");
  if (!(await fileExists(envFile)) || !(await fileExists(rawFile))) {
    console.error(`报告缺少 env.json 或 raw.json：${reportDir}`);
    process.exitCode = 1;
    return;
  }
  const env = JSON.parse(await readFile(envFile, "utf8"));
  const original = JSON.parse(await readFile(rawFile, "utf8"));
  const currentGit = gitMetadata(PROJECT_ROOT);
  const only = String(args.only || "");
  const parts = only.split("/");
  const verifyArgs = ["run", "opt:verify", "--", "--label", `repro-${Date.now()}`, "--base-url", original.baseUrl];
  if (parts[0]) verifyArgs.push("--page", parts[0]);
  if (parts[1]) verifyArgs.push("--viewport", parts[1]);
  if (parts[2]) verifyArgs.push("--scenario", parts[2]);
  const output = await runProcess(process.platform === "win32" ? "npm.cmd" : "npm", verifyArgs, { cwd: PROJECT_ROOT, timeoutMs: 600_000 });
  const reproDir = await createReportDirectory("repro", REPORTS_ROOT);
  await writeJson(join(reproDir, "env.json"), { recorded: env, current: { ...currentGit, node: process.version, platform: process.platform }, commitMatch: currentGit.commit === original.git?.commit });
  await writeText(join(reproDir, "command.log"), `${output.stdout}\n${output.stderr}`);
  await writeText(join(reproDir, "diff.md"), [
    "# 复现差异",
    "",
    `- 原报告：${reportDir}`,
    `- 当前 Commit：${currentGit.commit}`,
    `- 原报告 Commit：${original.git?.commit || "unknown"}`,
    `- Commit 一致：${currentGit.commit === original.git?.commit ? "是" : "否（仅告警，不强制切换）"}`,
    `- 运行退出码：${output.code}`,
    "",
    "当前完整报告会由 opt:verify 输出；此处保留环境差异与命令日志，不写入凭据。",
    "",
  ].join("\n"));
  console.log(JSON.stringify({ status: output.code === 0 ? "PASS" : "FAIL", reproDir, commitMatch: currentGit.commit === original.git?.commit }, null, 2));
  if (output.code !== 0) process.exitCode = output.code;
}

await main();

