import { execFileSync } from "node:child_process";
import { appendFile, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { join } from "node:path";

import {
  CHANGES_ROOT,
  PROJECT_ROOT,
  REPORTS_ROOT,
  SNAPSHOT_ROOT,
  ensureDir,
  fileExists,
  gitMetadata,
  gitValue,
  hasFlag,
  nowIso,
  parseArgs,
  relativeProjectPath,
  safeFileName,
  sha256,
  toCsv,
  writeJson,
  writeText,
} from "./lib/common.mjs";

const WHITELIST = [
  /^src\//,
  /^public\//,
  /^worker\//,
  /^server\//,
  /^scripts\/opt\//,
  /^reports\/opt\//,
  /^\.github\/workflows\//,
  /^(\.gitignore|package\.json|package-lock\.json|bun\.lock|README\.md|PROGRESS\.md)$/,
];

function isWhitelisted(path) {
  return WHITELIST.some((pattern) => pattern.test(path.replaceAll("\\", "/")));
}

function statusPaths() {
  const porcelain = execFileSync("git", ["status", "--porcelain=v1", "-uall"], { cwd: PROJECT_ROOT, encoding: "utf8" });
  return porcelain.split(/\r?\n/).filter(Boolean).map((line) => {
    const status = line.slice(0, 2);
    const raw = line.slice(3).trim();
    const path = raw.includes(" -> ") ? raw.split(" -> ").at(-1) : raw;
    return { status, path: path.replaceAll("\\", "/") };
  });
}

async function fileManifest(paths) {
  const files = [];
  for (const item of paths) {
    const absolute = join(PROJECT_ROOT, item.path);
    let info;
    try {
      info = await stat(absolute);
    } catch {
      files.push({ ...item, exists: false, bytes: 0, sha256: "" });
      continue;
    }
    if (!info.isFile()) continue;
    const content = await readFile(absolute);
    files.push({ ...item, exists: true, bytes: info.size, sha256: sha256(content) });
  }
  return files;
}

async function nextVersion(task) {
  await ensureDir(SNAPSHOT_ROOT);
  const files = await readdir(SNAPSHOT_ROOT, { withFileTypes: true });
  const versions = files
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${safeFileName(task)}-v`))
    .map((entry) => Number(entry.name.match(/-v(\d+)-/)?.[1] || 0));
  return Math.max(0, ...versions) + 1;
}

async function confirm(prompt, expected) {
  if (!process.stdin.isTTY) return false;
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await readline.question(`${prompt} `);
  readline.close();
  return answer.trim() === expected;
}

async function main() {
  const args = parseArgs();
  if (hasFlag(args, "list")) {
    await ensureDir(SNAPSHOT_ROOT);
    const entries = await readdir(SNAPSHOT_ROOT, { withFileTypes: true });
    for (const entry of entries.filter((item) => item.isDirectory()).toSorted((a, b) => b.name.localeCompare(a.name))) {
      const manifest = JSON.parse(await readFile(join(SNAPSHOT_ROOT, entry.name, "manifest.json"), "utf8"));
      console.log(`${entry.name}\t${manifest.mode}\t${manifest.note || ""}`);
    }
    return;
  }
  const task = String(args.task || "manual");
  const note = String(args.note || "");
  const apply = hasFlag(args, "apply");
  const version = await nextVersion(task);
  const id = `${safeFileName(task)}-v${version}-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  const changes = statusPaths();
  const outside = changes.filter((item) => !isWhitelisted(item.path));
  if (outside.length) {
    console.error(JSON.stringify({ status: "FAIL", reason: "工作区包含白名单外路径，拒绝创建可应用快照", outside }, null, 2));
    process.exitCode = 1;
    return;
  }
  const files = await fileManifest(changes);
  const metadata = gitMetadata(PROJECT_ROOT);
  const manifest = {
    id,
    task,
    version,
    batch: args.batch ? String(args.batch) : "",
    mode: apply ? "apply" : "dry-run",
    note,
    timestamp: nowIso(),
    commit: metadata.fullCommit,
    branch: metadata.branch,
    whitelist: WHITELIST.map((pattern) => pattern.toString()),
    files,
    database: {
      dump: false,
      tables: String(process.env.OPT_DB_TABLES || "").split(",").map((item) => item.trim()).filter(Boolean),
      reason: "默认不接触数据库；只有显式提供受限转储命令并确认 apply 时才允许扩展。",
    },
  };
  const snapshotDir = join(SNAPSHOT_ROOT, id);
  await ensureDir(snapshotDir);
  await writeJson(join(snapshotDir, "manifest.json"), manifest);
  const changeRows = files.map((file) => ({
    objectType: "file",
    identifier: file.path,
    operation: file.status.trim() || "unchanged",
    oldToNew: `${file.exists ? `${file.bytes}B/${file.sha256.slice(0, 12)}` : "missing"}`,
    batch: manifest.batch,
    timestamp: manifest.timestamp,
    snapshotId: id,
  }));
  await writeText(join(CHANGES_ROOT, `${id}.csv`), toCsv(changeRows));
  await writeText(join(CHANGES_ROOT, `${id}.md`), [
    `# ${apply ? "实际" : "预期"}变更清单：${id}`,
    "",
    `- 模式：${manifest.mode}`,
    `- 任务：${task}`,
    `- 批次：${manifest.batch || "-"}`,
    `- Commit：${metadata.commit}`,
    `- 文件数：${files.length}`,
    "",
    "| 对象 | 标识符 | 操作 | 当前摘要 | 批次 |",
    "| --- | --- | --- | --- | --- |",
    ...changeRows.map((row) => `| ${row.objectType} | ${row.identifier} | ${row.operation} | ${row.oldToNew} | ${row.batch || "-"} |`),
    "",
  ].join("\n"));
  const snapshots = (await readdir(SNAPSHOT_ROOT, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  console.log(JSON.stringify({
    status: "PASS",
    id,
    mode: manifest.mode,
    affectedFiles: files.length,
    examples: files.slice(0, 20).map((file) => file.path),
    rollback: `npm run opt:rollback -- --snapshot ${id}`,
    warning: snapshots.length > 20 ? "快照超过 20 个；按规则只提示，不自动删除。" : "",
  }, null, 2));
  if (apply) {
    const confirmed = hasFlag(args, "yes") || await confirm(`要执行 apply 快照 ${id} 吗？请输入快照 ID：`, id);
    if (!confirmed) {
      console.error("未获得二次确认，保持 dry-run 结果，不执行外部数据操作。");
      process.exitCode = 1;
      return;
    }
    manifest.confirmedAt = nowIso();
    await writeJson(join(snapshotDir, "manifest.json"), manifest);
  }
}

await main();
