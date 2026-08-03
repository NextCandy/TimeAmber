import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  HISTORY_ROOT,
  ensureDir,
  getListArg,
  parseArgs,
  readJson,
  round,
  toCsv,
  writeJson,
  writeText,
} from "./lib/common.mjs";

const METRICS = ["firstScreenKB", "totalKB", "LCP", "CLS", "TBT", "imageShare", "requests", "sitemapBytes", "visualDiffRatio"];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseRows(text) {
  return text.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function direction(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return "→";
  const ratio = previous === 0 ? 0 : (current - previous) / Math.abs(previous);
  return ratio > 0.02 ? "↑" : ratio < -0.02 ? "↓" : "→";
}

function series(rows, page, viewport, scenario) {
  return rows
    .filter((row) => (!page || row.page === page) && (!viewport || row.viewport === viewport) && (!scenario || row.scenario === scenario))
    .toSorted((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
}

function chartSvg(rows, metric, threshold = null) {
  const width = 720;
  const height = 190;
  const values = rows.map((row) => Number(row[metric])).filter(Number.isFinite);
  if (!values.length) return `<svg viewBox="0 0 ${width} ${height}" role="img"><text x="16" y="32">暂无 ${escapeHtml(metric)} 数据</text></svg>`;
  const max = Math.max(...values, Number(threshold) || 0, 1);
  const min = Math.min(0, ...values);
  const x = (index) => 24 + (index * (width - 48)) / Math.max(1, rows.length - 1);
  const y = (value) => height - 24 - ((value - min) / Math.max(1, max - min)) * (height - 48);
  const points = rows.map((row, index) => Number.isFinite(Number(row[metric])) ? `${x(index)},${y(Number(row[metric]))}` : "").filter(Boolean).join(" ");
  const thresholdLine = Number.isFinite(Number(threshold)) ? `<line x1="24" y1="${y(Number(threshold))}" x2="${width - 24}" y2="${y(Number(threshold))}" stroke="#d97706" stroke-dasharray="4 4"/><text x="28" y="${Math.max(14, y(Number(threshold)) - 5)}" fill="#b45309">预算 ${threshold}</text>` : "";
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(metric)}趋势"><rect width="100%" height="100%" fill="#fffaf0"/><line x1="24" y1="${height - 24}" x2="${width - 24}" y2="${height - 24}" stroke="#d6d3d1"/>${thresholdLine}<polyline fill="none" stroke="#1d4ed8" stroke-width="2" points="${points}"/><text x="24" y="18" fill="#292524">${escapeHtml(metric)}</text></svg>`;
}

function summaryRows(rows, budget) {
  const output = [];
  for (const metric of METRICS) {
    const values = rows.map((row) => Number(row[metric])).filter(Number.isFinite);
    if (!values.length) continue;
    const current = values.at(-1);
    const previous = values.at(-2);
    const recent = values.slice(-10);
    const threshold = budget?.[metric];
    output.push({
      metric,
      current: round(current, 4),
      previous: round(previous, 4),
      average10: round(recent.reduce((sum, value) => sum + value, 0) / recent.length, 4),
      best: round(Math.min(...values), 4),
      worst: round(Math.max(...values), 4),
      trend: direction(current, previous),
      budget: threshold ?? "",
      slack: Number.isFinite(Number(threshold)) ? round((Number(threshold) - current) / Math.abs(Number(threshold)) * 100, 2) : "",
    });
  }
  return output;
}

function flattenMetricRows(rows) {
  return rows.flatMap((row) => METRICS.map((metric) => ({
    timestamp: row.timestamp,
    commit: row.commit,
    branch: row.branch,
    pr: row.pr,
    title: row.title,
    author: row.author,
    page: row.page,
    viewport: row.viewport,
    scenario: row.scenario,
    dpr: row.dpr,
    metric,
    value: row[metric] ?? "",
    budget: row.budget,
    snapshotId: row.snapshotId,
    reportId: row.reportId,
  })));
}

function groupedRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.page}///${row.viewport}///${row.scenario}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const group of groups.values()) group.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  return groups;
}

