import { copyFile, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

import {
  BASELINE_ROOT,
  DEFAULT_BASE_URL,
  PAGE_DEFINITIONS,
  VISUAL_ROOT,
  SCENARIOS,
  VIEWPORTS,
  createReportDirectory,
  discoverArticlePath,
  ensureDir,
  getListArg,
  hasFlag,
  normalizeUrl,
  nowIso,
  pageDefinition,
  parseArgs,
  redactUrl,
  resolveUrl,
  result,
  safeFileName,
  scenarioFor,
  toCsv,
  writeJson,
  writeText,
} from "./lib/common.mjs";

const ERROR_TEXT = /(?:Application error|Unhandled Error|Internal Server Error|Vite|Webpack|Failed to compile)/i;
const RESOURCE_WAIT_TIMEOUT_MS = Number(process.env.OPT_VISUAL_RESOURCE_TIMEOUT_MS || 5_000);
const NAVIGATION_TIMEOUT_MS = Number(process.env.OPT_VISUAL_NAVIGATION_TIMEOUT_MS || 45_000);
const SCREENSHOT_TIMEOUT_MS = Number(process.env.OPT_VISUAL_SCREENSHOT_TIMEOUT_MS || 30_000);
const SENSITIVE_REPORT_KEY = /(?:access[_-]?token|api[_-]?key|authorization|cookie|password|private[_-]?key|secret|session|signature|token)/i;

function sanitizeVisualReport(value, key = "") {
  if (SENSITIVE_REPORT_KEY.test(key)) return "[redacted]";
  if (typeof value === "string") return value.replace(/https?:\/\/[^\s"'<>]+/gi, (match) => redactUrl(match));
  if (Array.isArray(value)) return value.map((item) => sanitizeVisualReport(item, key));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, sanitizeVisualReport(childValue, childKey)]));
  return value;
}

function viewportNames(args) {
  const value = getListArg(args, "viewport", Object.keys(VIEWPORTS));
  return value.filter((name) => VIEWPORTS[name]);
}

function scenarioNames(args) {
  if (hasFlag(args, "all-scenarios") || args.scenario === "all") return Object.keys(SCENARIOS);
  return getListArg(args, "scenario", ["fast"]).filter((name) => SCENARIOS[name]);
}

async function applyLogin(page, baseUrl, targetPath) {
  const storageState = process.env.OPT_ADMIN_STORAGE_STATE;
  if (storageState) return { status: "PASS", source: "storage-state" };
  const email = process.env.OPT_ADMIN_EMAIL;
  const password = process.env.OPT_ADMIN_PASSWORD;
  if (!email || !password) return { status: "SKIP", reason: "未提供 OPT_ADMIN_STORAGE_STATE 或管理员环境变量" };
  const loginUrl = `${resolveUrl(baseUrl, "/auth")}?redirect=${encodeURIComponent(targetPath)}`;
  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (page.url().includes("/admin")) return { status: "PASS", source: "existing-session" };
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /登录/ }).click();
  try {
    await page.waitForURL(/\/admin(?:\/|$)/, { timeout: 30_000 });
  } catch {
    return { status: "FAIL", reason: "管理员登录后未进入后台" };
  }
  return { status: "PASS", source: "environment" };
}

async function configureScenario(page, scenario) {
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  if (scenario.mode === "second-visit") {
    await session.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  } else if (scenario.download > 0 || scenario.latency > 0) {
    await session.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: scenario.latency,
      downloadThroughput: (scenario.download * 1024) / 8,
      uploadThroughput: (scenario.upload * 1024) / 8,
    });
  }
  await session.send("Emulation.setCPUThrottlingRate", { rate: scenario.cpu || 1 });
  return session;
}

