import { join } from "node:path";

import {
  REPORTS_ROOT,
  createReportDirectory,
  parseArgs,
  redactUrl,
  safeFileName,
  toCsv,
  writeJson,
  writeText,
} from "./lib/common.mjs";
import {
  createMediaStorageAdapter,
  fixtureProbe,
  isSupportedImage,
  loadMediaInventory,
  thumbnailPath,
} from "./lib/media.mjs";

const CATEGORIES = ["recorded_original_missing", "original_exists_thumb_missing", "path_or_permission", "unsupported", "ok"];

function classifyError(error = "") {
  return /permission|access|denied|越界|EACCES|EPERM|路径/i.test(error) ? "path_or_permission" : "recorded_original_missing";
}

async function inspectItem(item, adapter, width) {
  const thumb = thumbnailPath(item, width);
  const base = {
    id: item.id,
    name: item.name,
    bucket: item.bucket,
    objectPath: item.objectPath,
    thumbnailPath: thumb,
    publicUrl: redactUrl(item.publicUrl),
    contentType: item.contentType,
  };
  if (!isSupportedImage(item)) return { ...base, status: "unsupported", reason: "格式不支持" };

  const original = fixtureProbe(item, "original") ?? await adapter.inspect(item, item.objectPath);
  if (!original.exists) return { ...base, status: classifyError(original.error), reason: original.error || "原图不存在", originalBytes: 0 };

  const thumbnail = fixtureProbe(item, "thumbnail") ?? await adapter.inspect(item, thumb);
  if (!thumbnail.exists) {
    const status = thumbnail.error && /permission|access|denied|越界|EACCES|EPERM/i.test(thumbnail.error)
      ? "path_or_permission"
      : "original_exists_thumb_missing";
    return { ...base, status, reason: thumbnail.error || "缩略图不存在", originalBytes: original.bytes, thumbnailBytes: 0 };
  }
  if (!thumbnail.bytes) return { ...base, status: "path_or_permission", reason: "缩略图字节数为 0", originalBytes: original.bytes, thumbnailBytes: 0 };
  return { ...base, status: "ok", originalBytes: original.bytes, thumbnailBytes: thumbnail.bytes };
}

function markdown(report) {
  const rows = CATEGORIES.map((key) => `| ${key} | ${report.counts[key]} | ${(report.samples[key] ?? []).length} |`).join("\n");
  return [
    "# 缩略图只读扫描报告",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- 扫描条目：${report.total}`,
    `- 缩略图宽度：${report.thumbnailWidth}px` ,
    `- 存储适配器：${report.adapter}`,
    "- 本次只读，不上传、不覆盖、不删除任何原图或派生文件。",
    "",
    "## 分类计数",
    "",
    "| 状态 | 数量 | 样例数 |",
    "| --- | ---: | ---: |",
    rows,
    "",
    "## 解释",
    "",
    "- `recorded_original_missing`：数据库有记录，但原图无法读取。",
    "- `original_exists_thumb_missing`：原图可读，约定的派生缩略图不存在。",
    "- `path_or_permission`：路径越界、权限错误、空文件或存储适配器异常。",
    "- `unsupported`：当前生成器不处理该图片格式。",
    "",
  ].join("\n");
}

async function main() {
  const args = parseArgs();
  const width = Math.max(64, Math.min(1024, Number(args.width || 260)));
  const items = await loadMediaInventory(args.input ? String(args.input) : "");
  const adapter = await createMediaStorageAdapter({ root: args.root ? String(args.root) : "" });
  const results = [];
  for (const item of items) results.push(await inspectItem(item, adapter, width));
  const counts = Object.fromEntries(CATEGORIES.map((key) => [key, results.filter((item) => item.status === key).length]));
  const samples = Object.fromEntries(CATEGORIES.map((key) => [key, results.filter((item) => item.status === key).slice(0, 20)]));
  const report = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    thumbnailWidth: width,
    adapter: adapter.kind,
    counts,
    samples,
    results,
  };
  const label = safeFileName(args.label || "scan-thumbs");
  const reportRoot = await createReportDirectory(label, join(REPORTS_ROOT, "thumbs"));
  await writeJson(join(reportRoot, "scan-report.json"), report);
  await writeText(join(reportRoot, "scan-report.md"), markdown(report));
  await writeText(join(reportRoot, "scan-report.csv"), toCsv(results, ["id", "name", "bucket", "objectPath", "thumbnailPath", "status", "reason", "originalBytes", "thumbnailBytes", "publicUrl"]));
  const status = results.some((item) => item.status !== "ok") ? "WARN" : "PASS";
  console.log(JSON.stringify({ status, reportRoot, adapter: adapter.kind, total: results.length, counts }, null, 2));
}

await main();