function topCostItems(rows) {
  const latest = [...groupedRows(rows).values()].map((group) => group.at(-1)).filter(Boolean);
  const totals = new Map();
  for (const row of latest) {
    for (const item of row.contribution || []) {
      const category = item.category || "其他";
      const current = totals.get(category) || { category, transferKB: 0, groups: 0 };
      current.transferKB += Number(item.transferKB || 0);
      current.groups += 1;
      totals.set(category, current);
    }
  }
  return [...totals.values()]
    .map((item) => ({ ...item, transferKB: round(item.transferKB, 2) }))
    .toSorted((a, b) => b.transferKB - a.transferKB)
    .slice(0, 5);
}

function spikeRows(rows) {
  const spikes = [];
  for (const [groupKey, group] of groupedRows(rows)) {
    for (let index = 1; index < group.length; index += 1) {
      const current = group[index];
      const previous = group[index - 1];
      for (const metric of METRICS) {
        const before = Number(previous[metric]);
        const after = Number(current[metric]);
        if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
        const ratio = Math.abs(after - before) / Math.max(1, Math.abs(before));
        if (ratio > 0.1) spikes.push({ groupKey, timestamp: current.timestamp, commit: current.commit, metric, before, after, ratio: round(ratio, 4), title: current.title || "-" });
      }
    }
  }
  return spikes.toSorted((a, b) => b.ratio - a.ratio);
}

function milestoneRows(rows) {
  const milestones = [];
  for (const [groupKey, group] of groupedRows(rows)) {
    let previousBudget = null;
    let previousSnapshot = "";
    for (const row of group) {
      if (row.snapshotId && row.snapshotId !== previousSnapshot) {
        milestones.push({ groupKey, timestamp: row.timestamp, commit: row.commit, type: "snapshot", value: row.snapshotId });
        previousSnapshot = row.snapshotId;
      }
      if (row.budget === true && previousBudget !== true) {
        milestones.push({ groupKey, timestamp: row.timestamp, commit: row.commit, type: "budget-pass", value: "预算首次通过" });
      }
      previousBudget = row.budget;
    }
  }
  return milestones;
}