async function waitForImages(page, { visibleOnly = true, timeoutMs = RESOURCE_WAIT_TIMEOUT_MS } = {}) {
  return page.evaluate(async ({ visibleOnly, timeoutMs }) => {
    const images = [...document.images].filter((image) => {
      if (!visibleOnly) return true;
      const rect = image.getBoundingClientRect();
      return rect.bottom >= 0 && rect.right >= 0 && rect.top <= innerHeight && rect.left <= innerWidth;
    });
    const statuses = await Promise.all(images.map((image) => new Promise((resolve) => {
      if (image.complete) return resolve("complete");
      let finished = false;
      const finish = (status) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        image.removeEventListener("load", onLoad);
        image.removeEventListener("error", onError);
        resolve(status);
      };
      const onLoad = () => finish("loaded");
      const onError = () => finish("error");
      const timer = setTimeout(() => finish("timeout"), timeoutMs);
      image.addEventListener("load", onLoad, { once: true });
      image.addEventListener("error", onError, { once: true });
    })));
    const decodeStatuses = await Promise.all(images.map((image) => {
      if (typeof image.decode !== "function") return Promise.resolve("unavailable");
      return Promise.race([
        image.decode().then(() => "decoded").catch(() => "error"),
        new Promise((resolve) => setTimeout(() => resolve("timeout"), timeoutMs)),
      ]);
    }));
    return { total: images.length, complete: statuses.filter((status) => status === "complete").length, loaded: statuses.filter((status) => status === "loaded").length, errors: statuses.filter((status) => status === "error").length, timedOut: statuses.filter((status) => status === "timeout").length, decoded: decodeStatuses.filter((status) => status === "decoded").length, decodeErrors: decodeStatuses.filter((status) => status === "error").length, decodeTimedOut: decodeStatuses.filter((status) => status === "timeout").length };
  }, { visibleOnly, timeoutMs });
}

async function stabilize(page) {
  await page.addStyleTag({
    content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}html{scroll-behavior:auto!important}",
  }).catch(() => {});
  await page.evaluate(() => {
    Math.random = () => 0.5;
    const original = Date;
    // Keep the application deterministic while preserving Date.parse and Date.UTC.
    // The fixed instant is only used by the test context and never written to the app.
    // @ts-ignore
    window.Date = class extends original {
      constructor(...args) { super(args.length ? args[0] : "2026-01-01T00:00:00.000Z"); }
      static now() { return 1767225600000; }
    };
  }).catch(() => {});
  await page.evaluate(() => {
    for (const image of document.images) {
      if (image.loading === "lazy") image.loading = "eager";
    }
  }).catch(() => {});
  const fontStatus = await Promise.race([
    page.evaluate(async () => {
      if (!document.fonts?.ready) return "unavailable";
      await document.fonts.ready;
      return "ready";
    }).catch(() => "unavailable"),
    page.waitForTimeout(RESOURCE_WAIT_TIMEOUT_MS).then(() => "timeout"),
  ]);
  const imageStatus = await waitForImages(page, { visibleOnly: false }).catch((error) => ({ total: 0, complete: 0, loaded: 0, errors: 0, timedOut: 0, error: String(error) }));
  await page.waitForTimeout(150);
  return { fontStatus, imageStatus };
}

async function captureSegments(page, directory, key) {
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollHeight: document.documentElement.scrollHeight }));
  const segmentCount = Math.max(1, Math.ceil(viewport.scrollHeight / viewport.height));
  const files = [];
  const resourceWaits = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const y = Math.min(index * viewport.height, Math.max(0, viewport.scrollHeight - viewport.height));
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(75);
    resourceWaits.push(await waitForImages(page).catch((error) => ({ total: 0, complete: 0, loaded: 0, errors: 0, timedOut: 0, error: String(error) })));
    const file = `${directory}/segment-${String(index).padStart(3, "0")}.png`;
    await page.screenshot({ path: file, fullPage: false, timeout: SCREENSHOT_TIMEOUT_MS });
    console.log(`[opt:visual] captured ${key}/segment-${String(index).padStart(3, "0")}`);
    files.push({ key: `${key}/segment-${String(index).padStart(3, "0")}`, file, index, y });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  const first = files[0]?.file;
  if (first) await copyFile(first, `${directory}/first.png`);
  return { files, first: first ? `${directory}/first.png` : "", segmentCount, scrollHeight: viewport.scrollHeight, resourceWaits };
}

