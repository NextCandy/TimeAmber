import { join } from "node:path";

import sharp from "sharp";

import {
  REPORTS_ROOT,
  createReportDirectory,
  hashFileBuffer,
  hasFlag,
  parseArgs,
  readJson,
  redactUrl,
  safeFileName,
  sha256,
  toCsv,
  writeJson,
  writeText,
} from "./lib/common.mjs";
import {
  createMediaStorageAdapter,
  fixtureProbe,
  isSupportedImage,
  loadMediaInventory,
} from "./lib/media.mjs";

const sleep = (ms) => ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function variantPath(item, width, format, thumbs = false) {
  const source = String(item.objectPath || item.name || item.id).replace(/^\/+/, "");
  return `${thumbs ? "variants/thumbnails" : "variants"}/${source}.w${width}.${format}`;
}

function queueForWrite(queue) {
  return JSON.parse(JSON.stringify(queue, (key, value) => key === "publicUrl" ? redactUrl(value) : value));
}

function markdown(report) {
  const variants = report.results.flatMap((item) => item.variants);
  const generated = variants.filter((item) => item.status === "done");
  const abandoned = variants.filter((item) => item.status === "skipped" && /90%/.test(item.reason));
  const warnings = variants.filter((item) => item.warning);
  return [
    "# AVIF / WebP 派生图片报告",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- 模式：${report.apply ? "apply" : "dry-run"}`,
    `- 存储适配器：${report.adapter}`,
    `- 源文件：${report.results.length}`,
    `- 派生成功：${generated.length}`,
    `- 因负优化放弃：${abandoned.length}`,
    `- 超过目标体积警告：${warnings.length}`,
    `- 总原始字节：${report.summary.originalBytes}`,
    `- 派生字节：${report.summary.derivedBytes}`,
    `- 理论节省：${report.summary.originalBytes ? `${(((report.summary.originalBytes - report.summary.derivedBytes) / report.summary.originalBytes) * 100).toFixed(2)}%` : "未知"}`,
    "- 原图只读；派生缓存键为 `source md5 + 配置哈希 + 宽度 + 格式`。",
    "",
    "## 体积与覆盖",
    "",
    "| 源 | 格式 | 宽度 | 原图 B | 派生 B | 节省% | 状态 | 备注 |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- | --- |",
    ...variants.map((item) => `| ${item.id} | ${item.format} | ${item.width} | ${item.originalBytes} | ${item.bytes} | ${item.originalBytes ? (((item.originalBytes - item.bytes) / item.originalBytes) * 100).toFixed(2) : "-"} | ${item.status} | ${item.reason || (item.warning ? `WARN: ${item.warning}` : "")} |`),
    "",
    "## 原图校验",
    "",
    ...report.results.map((item) => `- ${item.id}: ${item.originalMd5Before === item.originalMd5After ? "原图 MD5 不变" : "原图校验失败"}`),
    "",
  ].join("\n");
}

async function main() {
  const args = parseArgs();
  const apply = hasFlag(args, "apply");
  const thumbs = hasFlag(args, "thumbs");
  const configFile = String(args.config || join(process.cwd(), "scripts", "opt", "image.config.json"));
  const config = await readJson(configFile, null);
  if (!config) throw new Error(`无法读取图片配置：${configFile}`);
  const widthList = [...new Set([...(config.widths ?? []), ...(thumbs ? (config.thumbnailWidths ?? []) : [])])]
    .map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0).sort((a, b) => a - b);
  const formatConfig = config.formats?.[String(args.kind || config.defaultKind || "photo")] ?? config.formats.photo;
  const configHash = sha256(JSON.stringify({ config, thumbs }));
  const concurrency = clamp(args.concurrency, 1, 10, 3);
  const rps = clamp(args.rps, 0, 5, 5);
  const batchSize = clamp(args["batch-size"], 1, 200, 50);
  const retries = clamp(args.retries, 0, 5, 2);
  const limit = args.limit ? clamp(args.limit, 1, 5000, 5000) : Infinity;
  const reportRoot = await createReportDirectory(safeFileName(args.label || "gen-images"), join(REPORTS_ROOT, "images"));
  const queueFile = String(args.queue || join(REPORTS_ROOT, "images", "queue.json"));
  const adapter = await createMediaStorageAdapter({ root: args.root ? String(args.root) : "" });
  if (apply && adapter.kind === "public-head") throw new Error("--apply 需要 --root 或 Supabase service key 存储适配器");

  let queue = args.resume ? await readJson(queueFile, null) : null;
  if (!queue) {
    const items = await loadMediaInventory(args.input ? String(args.input) : "");
    queue = {
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      configHash,
      pending: items.map((item, index) => ({
        ...item,
        batch: Math.floor(index / batchSize) + 1,
        status: "pending",
      })),
      running: [],
      done: [],
      failed: [],
      skipped: [],
    };
  } else if (queue.running?.length) {
    if (queue.configHash && queue.configHash !== configHash) {
      throw new Error("--resume queue config does not match image.config.json; use a new --queue");
    }
    queue.pending = [...queue.running.map((item) => ({ ...item, status: "pending" })), ...(queue.pending ?? [])];
    queue.running = [];
  } else if (queue.configHash && queue.configHash !== configHash) {
    throw new Error("--resume queue config does not match the current image config; use a new --queue");
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
    mode: "gen-images",
    apply,
    configHash,
    originals: pending.map((item) => ({ id: item.id, bucket: item.bucket, objectPath: item.objectPath, publicUrl: redactUrl(item.publicUrl) })),
  };
  await writeJson(join(reportRoot, "snapshot.json"), snapshot);

  const stop = { value: false };
  process.once("SIGINT", () => {
    stop.value = true;
    console.error("收到 SIGINT：保存当前队列，不再派发新源文件。 ");
  });
  let nextPermitAt = 0;
  async function rateLimit() {
    if (rps <= 0) return;
    const interval = 1000 / rps;
    await sleep(Math.max(0, nextPermitAt - Date.now()));
    nextPermitAt = Math.max(nextPermitAt, Date.now()) + interval;
  }
  async function persistQueue() {
    queue.updatedAt = new Date().toISOString();
    await writeJson(queueFile, queueForWrite(queue));
  }

  async function processTask(task) {
    task.status = "running";
    queue.running.push(task);
    await persistQueue();
    if (!isSupportedImage(task)) {
      task.status = "skipped";
      task.reason = "格式不支持";
      task.variants = [];
      return;
    }
    const original = fixtureProbe(task, "original") ?? await adapter.inspect(task, task.objectPath, true);
    if (!original.exists) {
      task.status = "failed";
      task.reason = original.error || "原图不存在";
      task.variants = [];
      return;
    }
    if (!original.buffer) {
      task.status = "skipped";
      task.reason = apply ? "apply 模式无法读取原图字节" : "dry-run：需要存储适配器才能测量并生成";
      task.variants = [];
      return;
    }
    const metadata = await sharp(original.buffer).metadata();
    const originalWidth = Number(metadata.width ?? 0);
    const sourceHash = hashFileBuffer(original.buffer);
    task.originalMd5Before = sourceHash;
    task.originalBytes = original.buffer.byteLength;
    const variants = [];
    for (const width of widthList) {
      if (originalWidth && width > originalWidth) continue;
      for (const format of ["avif", "webp"]) {
        const outputPath = variantPath(task, width, format, thumbs);
        const cacheKey = sha256(`${sourceHash}:${configHash}:${width}:${format}`);
        const existing = fixtureProbe(task, `${format}-${width}`) ?? await adapter.inspect(task, outputPath);
        if (existing.exists && existing.bytes > 0) {
          variants.push({ id: task.id, width, format, path: outputPath, originalBytes: original.buffer.byteLength, bytes: existing.bytes, status: "skipped", reason: "派生已存在，缓存跳过", cacheKey });
          continue;
        }
        const quality = Number(formatConfig?.[format] ?? (format === "avif" ? 50 : 75));
        let output;
        try {
          const image = sharp(original.buffer).rotate().resize(width, width, { fit: "inside", withoutEnlargement: true });
          output = format === "avif" ? await image.avif({ quality }).toBuffer() : await image.webp({ quality }).toBuffer();
        } catch (error) {
          variants.push({ id: task.id, width, format, path: outputPath, originalBytes: original.buffer.byteLength, bytes: 0, status: "failed", reason: error instanceof Error ? error.message : String(error), cacheKey });
          continue;
        }
        const ratio = output.byteLength / original.buffer.byteLength;
        if (ratio >= Number(config.maxDerivedRatio ?? 0.9)) {
          variants.push({ id: task.id, width, format, path: outputPath, originalBytes: original.buffer.byteLength, bytes: output.byteLength, status: "skipped", reason: `派生文件未小于原图 90%（${output.byteLength} / ${original.buffer.byteLength}）`, cacheKey });
          continue;
        }
        const limitBytes = (thumbs && width <= 480) ? Number(config.thumbnailMaxBytes ?? 61440) : Number(config.heroMaxBytes ?? 204800);
        const warning = output.byteLength > limitBytes ? `超过目标 ${limitBytes} B` : "";
        if (apply) {
          let written = false;
          let lastError;
          for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
            try {
              await adapter.put(task, outputPath, output, `image/${format}`);
              written = true;
              break;
            } catch (error) {
              lastError = error;
              if (attempt <= retries) await sleep(300 * 2 ** (attempt - 1));
            }
          }
          if (!written) {
            variants.push({ id: task.id, width, format, path: outputPath, originalBytes: original.buffer.byteLength, bytes: output.byteLength, status: "failed", reason: lastError instanceof Error ? lastError.message : String(lastError), cacheKey, warning });
            continue;
          }
        }
        variants.push({ id: task.id, width, format, path: outputPath, originalBytes: original.buffer.byteLength, bytes: output.byteLength, status: apply ? "done" : "skipped", reason: apply ? "已生成" : "dry-run：计划生成", cacheKey, warning });
      }
    }
    task.variants = variants;
    const failed = variants.some((item) => item.status === "failed");
    task.status = failed ? "failed" : (variants.some((item) => item.status === "done") ? "done" : "skipped");
    task.reason = failed ? "至少一个派生格式失败" : "处理完成";
    const originalAfter = await adapter.inspect(task, task.objectPath, true);
    task.originalMd5After = originalAfter.buffer ? hashFileBuffer(originalAfter.buffer) : sourceHash;
    if (task.originalMd5After !== sourceHash) throw new Error("原图哈希发生变化，停止后续任务");
  }

  const workers = Array.from({ length: concurrency }, async () => {
    while (!stop.value) {
      const task = pending.shift();
      if (!task) return;
      await rateLimit();
      try {
        await processTask(task);
      } catch (error) {
        task.status = "failed";
        task.reason = error instanceof Error ? error.message : String(error);
        task.variants ??= [];
      } finally {
        queue.running = queue.running.filter((item) => item.id !== task.id);
        queue[task.status].push(task);
        await persistQueue();
        console.log(`[opt:gen-images] ${task.status} ${task.id} ${task.name}`);
      }
    }
  });
  await Promise.all(workers);
  queue.pending = [...pending, ...queue.pending];
  await persistQueue();

  const tasks = [...queue.done, ...queue.failed, ...queue.skipped];
  const results = tasks.map((task) => ({
    id: task.id,
    name: task.name,
    originalPath: task.objectPath,
    originalMd5Before: task.originalMd5Before ?? "",
    originalMd5After: task.originalMd5After ?? "",
    originalBytes: task.originalBytes ?? 0,
    variants: task.variants ?? [],
    status: task.status,
    reason: task.reason ?? "",
    publicUrl: redactUrl(task.publicUrl),
  }));
  const variants = results.flatMap((item) => item.variants);
  const summary = {
    originalBytes: results.reduce((sum, item) => sum + item.originalBytes, 0),
    derivedBytes: variants.reduce((sum, item) => sum + (item.status === "done" ? item.bytes : 0), 0),
    plannedDerivedBytes: variants.reduce((sum, item) => sum + (item.status !== "failed" ? item.bytes : 0), 0),
    variants: variants.length,
    generated: variants.filter((item) => item.status === "done").length,
    skipped: variants.filter((item) => item.status === "skipped").length,
    failed: variants.filter((item) => item.status === "failed").length,
    warnings: variants.filter((item) => item.warning).length,
  };
  const report = { generatedAt: new Date().toISOString(), reportRoot, queueFile, apply, adapter: adapter.kind, configFile, configHash, thumbs, concurrency, rps, batchSize, summary, results };
  await writeJson(join(reportRoot, "image-report.json"), report);
  await writeText(join(reportRoot, "image-report.md"), markdown(report));
  await writeText(join(reportRoot, "image-report.csv"), toCsv(variants, ["id", "path", "format", "width", "originalBytes", "bytes", "status", "reason", "warning", "cacheKey"]));
  console.log(JSON.stringify({ status: summary.failed ? "WARN" : "PASS", reportRoot, queueFile, apply, summary }, null, 2));
}

await main();