function stackedContributionSvg(rows) {
  const width = 720;
  const height = 190;
  const categories = topCostItems(rows).map((item) => item.category);
  if (!categories.length) return `<svg viewBox="0 0 ${width} ${height}" role="img"><text x="16" y="32">暂无资源贡献拆解数据</text></svg>`;
  const palette = ["#1d4ed8", "#0f766e", "#d97706", "#be123c", "#7c3aed"];
  const totals = rows.map((row) => categories.reduce((sum, category) => sum + Number((row.contribution || []).find((item) => item.category === category)?.transferKB || 0), 0));
  const max = Math.max(1, ...totals);
  const x = (index) => 24 + (index * (width - 48)) / Math.max(1, rows.length - 1);
  const y = (value) => height - 24 - (value / max) * (height - 56);
  let lower = rows.map(() => 0);
  const paths = categories.map((category, categoryIndex) => {
    const upper = rows.map((row, index) => lower[index] + Number((row.contribution || []).find((item) => item.category === category)?.transferKB || 0));
    const forward = upper.map((value, index) => `${x(index)},${y(value)}`).join(" L ");
    const backward = lower.map((value, index) => `${x(lower.length - index - 1)},${y(value)}`).join(" L ");
    lower = upper;
    return `<path d="M ${forward} L ${backward} Z" fill="${palette[categoryIndex % palette.length]}" fill-opacity="0.72"/>`;
  }).join("");
  const legend = categories.map((category, index) => `<text x="${28 + index * 132}" y="18" fill="${palette[index % palette.length]}">${escapeHtml(category)}</text>`).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="资源贡献堆叠趋势"><rect width="100%" height="100%" fill="#fffaf0"/><line x1="24" y1="${height - 24}" x2="${width - 24}" y2="${height - 24}" stroke="#d6d3d1"/>${paths}${legend}<text x="24" y="${height - 6}" fill="#78716c">传输 KB · 最近历史</text></svg>`;
}

function renderHtml(data, groups, summaries, topCosts, spikes, milestones) {
  const embedded = JSON.stringify({ data, groups, summaries }).replace(/</g, "\\u003c");
  const sections = groups.map((group) => {
    const rows = group.rows;
    const budget = group.budget;
    const chartMetrics = METRICS.filter((metric) => rows.some((row) => Number.isFinite(Number(row[metric]))));
    return `<section class="group"><h2>${escapeHtml(group.page)} · ${escapeHtml(group.viewport)} · ${escapeHtml(group.scenario)}</h2><div class="charts">${chartMetrics.map((metric) => chartSvg(rows, metric, budget?.[metric])).join("")} ${stackedContributionSvg(rows)}</div><table><thead><tr><th>指标</th><th>当前</th><th>上次</th><th>最近10次均值</th><th>历史最优</th><th>历史最差</th><th>趋势</th><th>预算余量%</th></tr></thead><tbody>${(summaries[group.key] || []).map((item) => `<tr><td>${escapeHtml(item.metric)}</td><td>${item.current}</td><td>${item.previous}</td><td>${item.average10}</td><td>${item.best}</td><td>${item.worst}</td><td>${item.trend}</td><td>${item.slack}</td></tr>`).join("")}</tbody></table></section>`;
  }).join("");
  const topCostTable = topCosts.map((item) => `<tr><td>${escapeHtml(item.category)}</td><td>${item.transferKB}</td><td>${item.groups}</td></tr>`).join("");
  const spikeTable = spikes.slice(0, 20).map((item) => `<tr><td>${escapeHtml(item.timestamp)}</td><td>${escapeHtml(item.groupKey)}</td><td>${escapeHtml(item.metric)}</td><td>${item.before}</td><td>${item.after}</td><td>${(item.ratio * 100).toFixed(1)}%</td><td>${escapeHtml(item.commit)}</td></tr>`).join("");
  const milestoneTable = milestones.map((item) => `<tr><td>${escapeHtml(item.timestamp)}</td><td>${escapeHtml(item.groupKey)}</td><td>${escapeHtml(item.type)}</td><td>${escapeHtml(item.value)}</td><td>${escapeHtml(item.commit)}</td></tr>`).join("");
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>TimeAmber 优化趋势</title><style>body{font:14px/1.6 system-ui,sans-serif;margin:0;background:#f5f5f4;color:#292524}main{max-width:1200px;margin:auto;padding:24px}.download{position:sticky;top:0;background:#fffaf0;padding:12px;border:1px solid #e7e5e4;z-index:2}a{margin-right:16px;color:#1d4ed8}.group,.summary{background:white;border:1px solid #e7e5e4;padding:16px;margin:18px 0}.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:10px}.charts svg{width:100%;height:auto;border:1px solid #e7e5e4}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border-bottom:1px solid #e7e5e4;padding:6px;text-align:right}th:first-child,td:first-child{text-align:left}@media(max-width:600px){main{padding:10px}.charts{display:block}.charts svg{margin-bottom:8px}table{font-size:12px;display:block;overflow:auto}}</style><main><div class="download"><strong>趋势面板</strong>　<a download href="metrics.jsonl">下载原始 JSONL</a><a download href="metrics.csv">下载扁平 CSV</a><a download href="trend-data.json">下载图表数据</a><a download href="top5.json">下载 Top5</a><a download href="spikes.json">下载突变点</a><a download href="milestones.json">下载里程碑</a></div><p>数据只增不删；图表为内联 SVG，可离线打开。</p><section class="summary"><h2>Top 5 资源贡献（最近每组）</h2><table><thead><tr><th>类别</th><th>传输 KB</th><th>覆盖组数</th></tr></thead><tbody>${topCostTable || "<tr><td colspan=\"3\">暂无数据</td></tr>"}</tbody></table></section><section class="summary"><h2>突变点（绝对变化超过 10%）</h2><table><thead><tr><th>时间</th><th>页面/视口/场景</th><th>指标</th><th>改前</th><th>改后</th><th>变化</th><th>提交</th></tr></thead><tbody>${spikeTable || "<tr><td colspan=\"7\">暂无数据</td></tr>"}</tbody></table></section><section class="summary"><h2>里程碑</h2><table><thead><tr><th>时间</th><th>页面/视口/场景</th><th>类型</th><th>值</th><th>提交</th></tr></thead><tbody>${milestoneTable || "<tr><td colspan=\"5\">暂无数据</td></tr>"}</tbody></table></section>${sections}</main><script>window.__TIMEAMBER_TREND__=${embedded};</script></html>`;
}