async function inspectPage(page) {
  return page.evaluate(() => ({
    title: document.title,
    textLength: (document.body?.innerText || "").trim().length,
    bodyHeight: document.documentElement.scrollHeight,
    imageCount: document.images.length,
    images: [...document.images].map((image) => ({
      src: image.currentSrc || image.src,
      alt: image.getAttribute("alt"),
      width: image.getAttribute("width"),
      height: image.getAttribute("height"),
      renderedWidth: Math.round(image.getBoundingClientRect().width),
      renderedHeight: Math.round(image.getBoundingClientRect().height),
    })),
  }));
}

async function readPng(file) {
  return PNG.sync.read(await readFile(file));
}

async function writeDiff(currentFile, baselineFile, diffFile, triadFile, allowedRatio = 0.001) {
  const current = await readPng(currentFile);
  const baseline = await readPng(baselineFile);
  if (current.width !== baseline.width || current.height !== baseline.height) {
    return { status: "FAIL", reason: "截图尺寸不一致", diffPixels: null, ratio: 1 };
  }
  const diff = new PNG({ width: current.width, height: current.height });
  const diffPixels = pixelmatch(baseline.data, current.data, diff.data, current.width, current.height, {
    threshold: 0.1,
    includeAA: false,
  });
  await writeFile(diffFile, PNG.sync.write(diff));
  const triad = new PNG({ width: current.width * 3, height: current.height });
  for (let y = 0; y < current.height; y += 1) {
    for (let x = 0; x < current.width; x += 1) {
      const source = (y * current.width + x) * 4;
      const left = (y * triad.width + x) * 4;
      const middle = (y * triad.width + current.width + x) * 4;
      const right = (y * triad.width + current.width * 2 + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        triad.data[left + channel] = baseline.data[source + channel];
        triad.data[middle + channel] = current.data[source + channel];
        triad.data[right + channel] = diff.data[source + channel];
      }
    }
  }
  await writeFile(triadFile, PNG.sync.write(triad));
  const ratio = current.width * current.height ? diffPixels / (current.width * current.height) : 1;
   return { status: ratio <= allowedRatio ? "PASS" : "FAIL", diffPixels, ratio, allowedRatio, width: current.width, height: current.height };
}

function reportMarkdown({ label, baseUrl, records, accepted }) {
  const pages = [...new Set(records.map((record) => record.page))];
  const viewports = [...new Set(records.map((record) => record.viewport))];
  const matrix = viewports.map((viewport) => {
    const cells = pages.map((page) => {
      const items = records.filter((record) => record.viewport === viewport && record.page === page);
      const ratio = items.length ? Math.max(...items.map((item) => item.diffRatio || 0)) : 0;
      const status = items.some((item) => item.status === "FAIL") ? "FAIL" : items.some((item) => item.status === "WARN") ? "WARN" : "PASS";
      return `${page}: ${status} (${(ratio * 100).toFixed(3)}%)`;
    });
    return `| ${viewport} | ${cells.join(" | ")} |`;
  });
  const summary = viewports.map((viewport) => {
    const items = records.filter((record) => record.viewport === viewport);
    const average = items.length ? items.reduce((sum, item) => sum + (item.diffRatio || 0), 0) / items.length : 0;
    const max = items.toSorted((a, b) => (b.diffRatio || 0) - (a.diffRatio || 0))[0];
    return `| ${viewport} | ${items.length} | ${items.filter((item) => item.status === "PASS").length} | ${items.filter((item) => item.status === "WARN").length} | ${items.filter((item) => item.status === "FAIL").length} | ${(average * 100).toFixed(3)}% | ${max?.page || "-"} |`;
  });
  return [
    `# 视觉回归报告：${label}`,
    "",
    `- 时间：${nowIso()}`,
    `- 基础 URL：${baseUrl}`,
    `- 接受基线：${accepted ? "是" : "否"}`,
    `- 记录数：${records.length}`,
    "",
    "## 原始数据下载",
    "",
    "- [raw.json](./raw.json)：截图、页面检查和差异原始数据",
    "- [visual-diff.csv](./visual-diff.csv)：每张截图的像素差异和坐标证据",
    "",
    "## 视口 × 页面矩阵",
    "",
    `| 视口 | ${pages.join(" | ")} |`,
    `| --- | ${pages.map(() => "---").join(" | ")} |`,
    ...matrix,
    "",
    "## 按视口汇总",
    "",
    "| 视口 | 截图数 | 通过 | 需人工确认 | 失败 | 平均差异占比 | 最大差异页面 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ...summary,
    "",
    "## 失败与人工确认",
    "",
     ...records.filter((record) => record.status !== "PASS").map((record) => `- **${record.status}** ${record.page}/${record.viewport}/${record.scenario}/${record.artifact}: ${record.reason || (Number.isFinite(record.diffRatio) ? `${(record.diffRatio * 100).toFixed(3)}%` : "未生成差异")}`),
    records.every((record) => record.status === "PASS") ? "- 无。" : "",
    "",
  ].join("\n");
}

