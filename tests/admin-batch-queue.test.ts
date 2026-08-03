import assert from "node:assert/strict";
import test from "node:test";

import {
  createAdminBatchQueue,
  normalizeAdminBatchQueueConfig,
} from "../src/lib/admin-batch-queue";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("批处理队列按批重试，并在暂停后从断点继续", async () => {
  const attempts = new Map<string, number>();
  const updates: string[] = [];
  const items = ["a", "b", "c", "d"].map((slug) => ({ slug }));
  const run = createAdminBatchQueue(items, async (batch) => {
    const key = batch[0]!.slug;
    const attempt = (attempts.get(key) ?? 0) + 1;
    attempts.set(key, attempt);
    if (key === "a" && attempt === 1) throw new Error("temporary");
    await wait(5);
    return { success: batch.map((item) => item.slug) };
  }, {
    config: { concurrency: 1, batchSize: 2, rps: 0, retries: 1, backoffMs: 0, jitterMs: 0 },
    onUpdate: (snapshot) => updates.push(snapshot.status),
  });

  await wait(1);
  run.pause();
  await wait(10);
  assert.equal(run.snapshot().status, "paused");
  run.resume();
  const result = await run.promise;

  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.skipped, []);
  assert.equal(result.success.length, 4);
  assert.equal(attempts.get("a"), 2);
  assert.ok(updates.includes("paused"));
  assert.equal(run.snapshot().status, "completed");
});

test("取消只阻止新批次，保留已完成与跳过结果", async () => {
  const run = createAdminBatchQueue(
    ["a", "b", "c", "d"].map((slug) => ({ slug })),
    async (batch) => {
      await wait(20);
      return { success: batch.map((item) => item.slug) };
    },
    { config: { concurrency: 1, batchSize: 1, rps: 0 } },
  );
  await wait(3);
  run.cancel();
  const result = await run.promise;

  assert.equal(result.cancelled, true);
  assert.equal(result.success.length + result.skipped.length, 4);
  assert.equal(run.snapshot().status, "completed");
});

test("队列配置限制在前端允许的并发与速率范围", () => {
  assert.deepEqual(normalizeAdminBatchQueueConfig({ concurrency: 99, rps: 99, batchSize: 0 }), {
    concurrency: 10,
    batchSize: 1,
    rps: 5,
    batchDelayMs: 0,
    retries: 2,
    backoffMs: 500,
    jitterMs: 150,
  });
});
