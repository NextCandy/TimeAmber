import { join } from "node:path";
import { randomInt } from "node:crypto";

import sharp from "sharp";

import {
  REPORTS_ROOT,
  createReportDirectory,
  hashFileBuffer,
  hasFlag,
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

const sleep = (ms) => ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function reportRow(task) {
  return {
    id: task.id,
    name: task.name,
    originalPath: task.objectPath,
    originalMd5Before: task.originalMd5Before ?? "",
    originalMd5After: task.originalMd5After ?? "",
    thumbnailPath: task.thumbnailPath,
    outputFormat: task.outputFormat ?? "webp",
    outputBytes: task.outputBytes ?? 0,
    status: task.status,
    reason: task.reason ?? "",
    batch: task.batch,
    elapsedMs: task.elapsedMs ?? 0,
    spotCheck: task.spotCheck ?? "not-run",
    publicUrl: redactUrl(task.publicUrl),
  };
}

function queueForWrite(queue) {
  return JSON.parse(JSON.stringify(queue, (key, value) => key === "publicUrl" ? redactUrl(value) : value));
}

function reportMarkdown(report) {
  const count = (status) => report.results.filter((item) => item.status === status).length;
  return [
    "# 缩略图修复报告",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- 模式：${report.apply ? "apply" : "dry-run"}`,
    `- 存储适配器：${report.adapter}`,
    `- 并发 / RPS / 每批：${report.concurrency} / ${report.rps} / ${report.batchSize}`,
    "- 原图只读；本任务只写入派生缩略图路径。",
    "",
    "## 汇总",
    "",
    `- 总任务：${report.results.length}`,
    `- 成功：${count("done")}`,
    `- 失败：${count("failed")}`,
    `- 跳过：${count("skipped")}`,
    `- 待处理：${count("pending")}`,
    `- 抽检命中率：${report.spotCheck.hitRate == null ? "未执行" : `${report.spotCheck.hitRate}%`}`,
    `- 不可修复项：${report.results.filter((item) => item.status === "failed").map((item) => item.id).join("、") || "无"}`,
    "",
    "## 抽检",
    "",
    `- 计划抽检：${report.spotCheck.planned}`,
    `- 通过：${report.spotCheck.passed}`,
    `- 失败：${report.spotCheck.failed}`,
    "- 前台文章 404 抽查需要提供 --base-url；未配置时不伪造通过结果。",
    "",
  ].join("\n");
}

async function main() {
  const args = parseArgs();
  const apply = hasFlag(args, "apply");
  const input = args.input ? String(args.input) : "";
  const width = clamp(args.width, 64, 1024, 260);
  const quality = clamp(args.quality, 1, 100, 78);
  const concurrency = clamp(args.concurrency, 1, 10, 3);
  const rps = clamp(args.rps, 0, 5, 5);
  const batchSize = clamp(args["batch-size"], 1, 200, 200);
  const limit = args.limit ? clamp(args.limit, 1, 5000, 5000) : Infinity;
  const reportRoot = await createReportDirectory(safeFileName(args.label || "fix-thumbs"), join(REPORTS_ROOT, "thumbs"));
  const queueFile = String(args.queue || join(REPORTS_ROOT, "thumbs", "queue.json"));
  const adapter = await createMediaStorageAdapter({ root: args.root ? String(args.root) : "" });
  if (apply && adapter.kind === "public-head") throw new Error("--apply 需要 --root 或 Supabase service key 存储适配器");

  let queue = await (args.resume ? import("./lib/common.mjs").then(({ readJson }) => readJson(queueFile, null)) : null);
  if (!queue) {
    const items = await loadMediaInventory(input);
    queue = {
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      thumbnailWidth: width,
      quality,
      pending: items.map((item, index) => ({
        ...item,
        thumbnailPath: thumbnailPath(item, width),
        batch: Math.floor(index / batchSize) + 1,
        status: "pending",
      })),
      running: [],
      done: [],
      failed: [],
      skipped: [],
    };
  } else if (queue.running?.length) {
    queue.pending = [...queue.running.map((item) => ({ ...item, status: "pending" })), ...(queue.pending ?? [])];
    queue.running = [];
  }
  if (hasFlag(args, "only-failed")) {
    queue.pending = [...queue.failed.map((item) => ({ ...item, status: "pending" }))];
    queue.failed = [];
  }

  const pending = queue.pending.slice(0, limit);
  queue.pending = queue.pending.slice(pending.length);
  const snapshot = {
    version: 1,
    createdAt: new Date().toISOString(),
    mode: "fix-thumbs",
    apply,
    originalItems: pending.map((item) => ({ id: item.id, bucket: item.bucket, objectPath: item.objectPath, publicUrl: redactUrl(item.publicUrl) })),
  };
  await writeJson(join(reportRoot, "snapshot.json"), snapshot);
  await writeJson(queueFile, queueForWrite(queue));

  const stop = { value: false };
  process.once("SIGINT", () => {
    stop.value = true;
    console.error("收到 SIGINT：当前项目完成后保存队列并停止，不再派发新项目。 ");
  });
  let nextPermitAt = 0;
  const startTimes = [];
  async function rateLimit() {
    if (rps <= 0) return;
    const interval = 1000 / rps;
    await sleep(Math.max(0, nextPermitAt - Date.now()));
    nextPermitAt = Math.max(nextPermitAt, Date.now()) + interval;
    startTimes.push(Date.now());
  }

  async function persistQueue() {
    queue.updatedAt = new Date().toISOString();
    await writeJson(queueFile, queueForWrite(queue));
  }

  async function processTask(task) {
    const started = Date.now();
    task.status = "running";
    queue.running.push(task);
    await persistQueue();
    if (!isSupportedImage(task)) {
      task.status = "skipped";
      task.reason = "格式不支持";
      return;
    }
    const fixtureOriginal = fixtureProbe(task, "original");
    const original = fixtureOriginal ?? await adapter.inspect(task, task.objectPath, true);
    if (!original.exists) {
      task.status = "failed";
      task.reason = original.error || "原图不存在或无法读取";
      return;
    }
    if (!apply) {
      task.status = "skipped";
      task.reason = "dry-run：将生成派生缩略图";
      return;
    }
    if (!original.buffer) {
      task.status = "failed";
      task.reason = "apply 模式无法读取原图字节";
      return;
    }
    task.originalMd5Before = hashFileBuffer(original.buffer);
    const existing = fixtureProbe(task, "thumbnail") ?? await adapter.inspect(task, task.thumbnailPath);
    if (existing.exists) {
      task.status = "skipped";
      task.reason = "缩略图已存在，幂等跳过";
      task.outputBytes = existing.bytes;
      return;
    }
    const output = await sharp(original.buffer)
      .rotate()
      .resize(width, width, { fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    if (output.byteLength >= original.buffer.byteLength * 0.9) {
      task.status = "skipped";
      task.reason = `派生文件 ${output.byteLength} B 未小于原图 90%（${original.buffer.byteLength} B）`;
      task.outputBytes = output.byteLength;
      return;
    }
    await adapter.put(task, task.thumbnailPath, output, "image/webp");
    const verified = await adapter.inspect(task, task.thumbnailPath, true);
    if (!verified.exists || !verified.bytes || !verified.buffer) throw new Error("写入后抽检无法读取缩略图");
    task.outputBytes = verified.bytes;
    task.outputFormat = "webp";
    task.thumbnailWidth = (await sharp(verified.buffer).metadata()).width ?? width;
    const originalAfter = await adapter.inspect(task, task.objectPath, true);
    task.originalMd5After = originalAfter.buffer ? hashFileBuffer(originalAfter.buffer) : "";
    if (task.originalMd5After && task.originalMd5After !== task.originalMd5Before) throw new Error("原图哈希发生变化，停止后续任务");
    task.status = "done";
    task.reason = "生成并抽检通过";
    task.elapsedMs = Date.now() - started;
  }

  const workers = Array.from({ length: concurrency }, async () => {
    while (!stop.value) {
      const task = pending.shift();
      if (!task) return;
      const taskStarted = Date.now();
      await rateLimit();
      try {
        await processTask(task);
      } catch (error) {
        task.status = "failed";
        task.reason = error instanceof Error ? error.message : String(error);
      } finally {
        task.elapsedMs ??= Date.now() - taskStarted;
        queue.running = queue.running.filter((item) => item.id !== task.id);
        queue[task.status].push(task);
        await persistQueue();
        console.log(`[opt:fix-thumbs] ${task.status} ${task.id} ${task.name}`);
      }
    }
  });
  await Promise.all(workers);
  queue.pending = [...pending, ...queue.pending];
  await persistQueue();

  const candidates = [...queue.done, ...queue.failed, ...queue.skipped];
  const samples = candidates.filter((item) => item.status === "done");
  const sampleSize = samples.length ? Math.min(samples.length, Math.max(5, Math.ceil(samples.length * 0.05))) : 0;
  const spotTargets = samples.length <= sampleSize
    ? samples
    : Array.from({ length: sampleSize }, (_, index) => samples[(index * 997 + randomInt(997)) % samples.length]);
  let passed = 0;
  for (const task of spotTargets) {
    const verified = await adapter.inspect(task, task.thumbnailPath, true);
    if (verified.exists && verified.bytes > 0 && verified.buffer) {
      try {
        const metadata = await sharp(verified.buffer).metadata();
        if (metadata.width && metadata.height) {
          passed += 1;
          task.spotCheck = "pass";
          continue;
        }
      } catch {
        // fall through to failure below
      }
    }
    task.spotCheck = "fail";
  }
  const results = candidates.map(reportRow);
  const report = {
    generatedAt: new Date().toISOString(),
    reportRoot,
    queueFile,
    apply,
    adapter: adapter.kind,
    concurrency,
    rps,
    batchSize,
    thumbnailWidth: width,
    quality,
    results,
    spotCheck: { planned: spotTargets.length, passed, failed: spotTargets.length - passed, hitRate: spotTargets.length ? Number(((passed / spotTargets.length) * 100).toFixed(2)) : null },
    measuredStartTimes: startTimes.length,
  };
  await writeJson(join(reportRoot, "fix-report.json"), report);
  await writeText(join(reportRoot, "fix-report.md"), reportMarkdown(report));
  await writeText(join(reportRoot, "fix-report.csv"), toCsv(results, ["id", "name", "originalPath", "originalMd5Before", "originalMd5After", "thumbnailPath", "outputFormat", "outputBytes", "status", "reason", "batch", "elapsedMs", "spotCheck", "publicUrl"]));
  console.log(JSON.stringify({ status: report.spotCheck.failed || queue.failed.length ? "WARN" : "PASS", reportRoot, queueFile, apply, counts: { done: queue.done.length, failed: queue.failed.length, skipped: queue.skipped.length, pending: queue.pending.length }, spotCheck: report.spotCheck }, null, 2));
}

await main();