async function main() {
  const args = parseArgs();
  const label = String(args.label || "before");
  const baseUrl = String(args["base-url"] || process.env.OPT_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const pages = (getListArg(args, "page", Object.keys(PAGE_DEFINITIONS))).map((name) => pageDefinition(name) || { name, key: safeFileName(name), path: name, public: true });
  const viewports = viewportNames(args);
  const scenarios = scenarioNames(args);
  const reportDir = await createReportDirectory(label, VISUAL_ROOT);
  const records = [];
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.OPT_CHROME_PATH || chromium.executablePath() });
  } catch (error) {
    const record = { status: "FAIL", page: "all", viewport: "all", scenario: "all", artifact: "browser", reason: `Chromium 启动失败: ${String(error)}` };
    records.push(record);
    const raw = sanitizeVisualReport({ label, baseUrl, records, generatedAt: nowIso() });
    await writeJson(`${reportDir}/raw.json`, raw);
    await writeText(`${reportDir}/report.md`, reportMarkdown({ label, baseUrl: raw.baseUrl, records: raw.records, accepted: false }));
    process.exitCode = 1;
    return;
  }

  for (const pageDefinitionValue of pages) {
    const path = pageDefinitionValue.article ? await discoverArticlePath(baseUrl, args.article || "") : pageDefinitionValue.path;
    for (const viewportName of viewports) {
      for (const scenarioName of scenarios) {
        const viewport = VIEWPORTS[viewportName];
        const scenario = scenarioFor(scenarioName);
        const artifactKey = `${safeFileName(pageDefinitionValue.name)}/${viewportName}/${scenarioName}`;
        const directory = `${reportDir}/${artifactKey}`;
        await ensureDir(directory);
        const contextOptions = {
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: scenario.dpr || viewport.dpr || 1,
          isMobile: viewport.mobile,
          hasTouch: viewport.mobile,
          userAgent: viewport.mobile ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1" : undefined,
          storageState: process.env.OPT_ADMIN_STORAGE_STATE || undefined,
        };
        const context = await browser.newContext(contextOptions);
        const page = await context.newPage();
        const consoleMessages = [];
        const pageErrors = [];
        const failedRequests = [];
        page.on("console", (message) => { if (["error", "warning"].includes(message.type())) consoleMessages.push({ type: message.type(), text: message.text() }); });
        page.on("pageerror", (error) => pageErrors.push(String(error)));
        page.on("requestfailed", (request) => failedRequests.push({ url: redactUrl(request.url()), error: request.failure()?.errorText || "unknown" }));
        const record = { page: pageDefinitionValue.name, viewport: viewportName, scenario: scenarioName, artifact: artifactKey, url: resolveUrl(baseUrl, path), consoleMessages, pageErrors, failedRequests, screenshots: [], status: "PASS" };
        try {
          await configureScenario(page, scenario);
           console.log(`[opt:visual] navigating ${artifactKey}`);
           await page.goto(record.url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
          if (pageDefinitionValue.admin && page.url().includes("/auth")) {
            const login = await applyLogin(page, baseUrl, path);
            if (login.status !== "PASS") {
              record.status = hasFlag(args, "allow-missing-admin") ? "SKIP" : login.status;
              record.reason = login.reason;
            }
          }
          if (record.status === "PASS") {
             record.stabilize = await stabilize(page);
             console.log(`[opt:visual] stabilized ${artifactKey}`);
             const inspection = await inspectPage(page);
            record.inspection = inspection;
            record.url = page.url();
            if (inspection.textLength < 20) {
              record.status = "FAIL";
              record.reason = "页面主体为空或内容不足";
            } else if (ERROR_TEXT.test(await page.locator("body").innerText())) {
              record.status = "FAIL";
              record.reason = "页面包含框架或服务端错误提示";
            }
             const capture = await captureSegments(page, directory, artifactKey);
            record.screenshots = capture.files.map((item) => ({ file: item.file, index: item.index, y: item.y }));
            record.first = capture.first;
            record.segmentCount = capture.segmentCount;
             record.scrollHeight = capture.scrollHeight;
             record.resourceWaits = capture.resourceWaits;
          }
        } catch (error) {
          record.status = "FAIL";
          record.reason = String(error);
        }

        if (record.status === "PASS" && record.screenshots.length) {
          const accepted = hasFlag(args, "accept");
          for (const screenshot of record.screenshots) {
            const baseline = `${BASELINE_ROOT}/${artifactKey}/segment-${String(screenshot.index).padStart(3, "0")}.png`;
            await ensureDir(`${BASELINE_ROOT}/${artifactKey}`);
            let diff;
             const { fileExists } = await import("./lib/common.mjs");
             if (accepted || !(await fileExists(baseline))) {
              await copyFile(screenshot.file, baseline);
              diff = { status: "PASS", diffPixels: 0, ratio: 0, accepted: true };
            } else {
              const diffFile = `${directory}/diff-${String(screenshot.index).padStart(3, "0")}.png`;
              const triadFile = `${directory}/triad-${String(screenshot.index).padStart(3, "0")}.png`;
               diff = await writeDiff(screenshot.file, baseline, diffFile, triadFile, viewport.mobile ? 0.0015 : 0.001);
              if (diff.status === "FAIL") record.status = "FAIL";
              screenshot.baseline = baseline;
              screenshot.diff = diffFile;
              screenshot.triad = triadFile;
            }
            screenshot.diffPixels = diff.diffPixels;
            screenshot.diffRatio = diff.ratio;
            screenshot.status = diff.status;
            record.diffRatio = Math.max(record.diffRatio || 0, diff.ratio || 0);
            if (diff.accepted) record.accepted = true;
          }
        }
        if (record.consoleMessages.some((message) => message.type === "error") || record.pageErrors.length) {
          record.status = record.status === "FAIL" ? "FAIL" : "WARN";
          record.reason ||= "检测到浏览器控制台或页面错误";
        }
        records.push(record);
        await context.close();
      }
    }
  }
  await browser.close();

  const accepted = hasFlag(args, "accept");
  const raw = sanitizeVisualReport({ label, baseUrl, pages, viewports, scenarios, generatedAt: nowIso(), records });
  await writeJson(`${reportDir}/raw.json`, raw);
  const diffRows = records.flatMap((record) => (record.screenshots || []).map((screenshot) => ({
    page: record.page,
    viewport: record.viewport,
    scenario: record.scenario,
    screenshot: screenshot.index,
    pixels: screenshot.diffPixels,
    ratio: screenshot.diffRatio,
    status: screenshot.status,
    baseline: screenshot.baseline || "",
    current: record.first || "",
  })));
  await writeText(`${reportDir}/visual-diff.csv`, toCsv(diffRows, ["page", "viewport", "scenario", "screenshot", "pixels", "ratio", "status", "baseline", "current"]));
  await writeText(`${reportDir}/report.md`, reportMarkdown({ label, baseUrl: raw.baseUrl, records: raw.records, accepted }));
  const failure = records.some((record) => record.status === "FAIL");
  if (failure) process.exitCode = 1;
  console.log(JSON.stringify({ reportDir, status: failure ? "FAIL" : "PASS", records: records.length }, null, 2));
}

await main();
