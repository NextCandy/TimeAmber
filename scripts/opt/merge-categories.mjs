import postgres from "postgres";

import { parseArgs, readJson, safeFileName, writeJson, writeText } from "./lib/common.mjs";

const DEFAULT_TARGET = "剪藏";
const DEFAULT_SOURCES = ["剪藏", "VS.DO 剪藏", "树洞"];

function csv(value, fallback) {
  if (!value) return [...fallback];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function requireDatabase() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL 未配置；dry-run 需要数据库只读统计，--apply 还需要快照 ID");
  return postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 20, connect_timeout: 10, prepare: false });
}

function safeSnapshotId(args) {
  return String(args["snapshot-id"] || process.env.OPT_SNAPSHOT_ID || "").trim();
}

function planMarkdown(plan) {
  return [
    `# 分类合并计划：${plan.target}`,
    "",
    `- 模式：${plan.mode}`,
    `- 来源分类：${plan.sources.join("、")}`,
    `- 目标分类：${plan.target}`,
    `- 快照：${plan.snapshotId || "未提供（dry-run 可不提供，apply 必须提供）"}`,
    "",
    "## 统计",
    "",
    "| 分类 | 当前文章数 | 是否存在 | 预计迁移 |",
    "| --- | ---: | --- | ---: |",
    ...plan.counts.map((item) => `| ${item.name} | ${item.count} | ${item.exists ? "是" : "否"} | ${item.name === plan.target ? 0 : item.count} |`),
    "",
    `- 目标分类合并后预计文章数：${plan.expectedTargetCount}`,
    `- 迁移文章数：${plan.movedPosts}`,
    `- 已在目标分类的文章数：${plan.alreadyTargetPosts}`,
    `- 去重净增：${plan.netNewPosts}`,
    `- 将删除的空分类：${plan.emptyCategories.length ? plan.emptyCategories.join("、") : "无"}`,
    `- 缺失来源分类：${plan.missingCategories.length ? plan.missingCategories.join("、") : "无"}`,
    "",
    "## 预期变更",
    "",
    ...(plan.changes.length ? plan.changes.map((change) => `- ${change}`) : ["- 没有可应用的变更。"]),
    "",
    "## 安全边界",
    "",
    "- 默认只读 dry-run；不会写 posts/categories。",
    "- --apply 必须同时提供 --snapshot-id 或 OPT_SNAPSHOT_ID。",
    "- 文章总数应在应用前后保持一致；旧分类 URL 由应用路由层 301 到目标分类。",
    "",
  ].join("\n");
}

async function loadFromDatabase(sources) {
  const sql = requireDatabase();
  try {
    const categories = await sql`select name from public.categories order by name`;
    const counts = await sql`
      select category as name, count(*)::int as count
      from public.posts
      where category = any(${sql.array(sources, "text")})
      group by category
    `;
    return {
      sql,
      categories: categories.map((row) => String(row.name)),
      counts: Object.fromEntries(counts.map((row) => [String(row.name), Number(row.count)])),
    };
  } catch (error) {
    await sql.end({ timeout: 5 }).catch(() => {});
    throw error;
  }
}

async function loadFromInput(file, sources) {
  const input = await readJson(file, null);
  if (!input) throw new Error(`无法读取分类 dry-run 输入：${file}`);
  const categories = (input.categories || []).map((item) => typeof item === "string" ? item : String(item.name));
  const countRows = input.counts || {};
  const counts = Object.fromEntries(sources.map((name) => [name, Number(countRows[name] || 0)]));
  return { sql: null, categories, counts };
}

function buildPlan({ target, sources, categories, counts, snapshotId, mode }) {
  const uniqueSources = [...new Set(sources)];
  const rows = uniqueSources.map((name) => ({ name, count: Number(counts[name] || 0), exists: categories.includes(name) }));
  const targetCount = Number(counts[target] || 0);
  const sourceRows = rows.filter((row) => row.name !== target);
  const movedPosts = sourceRows.reduce((sum, row) => sum + (row.exists ? row.count : 0), 0);
  const targetExists = categories.includes(target);
  const missingCategories = sourceRows.filter((row) => !row.exists).map((row) => row.name);
  const changes = sourceRows.filter((row) => row.exists && row.count > 0).map((row) => `将 ${row.count} 篇文章从「${row.name}」迁移到「${target}」，并删除空分类「${row.name}」`);
  if (!targetExists) changes.unshift(`创建目标分类「${target}」`);
  return {
    mode,
    target,
    sources: uniqueSources,
    snapshotId,
    counts: rows,
    targetExists,
    expectedTargetCount: targetCount + movedPosts,
    movedPosts,
    alreadyTargetPosts: targetCount,
    netNewPosts: movedPosts,
    emptyCategories: sourceRows.filter((row) => row.exists && row.count > 0).map((row) => row.name),
    missingCategories,
    changes,
  };
}

async function applyPlan({ sql, plan }) {
  if (!sql) throw new Error("--apply 不能使用离线输入；请提供 DATABASE_URL");
  if (!plan.snapshotId) throw new Error("--apply 必须提供 --snapshot-id 或 OPT_SNAPSHOT_ID");
  try {
    await sql.begin(async (tx) => {
      await tx`insert into public.categories (name, updated_at) values (${plan.target}, now()) on conflict (name) do update set updated_at = now()`;
      for (const source of plan.sources.filter((item) => item !== plan.target)) {
        await tx`update public.posts set category = ${plan.target}, updated_at = now() where category = ${source}`;
        await tx`delete from public.categories where name = ${source}`;
      }
    });
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

async function main() {
  const args = parseArgs();
  const target = String(args.to || process.env.OPT_CATEGORY_TARGET || DEFAULT_TARGET).trim();
  const sources = csv(args.from || process.env.OPT_CATEGORY_SOURCES, DEFAULT_SOURCES);
  if (!sources.includes(target)) sources.unshift(target);
  const apply = args.apply === true || args.apply === "true" || args.apply === "1";
  const snapshotId = safeSnapshotId(args);
  if (apply && !snapshotId) throw new Error("--apply 必须同时带 --snapshot-id 或 OPT_SNAPSHOT_ID");

  const loaded = args.input
    ? await loadFromInput(String(args.input), sources)
    : await loadFromDatabase(sources);
  const plan = buildPlan({ target, sources, categories: loaded.categories, counts: loaded.counts, snapshotId, mode: apply ? "apply" : "dry-run" });
  const label = safeFileName(args.label || `${apply ? "apply" : "dry-run"}-${target}`);
  const reportRoot = String(args.report || `reports/opt/changes/${label}`);
  await writeJson(`${reportRoot}/merge-plan.json`, { ...plan, database: Boolean(loaded.sql), generatedAt: new Date().toISOString() });
  await writeText(`${reportRoot}/merge-plan.md`, planMarkdown(plan));
  if (apply && plan.missingCategories.length) {
    if (loaded.sql) await loaded.sql.end({ timeout: 5 }).catch(() => {});
    throw new Error(`--apply 拒绝执行：来源分类不存在：${plan.missingCategories.join("、")}`);
  }
  if (apply) await applyPlan({ sql: loaded.sql, plan });
  else if (loaded.sql) await loaded.sql.end({ timeout: 5 }).catch(() => {});

  console.log(JSON.stringify({ status: apply ? "APPLIED" : "DRY_RUN", reportRoot, target, sources: plan.sources, movedPosts: plan.movedPosts, expectedTargetCount: plan.expectedTargetCount, emptyCategories: plan.emptyCategories, snapshotId: plan.snapshotId }, null, 2));
}

await main();
