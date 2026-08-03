import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import {
  HISTORY_ROOT,
  PROJECT_ROOT,
  SNAPSHOT_ROOT,
  ensureDir,
  fileExists,
  hasFlag,
  nowIso,
  parseArgs,
  relativeProjectPath,
  writeJson,
  writeText,
} from "./lib/common.mjs";

function gitShow(commit, path) {
  try {
    return execFileSync("git", ["show", `${commit}:${path}`], { cwd: PROJECT_ROOT, encoding: "buffer", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function safeTarget(path) {
  const absolute = resolve(PROJECT_ROOT, path);
  const root = resolve(PROJECT_ROOT);
  return absolute === root || absolute.startsWith(`${root}\\`) || absolute.startsWith(`${root}/`) ? absolute : null;
}

async function confirm(id) {
  if (!process.stdin.isTTY) return false;
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await readline.question(`回滚将影响快照 ${id} 列出的文件；请再次输入快照 ID：`);
  readline.close();
  return answer.trim() === id;
}

async function findSnapshot(args) {
  if (args.snapshot) return String(args.snapshot);
  if (hasFlag(args, "last-passing")) {
    const passing = JSON.parse(await readFile(join(HISTORY_ROOT, "last-passing.json"), "utf8"));
    if (passing.snapshotId) return passing.snapshotId;
    throw new Error("last-passing 没有关联快照 ID；请先用 opt:snapshot 创建快照");
  }
  if (args.task) {
    const entries = await readdir(SNAPSHOT_ROOT, { withFileTypes: true });
    const manifests = [];
    for (const entry of entries.filter((item) => item.isDirectory())) {
      const manifestFile = join(SNAPSHOT_ROOT, entry.name, "manifest.json");
      if (!(await fileExists(manifestFile))) continue;
      const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
      if (manifest.task === String(args.task) && (!args.batch || String(manifest.batch) === String(args.batch))) manifests.push(manifest);
    }
    manifests.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    if (manifests[0]) return manifests[0].id;
  }
  throw new Error("缺少 --snapshot、--last-passing 或可匹配的 --task");
}

async function main() {
  const args = parseArgs();
  let id;
  try {
    id = await findSnapshot(args);
  } catch (error) {
    console.error(String(error));
    process.exitCode = 1;
    return;
  }
  const manifestFile = join(SNAPSHOT_ROOT, id, "manifest.json");
  if (!(await fileExists(manifestFile))) {
    console.error(`快照不存在：${id}`);
    process.exitCode = 1;
    return;
  }
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  const files = manifest.files || [];
  const impact = files.map((file) => ({ path: file.path, existsAtSnapshot: file.exists, bytes: file.bytes, sha256: file.sha256 }));
  const apply = hasFlag(args, "apply");
  console.log(JSON.stringify({
    status: "DRY_RUN",
    snapshot: id,
    mode: apply ? "apply-pending-confirmation" : "dry-run",
    affectedFiles: impact.length,
    examples: impact.slice(0, 20),
    commit: manifest.commit,
    warning: "不会回滚白名单外路径、数据库或线上资源。",
  }, null, 2));
  if (!apply) return;
  const confirmed = hasFlag(args, "yes") || await confirm(id);
  if (!confirmed) {
    console.error("未获得二次确认，未执行回滚。");
    process.exitCode = 1;
    return;
  }
  const changed = [];
  for (const file of files) {
    const target = safeTarget(file.path);
    if (!target) throw new Error(`拒绝回滚工作区外路径：${file.path}`);
    const blob = gitShow(manifest.commit, file.path);
    if (blob) {
      await ensureDir(resolve(target, ".."));
      await writeFile(target, blob);
      changed.push({ path: relativeProjectPath(target), operation: "restore", bytes: blob.length });
    } else if (!file.exists) {
      await rm(target, { force: true });
      changed.push({ path: relativeProjectPath(target), operation: "remove-new-file", bytes: 0 });
    }
  }
  const rollbackId = `rollback-${id}-${Date.now()}`;
  await writeJson(join(SNAPSHOT_ROOT, rollbackId, "manifest.json"), {
    id: rollbackId,
    mode: "rollback-apply",
    sourceSnapshot: id,
    timestamp: nowIso(),
    commit: manifest.commit,
    files: changed,
  });
  await ensureDir(join(PROJECT_ROOT, "reports", "opt", "changes"));
  await writeText(join(PROJECT_ROOT, "reports", "opt", "changes", `${rollbackId}.md`), [
    `# 回滚清单：${rollbackId}`,
    "",
    `- 来源快照：${id}`,
    `- 时间：${nowIso()}`,
    `- 实际文件数：${changed.length}`,
    "",
    ...changed.map((item) => `- ${item.operation}: ${item.path} (${item.bytes} bytes)`),
    "",
  ].join("\n"));
  console.log(JSON.stringify({ status: "PASS", rollbackId, sourceSnapshot: id, changed }, null, 2));
}

await main();