async function main() {
  const args = parseArgs();
  await ensureDir(HISTORY_ROOT);
  const file = join(HISTORY_ROOT, "metrics.jsonl");
  const rows = (await readFile(file, "utf8").catch(() => ""));
  const all = parseRows(rows);
  const last = Number(args.last || 0);
  const filtered = (last > 0 ? all.slice(-last) : all).filter((row) => (!args.page || row.page === args.page) && (!args.viewport || row.viewport === args.viewport) && (!args.scenario || row.scenario === args.scenario));
  const budget = await readJson(join(HISTORY_ROOT, "effective-budget.json"), {});
  const groups = [];
  const keys = [...new Set(filtered.map((row) => `${row.page}///${row.viewport}///${row.scenario}`))];
  const summaries = {};
  for (const key of keys) {
    const [page, viewport, scenario] = key.split("///");
    const groupRows = filtered.filter((row) => row.page === page && row.viewport === viewport && row.scenario === scenario);
    const groupBudget = budget?.[page]?.[viewport] || {};
    groups.push({ key, page, viewport, scenario, rows: groupRows, budget: groupBudget });
    summaries[key] = summaryRows(groupRows, groupBudget);
  }
  const topCosts = topCostItems(filtered);
  const spikes = spikeRows(filtered);
  const milestones = milestoneRows(filtered);
  const data = { generatedAt: new Date().toISOString(), filters: { last, page: args.page || "", viewport: args.viewport || "", scenario: args.scenario || "" }, rows: filtered };
  await writeJson(join(HISTORY_ROOT, "trend-data.json"), data);
  await writeJson(join(HISTORY_ROOT, "top5.json"), { generatedAt: data.generatedAt, rows: topCosts });
  await writeJson(join(HISTORY_ROOT, "spikes.json"), { generatedAt: data.generatedAt, rows: spikes });
  await writeJson(join(HISTORY_ROOT, "milestones.json"), { generatedAt: data.generatedAt, rows: milestones });
  await writeText(join(HISTORY_ROOT, "metrics.csv"), toCsv(flattenMetricRows(all)));
  await writeText(join(HISTORY_ROOT, "trend.html"), renderHtml(data, groups, summaries, topCosts, spikes, milestones));
  const markdown = [
    "# TimeAmber 性能预算趋势",
    "",
    `- 生成时间：${new Date().toISOString()}`,
    `- 数据条数：${filtered.length}（历史总数 ${all.length}）`,
    "- [trend.html](./trend.html)：可离线打开的内联 SVG 趋势图",
    "- [metrics.jsonl](./metrics.jsonl)：追加式原始记录",
    "- [metrics.csv](./metrics.csv)：全历史扁平 CSV",
    "- [trend-data.json](./trend-data.json)：当前筛选图表数据",
    "- [top5.json](./top5.json)：最近每组 Top 5 资源贡献",
    "- [spikes.json](./spikes.json)：超过 10% 的指标突变点",
    "- [milestones.json](./milestones.json)：预算/快照里程碑",
    "",
    "## 汇总",
    "",
    ...groups.flatMap((group) => [
      `### ${group.page} / ${group.viewport} / ${group.scenario}`,
      "",
      "| 指标 | 当前值 | 上次值 | 最近 10 次均值 | 历史最优 | 历史最差 | 趋势 | 距预算余量% |",
      "| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |",
      ...(summaries[group.key] || []).map((item) => `| ${item.metric} | ${item.current} | ${item.previous} | ${item.average10} | ${item.best} | ${item.worst} | ${item.trend} | ${item.slack} |`),
      "",
    ]),
    "## Top 5 资源贡献",
    "",
    "| 类别 | 传输 KB | 覆盖组数 |",
    "| --- | ---: | ---: |",
    ...topCosts.map((item) => `| ${item.category} | ${item.transferKB} | ${item.groups} |`),
    "",
    "## 突变点",
    "",
    ...(spikes.length ? spikes.slice(0, 50).map((item) => `- ${item.timestamp} ${item.commit} ${item.groupKey}/${item.metric}：${item.before} → ${item.after}（${(item.ratio * 100).toFixed(1)}%），提交「${item.title}」`) : ["- 暂无突变点。"]),
    "",
    "## 里程碑",
    "",
    ...(milestones.length ? milestones.map((item) => `- ${item.timestamp} ${item.commit} ${item.groupKey}：${item.type} = ${item.value}`) : ["- 暂无预算或快照里程碑。"]),
    "",
  ].join("\n");
  await writeText(join(HISTORY_ROOT, "trend.md"), markdown);
  console.log(JSON.stringify({ status: "PASS", historyRows: all.length, filteredRows: filtered.length, groups: groups.length }, null, 2));
}

await main();
