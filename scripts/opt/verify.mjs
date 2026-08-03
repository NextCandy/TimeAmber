import { appendFile, copyFile, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

import {
  DEFAULT_BASE_URL,
  HISTORY_ROOT,
  PAGE_DEFINITIONS,
  PROJECT_ROOT,
  REPORTS_ROOT,
  SCENARIOS,
  VIEWPORTS,
  classifyResource,
  createReportDirectory,
  discoverArticlePath,
  ensureDir,
  fileExists,
  fetchWithTimeout,
  getListArg,
  getFileSize,
  gitMetadata,
  hasFlag,
  isSameOrigin,
  isThirdParty,
  median,
  normalizeUrl,
  nowIso,
  pageDefinition,
  parseArgs,
  readJson,
  pct,
  redactUrl,
  resolveUrl,
  result,
  round,
  safeFileName,
  shouldFail,
  statusRank,
  toCsv,
  writeJson,
  writeText,
} from "./lib/common.mjs";
import { validateJsonLd } from "./lib/schema.mjs";
import { validateSitemap } from "./lib/sitemap.mjs";

const METRICS = ["firstScreenKB", "totalKB", "LCP", "CLS", "TBT", "imageShare", "requests"];
const LIGHTHOUSE_PAGES = new Set(["首页", "文章页", "后台文章列表"]);
const STATIC_SITEMAP_PATHS = ["/", "/archive", "/categories", "/about", "/friends"];
const RESPONSE_BODY_TIMEOUT_MS = Number(process.env.OPT_RESPONSE_BODY_TIMEOUT_MS || 5_000);

function readResponseBodySize(response, contentLength) {
  if (contentLength > 0) return Promise.resolve(contentLength);
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(0);
    }, RESPONSE_BODY_TIMEOUT_MS);
    try {
      response.body().then((body) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(body.length);
      }).catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(0);
      });
    } catch {
      settled = true;
      clearTimeout(timer);
      resolve(0);
    }
  });
}

async function waitForBrowserResources(page) {
  return page.evaluate(async (timeoutMs) => {
    const fontWait = document.fonts?.ready
      ? Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, timeoutMs))])
      : Promise.resolve();
    const images = [...document.images].filter((image) => {
      const rect = image.getBoundingClientRect();
      return rect.bottom >= 0 && rect.right >= 0 && rect.top <= innerHeight && rect.left <= innerWidth;
    });
    const imageStatuses = await Promise.all(images.map((image) => new Promise((resolve) => {
      if (image.complete) return resolve("complete");
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve("timeout");
      }, timeoutMs);
      const finish = (status) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        image.removeEventListener("load", onLoad);
        image.removeEventListener("error", onError);
        resolve(status);
      };
      const onLoad = () => finish("loaded");
      const onError = () => finish("error");
      image.addEventListener("load", onLoad, { once: true });
      image.addEventListener("error", onError, { once: true });
    })));
    await fontWait;
    return { visibleImages: images.length, complete: imageStatuses.filter((status) => status === "complete").length, loaded: imageStatuses.filter((status) => status === "loaded").length, errors: imageStatuses.filter((status) => status === "error").length, timedOut: imageStatuses.filter((status) => status === "timeout").length };
  }, RESPONSE_BODY_TIMEOUT_MS);
}

function viewportMode(name) {
  if (name === "mobile" || name.startsWith("mobile") || name === "tablet-768") return "mobile";
  return "desktop";
}

function requestedViewportModes(args) {
  const requested = getListArg(args, "viewport", ["mobile", "desktop"]);
  const modes = new Set();
  for (const name of requested) {
    if (name === "all") {
      modes.add("mobile");
      modes.add("desktop");
    } else if (VIEWPORTS[name]) modes.add(viewportMode(name));
    else if (name === "mobile" || name === "desktop") modes.add(name);
  }
  return [...modes];
}

function pageNames(args) {
  return getListArg(args, "page", Object.keys(PAGE_DEFINITIONS)).map((name) => pageDefinition(name) || {
    name,
    key: safeFileName(name),
    path: name,
    public: true,
  });
}

function sanitizeOrigin(value) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return String(value).replace(/([?&](?:token|key|secret|password|auth)=)[^&]*/gi, "$1[redacted]");
  }
}

const SENSITIVE_REPORT_KEY = /(?:access[_-]?token|api[_-]?key|authorization|cookie|password|private[_-]?key|secret|session|signature|token)/i;

function redactReportText(value) {
  const text = String(value);
  try {
    return redactUrl(text);
  } catch {
    return text;
  }
}

function sanitizeReportValue(value, key = "") {
  if (SENSITIVE_REPORT_KEY.test(key)) return "[redacted]";
  if (typeof value === "string") {
    const direct = redactReportText(value);
    return direct.replace(/https?:\/\/[^\s"'<>]+/gi, (match) => redactUrl(match));
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeReportValue(item, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, sanitizeReportValue(childValue, childKey)]));
  }
  return value;
}

function metricsFromLhr(lhr) {
  const audit = (id) => lhr?.audits?.[id]?.numericValue;
  const score = (category) => {
    const value = lhr?.categories?.[category]?.score;
    return Number.isFinite(value) ? round(value * 100, 1) : null;
  };
  return {
    LCP: audit("largest-contentful-paint"),
    CLS: audit("cumulative-layout-shift"),
    TBT: audit("total-blocking-time"),
    scores: {
      performance: score("performance"),
      accessibility: score("accessibility"),
      bestPractices: score("best-practices"),
      seo: score("seo"),
    },
  };
}

function htmlImageUrl(src, pageUrl) {
  try {
    return new URL(src, pageUrl).toString();
  } catch {
    return String(src);
  }
}

function makeSelector(element) {
  if (!element) return "";
  if (element.dataset?.testid) return `[data-testid="${element.dataset.testid}"]`;
  if (element.id) return `#${element.id}`;
  const classes = [...element.classList].filter((name) => /^[a-zA-Z0-9_-]+$/.test(name)).slice(0, 3);
  return `${element.tagName.toLowerCase()}${classes.length ? `.${classes.join(".")}` : ""}`;
}

async function collectBrowserPage({ browser, baseUrl, pageInfo, path, viewportModeValue, scenarioName }) {
  const viewportName = viewportModeValue === "mobile" ? "mobile-390" : "desktop-1440";
  const viewport = VIEWPORTS[viewportName];
  const scenario = SCENARIOS[scenarioName] || SCENARIOS.fast;
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: scenario.dpr || 1,
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
    userAgent: viewport.mobile ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1" : undefined,
    storageState: process.env.OPT_ADMIN_STORAGE_STATE || undefined,
  });
  const page = await context.newPage();
  const responses = [];
  const consoleMessages = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleMessages.push({ type: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("requestfailed", (request) => failedRequests.push({ url: redactUrl(request.url()), error: request.failure()?.errorText || "unknown" }));
  page.on("response", (response) => {
    const request = response.request();
    const contentLength = Number(response.headers()["content-length"] || 0);
    responses.push({
      url: response.url(),
      status: response.status(),
      type: request.resourceType(),
      contentType: response.headers()["content-type"] || "",
      contentLength,
      body: readResponseBodySize(response, contentLength),
      timing: request.timing(),
    });
  });
  await page.addInitScript(() => {
    window.__optMetrics = { lcp: null, layoutShifts: [] };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const element = entry.element;
          window.__optMetrics.lcp = {
            startTime: entry.startTime,
            size: entry.size,
            url: entry.url || "",
            element: element ? {
              selector: element.id ? `#${element.id}` : element.dataset?.testid ? `[data-testid="${element.dataset.testid}"]` : element.tagName.toLowerCase(),
              tag: element.tagName,
              text: (element.textContent || "").slice(0, 120),
            } : null,
          };
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {}
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue;
          window.__optMetrics.layoutShifts.push({
            value: entry.value,
            sources: (entry.sources || []).map((source) => ({
              selector: source.node?.id ? `#${source.node.id}` : source.node?.dataset?.testid ? `[data-testid="${source.node.dataset.testid}"]` : source.node?.tagName?.toLowerCase() || "",
              nodeLabel: source.node?.textContent?.slice(0, 120) || "",
            })),
          });
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {}
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  if (scenario.download > 0 || scenario.latency > 0) {
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: scenario.latency,
      downloadThroughput: (scenario.download * 1024) / 8,
      uploadThroughput: (scenario.upload * 1024) / 8,
    });
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: scenario.cpu || 1 });

  const record = {
    page: pageInfo.name,
    path,
    viewport: viewportModeValue,
    viewportName,
    scenario: scenarioName,
    url: resolveUrl(baseUrl, path),
    status: "PASS",
  };
  try {
    await page.goto(record.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    record.redirectedUrl = page.url();
    await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" }).catch(() => {});
    record.resourceWait = await waitForBrowserResources(page).catch((error) => ({ error: String(error) }));
    await page.waitForTimeout(200);
    const inspection = await page.evaluate(() => {
      const performanceEntries = performance.getEntriesByType("resource").map((entry) => ({
        name: entry.name,
        transferSize: entry.transferSize || 0,
        encodedBodySize: entry.encodedBodySize || 0,
        decodedBodySize: entry.decodedBodySize || 0,
        startTime: entry.startTime,
        responseEnd: entry.responseEnd,
        initiatorType: entry.initiatorType,
      }));
      const opt = window.__optMetrics || { lcp: null, layoutShifts: [] };
      const images = [...document.images].map((image) => ({
        src: image.currentSrc || image.src,
        alt: image.getAttribute("alt"),
        width: image.getAttribute("width"),
        height: image.getAttribute("height"),
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        renderedWidth: Math.round(image.getBoundingClientRect().width),
        renderedHeight: Math.round(image.getBoundingClientRect().height),
      }));
      return {
        title: document.title,
        textLength: (document.body?.innerText || "").trim().length,
        bodyHeight: document.documentElement.scrollHeight,
        performanceEntries,
        lcp: opt.lcp,
        layoutShifts: opt.layoutShifts,
        images,
        bodyText: (document.body?.innerText || "").slice(0, 400),
      };
    });
    record.inspection = inspection;
    record.resources = await Promise.all(responses.map(async (item) => ({
      url: redactUrl(item.url),
    rawUrl: item.url,
      status: item.status,
      requestType: item.type,
      contentType: item.contentType,
      transferBytes: Math.max(item.contentLength || 0, await item.body),
      thirdParty: isThirdParty(item.url, baseUrl),
      category: classifyResource(item.url, item.contentType),
      timing: item.timing,
    })));
    const timingByUrl = new Map(inspection.performanceEntries.map((entry) => [entry.name, entry]));
    const lcpStart = Number(inspection.lcp?.startTime || 2500);
    record.resources = record.resources.map((resource) => {
      const timing = timingByUrl.get(resource.rawUrl);
      const { rawUrl: _rawUrl, ...safeResource } = resource;
      return {
        ...safeResource,
        firstScreen: Boolean(timing && timing.responseEnd <= lcpStart),
        transferBytes: Math.max(resource.transferBytes, timing?.transferSize || 0),
      };
    });
    const totalBytes = record.resources.reduce((sum, resource) => sum + resource.transferBytes, 0);
    const firstScreenBytes = record.resources.filter((resource) => resource.firstScreen).reduce((sum, resource) => sum + resource.transferBytes, 0);
    const imageBytes = record.resources.filter((resource) => resource.category === "图片").reduce((sum, resource) => sum + resource.transferBytes, 0);
    record.metrics = {
      firstScreenKB: round(firstScreenBytes / 1024, 2),
      totalKB: round(totalBytes / 1024, 2),
      imageShare: totalBytes ? round(imageBytes / totalBytes, 4) : 0,
      requests: record.resources.length,
      browserLCP: inspection.lcp?.startTime || null,
      browserCLS: round(inspection.layoutShifts.reduce((sum, entry) => sum + Number(entry.value || 0), 0), 4),
    };
    record.imageHealth = {
      total: inspection.images.length,
      missingAlt: inspection.images.filter((image) => image.alt === null).map((image) => image.src),
      missingDimensions: inspection.images.filter((image) => image.width === null || image.height === null).map((image) => image.src),
      nonModern: inspection.images.filter((image) => !/\.(?:avif|webp|svg)(?:[?#]|$)/i.test(image.src || "") && !/^data:image\/svg/i.test(image.src || "")).map((image) => image.src),
      broken: record.resources.filter((resource) => resource.status >= 400 && resource.category === "图片").map((resource) => ({ url: resource.url, status: resource.status })),
    };
    record.contribution = Object.values(record.resources.reduce((groups, resource) => {
      const category = resource.thirdParty ? "第三方" : resource.category;
      groups[category] ||= { category, requests: 0, transferKB: 0, firstScreenKB: 0, thirdPartyRequests: 0 };
      groups[category].requests += 1;
      groups[category].transferKB += resource.transferBytes / 1024;
      groups[category].firstScreenKB += resource.firstScreen ? resource.transferBytes / 1024 : 0;
      groups[category].thirdPartyRequests += resource.thirdParty ? 1 : 0;
      return groups;
    }, {})).map((item) => ({
      ...item,
      transferKB: round(item.transferKB, 2),
      firstScreenKB: round(item.firstScreenKB, 2),
      share: totalBytes ? round((item.transferKB * 1024) / totalBytes, 4) : 0,
    }));
    record.consoleMessages = consoleMessages;
    record.pageErrors = pageErrors;
    record.failedRequests = failedRequests;
    if (record.inspection.textLength < 20) {
      record.status = "FAIL";
      record.reason = "页面主体为空或内容不足";
    }
    if (record.redirectedUrl.includes("/auth") && pageInfo.admin) {
      record.status = hasFlag(parseArgs(), "allow-missing-admin") ? "SKIP" : "FAIL";
      record.reason = "后台测试会话未生效";
    }
    if (consoleMessages.some((message) => message.type === "error") || pageErrors.length) {
      record.status = record.status === "FAIL" ? "FAIL" : "WARN";
      record.reason ||= "检测到浏览器控制台或页面错误";
    }
  } catch (error) {
    record.status = "FAIL";
    record.reason = String(error);
  } finally {
    await context.close();
  }
  return record;
}

async function runLighthouse({ reportDir, url, mode, label, runIndex = 1 }) {
  const file = join(reportDir, `lighthouse-${safeFileName(label)}-${mode}-run${runIndex}.json`);
  const cli = join(PROJECT_ROOT, "node_modules", "lighthouse", "cli", "index.js");
  const args = [
    cli,
    url,
    "--quiet",
    "--output=json",
    `--output-path=${file}`,
    "--only-categories=performance,accessibility,best-practices,seo",
    `--form-factor=${mode}`,
    "--throttling-method=devtools",
    `--screenEmulation.mobile=${mode === "mobile"}`,
    `--screenEmulation.width=${mode === "mobile" ? 390 : 1440}`,
    `--screenEmulation.height=${mode === "mobile" ? 844 : 900}`,
    "--screenEmulation.deviceScaleFactor=1",
    "--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage",
  ];
  const { runProcess } = await import("./lib/common.mjs");
  const processResult = await runProcess(process.execPath, args, {
    cwd: PROJECT_ROOT,
    timeoutMs: 180_000,
    env: { CHROME_PATH: process.env.OPT_CHROME_PATH || chromium.executablePath() },
  });
  if (processResult.code !== 0 || !(await fileExists(file))) {
    return { status: "FAIL", mode, url: redactUrl(url), error: processResult.stderr.slice(-3000), exitCode: processResult.code };
  }
  try {
    const lhr = JSON.parse(await readFile(file, "utf8"));
    return { status: "PASS", mode, url: redactUrl(url), lhr, metrics: metricsFromLhr(lhr) };
  } catch (error) {
    return { status: "FAIL", mode, url: redactUrl(url), error: `Lighthouse JSON 不可解析: ${String(error)}` };
  }
}

async function runLighthouseMedian({ reportDir, url, mode, label }) {
  const attempts = [];
  for (let runIndex = 1; runIndex <= 3; runIndex += 1) {
    attempts.push(await runLighthouse({ reportDir, url, mode, label, runIndex }));
  }
  const passed = attempts.filter((attempt) => attempt.status === "PASS");
  if (!passed.length) return { status: "FAIL", mode, url: redactUrl(url), attempts, error: attempts.map((attempt) => attempt.error).filter(Boolean).join("；") };
  const metrics = {
    LCP: median(passed.map((attempt) => attempt.metrics.LCP)),
    CLS: median(passed.map((attempt) => attempt.metrics.CLS)),
    TBT: median(passed.map((attempt) => attempt.metrics.TBT)),
    scores: {
      performance: median(passed.map((attempt) => attempt.metrics.scores.performance)),
      accessibility: median(passed.map((attempt) => attempt.metrics.scores.accessibility)),
      bestPractices: median(passed.map((attempt) => attempt.metrics.scores.bestPractices)),
      seo: median(passed.map((attempt) => attempt.metrics.scores.seo)),
    },
  };
  return { status: passed.length === 3 ? "PASS" : "WARN", mode, url: redactUrl(url), attempts, metrics, lhr: passed[Math.floor(passed.length / 2)].lhr, runs: passed.length };
}

async function loadBudget() {
  const configured = JSON.parse(await readFile(join(PROJECT_ROOT, "scripts", "opt", "perf-budget.json"), "utf8"));
  const effectiveFile = join(HISTORY_ROOT, "effective-budget.json");
  const effective = await import("./lib/common.mjs").then((module) => module.readJson(effectiveFile, null));
  return { configured, effective, effectiveFile };
}

function budgetFor(config, page, mode, metric) {
  return config?.[page]?.[mode]?.[metric] ?? null;
}

function budgetCheck(metric, actual, budget, baseline) {
  if (!Number.isFinite(actual) || !Number.isFinite(budget)) return result("SKIP", `${metric} 无可用预算或实测值`, { metric, actual, budget });
  if (baseline) return result("PASS", `${metric} 基线已记录`, { metric, actual, budget, baseline: true });
  const difference = actual - budget;
  const ratio = budget === 0 ? (difference > 0 ? 1 : 0) : difference / Math.abs(budget);
  const status = ratio > 0.05 ? "FAIL" : ratio > 0 ? "WARN" : "PASS";
  return result(status, `${metric} ${status}`, { metric, actual, budget, difference, ratio });
}

function effectiveBudgetFor(config, records) {
  const output = structuredClone(config);
  for (const record of records) {
    const mode = record.viewport;
    const page = record.page;
    output[page] ||= {};
    output[page][mode] ||= {};
    for (const metric of METRICS) {
      const actual = record.metrics?.[metric];
      if (!Number.isFinite(actual)) continue;
      const defaultValue = config?.[page]?.[mode]?.[metric];
      const currentTarget = metric === "imageShare" || metric === "CLS" || metric === "LCP" || metric === "TBT" || metric === "firstScreenKB" || metric === "totalKB" || metric === "requests"
        ? actual * 0.95
        : actual * 0.95;
      output[page][mode][metric] = Number.isFinite(defaultValue) ? Math.min(defaultValue, currentTarget) : round(currentTarget, 4);
    }
  }
  return output;
}

function resourceRows(records) {
  return records.flatMap((record) => (record.resources || []).map((resource) => ({
    page: record.page,
    viewport: record.viewport,
    scenario: record.scenario,
    url: resource.url,
    type: resource.requestType,
    category: resource.category,
    transferKB: round(resource.transferBytes / 1024, 2),
    status: resource.status,
    firstScreen: resource.firstScreen,
    thirdParty: resource.thirdParty,
    cacheHit: resource.transferBytes === 0,
  })));
}

function metricRows(records) {
  return records.flatMap((record) => METRICS.map((metric) => ({
    page: record.page,
    viewport: record.viewport,
    scenario: record.scenario,
    metric,
    value: record.metrics?.[metric] ?? "",
  })));
}

function budgetRows(records, budget, baseline) {
  return records.flatMap((record) => METRICS.map((metric) => {
    const actual = record.metrics?.[metric];
    const configured = budgetFor(budget, record.page, record.viewport, metric);
    const checked = budgetCheck(metric, actual, configured, baseline);
    return {
      page: record.page,
      viewport: record.viewport,
      scenario: record.scenario,
      metric,
      budget: configured ?? "",
      actual: actual ?? "",
      difference: checked.difference ?? "",
      ratio: checked.ratio ?? "",
      status: checked.status,
    };
  }));
}

function isImageResource(resource) {
  return String(resource.contentType || "").startsWith("image/") || /\.(?:avif|webp|png|jpe?g|gif|svg|ico)(?:[?#]|$)/i.test(String(resource.url || ""));
}

function pageImageVolume(records) {
  return records.map((record) => {
    const images = (record.resources || []).filter(isImageResource);
    const imageBytes = images.reduce((sum, resource) => sum + Number(resource.transferBytes || 0), 0);
    const avifBytes = images.filter((resource) => /\.avif(?:[?#]|$)/i.test(String(resource.url || ""))).reduce((sum, resource) => sum + Number(resource.transferBytes || 0), 0);
    const webpBytes = images.filter((resource) => /\.webp(?:[?#]|$)/i.test(String(resource.url || ""))).reduce((sum, resource) => sum + Number(resource.transferBytes || 0), 0);
    const modernBytes = avifBytes + webpBytes;
    return {
      page: record.page,
      viewport: record.viewport,
      scenario: record.scenario,
      images: images.length,
      imageBytes,
      avifBytes,
      webpBytes,
      modernBytes,
      modernCoverage: imageBytes ? round(modernBytes / imageBytes, 4) : null,
    };
  });
}

async function loadImageVolumeReport() {
  const imageRoot = join(REPORTS_ROOT, "images");
  let directories;
  try {
    directories = (await readdir(imageRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .toSorted((a, b) => {
        const stamp = (name) => name.match(/\d{8}-\d{6}$/)?.[0] || "";
        return stamp(b.name).localeCompare(stamp(a.name)) || b.name.localeCompare(a.name);
      });
  } catch {
    return { status: "SKIP", reason: "未找到 AVIF/WebP 生成报告", pages: [] };
  }
  const latest = directories.find((entry) => entry.name !== "");
  if (!latest) return { status: "SKIP", reason: "未找到 AVIF/WebP 生成报告", pages: [] };
  const report = await readJson(join(imageRoot, latest.name, "image-report.json"), null);
  if (!report) return { status: "SKIP", reason: `图片报告缺少 image-report.json: ${latest.name}`, pages: [] };
  const variants = (report.results || []).flatMap((item) => item.variants || []);
  const actual = variants.filter((item) => item.status !== "failed");
  const avifBytes = actual.filter((item) => item.format === "avif").reduce((sum, item) => sum + Number(item.bytes || 0), 0);
  const webpBytes = actual.filter((item) => item.format === "webp").reduce((sum, item) => sum + Number(item.bytes || 0), 0);
  const derivedBytes = variants.filter((item) => item.status === "done").reduce((sum, item) => sum + Number(item.bytes || 0), 0);
  const abandoned = variants
    .filter((item) => item.status === "skipped" && /90%/.test(String(item.reason || "")))
    .map((item) => ({ id: item.id, width: item.width, format: item.format, bytes: item.bytes, reason: item.reason }));
  const overThreshold = variants
    .filter((item) => item.warning)
    .map((item) => ({ id: item.id, width: item.width, format: item.format, bytes: item.bytes, warning: item.warning }));
  const sourceBytes = Number(report.summary?.originalBytes || 0);
  const apply = Boolean(report.apply);
  const effectiveDerivedBytes = apply ? derivedBytes : Number(report.summary?.plannedDerivedBytes || avifBytes + webpBytes);
  const savedBytes = sourceBytes - effectiveDerivedBytes;
  return {
    status: Number(report.summary?.failed || 0) || overThreshold.length ? "WARN" : "PASS",
    report: latest.name,
    adapter: report.adapter,
    apply,
    sourceBytes,
    avifBytes,
    webpBytes,
    derivedBytes,
    plannedDerivedBytes: Number(report.summary?.plannedDerivedBytes || avifBytes + webpBytes),
    effectiveDerivedBytes,
    savedBytes,
    savedPct: sourceBytes ? round(savedBytes / sourceBytes, 4) : null,
    abandoned,
    overThreshold,
    variantCount: variants.length,
    modernFormatCoverage: actual.length ? round(actual.filter((item) => item.format === "avif" || item.format === "webp").length / actual.length, 4) : null,
    pages: [],
  };
}

function markdownReport({ label, baseUrl, git, pageRecords, lighthouseRuns, schemaResults, sitemapResult, robotsResult, budgetRowsValue, imageVolume, reportDir, failures }) {
  const imageAbandoned = imageVolume.abandoned || [];
  const imageOverThreshold = imageVolume.overThreshold || [];
  const statuses = [...pageRecords, ...lighthouseRuns, schemaResults, sitemapResult, robotsResult, imageVolume, ...budgetRowsValue].filter(Boolean).reduce((summary, item) => {
    const status = item.status || "SKIP";
    summary[status] = (summary[status] || 0) + 1;
    return summary;
  }, { PASS: 0, WARN: 0, FAIL: 0, SKIP: 0 });
  const lighthouseRows = lighthouseRuns.map((run) => {
    const metrics = run.metrics || {};
    return `| ${run.page || "-"} | ${run.mode || "-"} | ${metrics.LCP ?? "-"} | ${metrics.CLS ?? "-"} | ${metrics.TBT ?? "-"} | ${metrics.scores?.performance ?? "-"} | ${metrics.scores?.accessibility ?? "-"} | ${metrics.scores?.bestPractices ?? "-"} | ${metrics.scores?.seo ?? "-"} | ${run.status} |`;
  });
  const budgetTable = budgetRowsValue.map((row) => `| ${row.page} | ${row.viewport} | ${row.scenario} | ${row.metric} | ${row.budget || "-"} | ${row.actual || "-"} | ${row.difference || "-"} | ${row.status} |`);
  const imagePageRows = pageImageVolume(pageRecords).map((row) => `| ${row.page} | ${row.viewport} | ${row.scenario} | ${row.images} | ${round(row.imageBytes / 1024, 2)} | ${round(row.avifBytes / 1024, 2)} | ${round(row.webpBytes / 1024, 2)} | ${row.modernCoverage == null ? "-" : `${(row.modernCoverage * 100).toFixed(2)}%`} |`);
  return [
    `# 优化验证报告：${label}`,
    "",
    `- 时间：${nowIso()}`,
    `- 基础 URL：${sanitizeOrigin(baseUrl)}`,
    `- Commit：${git.commit}（${git.title || "-"}）` ,
    `- 分支：${git.branch}`,
    `- 报告目录：${reportDir}`,
    "",
    "## 状态概览",
    "",
    `PASS ${statuses.PASS} · WARN ${statuses.WARN} · FAIL ${statuses.FAIL} · SKIP ${statuses.SKIP}`,
    "",
    "## 原始数据下载",
    "",
    "- [raw.json](./raw.json)：完整 Lighthouse、资源、页面、schema、sitemap 和预算原始数据",
    "- [metrics.csv](./metrics.csv)：页面 × 视口 × 场景指标",
    "- [resources.csv](./resources.csv)：请求、类别、体积、首屏、第三方和缓存信息",
    "- [budget.csv](./budget.csv)：预算判定明细",
    "- [schema-results.csv](./schema-results.csv)：JSON-LD 校验明细",
    "- [env.json](./env.json)：无密钥复现环境元数据",
    "- [repro.sh](./repro.sh)：一键复现命令",
    "",
    "## Lighthouse",
    "",
    "| 页面 | 模式 | LCP(ms) | CLS | TBT(ms) | Performance | Accessibility | Best Practices | SEO | 状态 |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...lighthouseRows,
    lighthouseRows.length ? "" : "- 未运行 Lighthouse。",
    "",
    "## 性能预算",
    "",
    "| 页面 | 视口 | 场景 | 指标 | 预算 | 实测 | 差值 | 判定 |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | --- |",
    ...budgetTable,
    "",
    "## JSON-LD / sitemap / canonical",
    "",
    `- JSON-LD：**${schemaResults.status}**，schema 类型 ${schemaResults.schemaSummary?.length || 0} 类，问题 ${schemaResults.issues?.length || 0} 条。`,
    `- Sitemap：**${sitemapResult.status}**，${sitemapResult.entryCount ?? 0} 条 URL，${sitemapResult.shards?.length ?? 0} 个分片。`,
    `- robots.txt：**${robotsResult.status}**。`,
    "",
    "## 资源贡献度拆解",
    "",
    ...pageRecords.flatMap((record) => [
      `### ${record.page} / ${record.viewport} / ${record.scenario}`,
      "",
      "| 类别 | 请求数 | 传输 KB | 首屏 KB | 占比 | 第三方请求 |",
      "| --- | ---: | ---: | ---: | ---: | ---: |",
      ...(record.contribution || []).toSorted((a, b) => b.transferKB - a.transferKB).map((item) => `| ${item.category} | ${item.requests} | ${item.transferKB} | ${item.firstScreenKB} | ${(item.share * 100).toFixed(2)}% | ${item.thirdPartyRequests} |`),
      "",
    ]),
    "## Image volume",
    "",
    `- Generator report: **${imageVolume.status}**; ${imageVolume.report || imageVolume.reason || "-"}`,
    imageVolume.sourceBytes == null ? "- No AVIF/WebP generator report was found." : `- Mode ${imageVolume.apply ? "apply" : "dry-run"}; original ${imageVolume.sourceBytes} B; AVIF ${imageVolume.avifBytes} B; WebP ${imageVolume.webpBytes} B; effective derivatives ${imageVolume.effectiveDerivedBytes} B; saved ${imageVolume.savedBytes} B (${imageVolume.savedPct == null ? "-" : `${(imageVolume.savedPct * 100).toFixed(2)}%`}).`,
    imageVolume.sourceBytes == null ? "" : `- Negative-optimization skips ${imageAbandoned.length}; threshold warnings ${imageOverThreshold.length}; generated modern-format coverage ${imageVolume.modernFormatCoverage == null ? "-" : `${(imageVolume.modernFormatCoverage * 100).toFixed(2)}%`}.`,
    "",
    "| Page | Viewport | Scenario | Images | Image KB | AVIF KB | WebP KB | Modern coverage |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...(imagePageRows.length ? imagePageRows : ["| - | - | - | - | - | - | - | - |"]),
    ...(imageOverThreshold.length ? ["", "### Threshold warnings", "", ...imageOverThreshold.map((item) => `- ${item.id} / ${item.format} / ${item.width}w: ${item.bytes} B; ${item.warning}`)] : []),
    ...(imageAbandoned.length ? ["", "### Abandoned derivatives", "", ...imageAbandoned.map((item) => `- ${item.id} / ${item.format} / ${item.width}w: ${item.reason}`)] : []),
    "",
    "## 失败项与归因线索",
    "",
    ...(failures.length ? failures.map((failure) => `- **${failure.status || "FAIL"}** ${failure.scope || failure.path || failure.metric || "验证项"}：${failure.reason || failure.message || "未通过"}`) : ["- 无失败项。"]),
    "",
  ].join("\n");
}

async function latestReport(label) {
  try {
    const entries = await readdir(REPORTS_ROOT, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${safeFileName(label)}-`))
      .toSorted((a, b) => b.name.localeCompare(a.name))[0]?.name || "";
  } catch {
    return "";
  }
}

async function compareReports(reportDir, compareLabel, currentRaw) {
  if (!compareLabel) return null;
  const name = await latestReport(compareLabel);
  if (!name) return { status: "SKIP", reason: `找不到 compare 报告 ${compareLabel}` };
  const previous = await import("./lib/common.mjs").then((module) => module.readJson(join(REPORTS_ROOT, name, "raw.json"), null));
  if (!previous) return { status: "SKIP", reason: `compare 报告缺少 raw.json: ${name}` };
  const currentMap = new Map(metricRows(currentRaw.pageRecords).map((row) => [`${row.page}/${row.viewport}/${row.scenario}/${row.metric}`, row.value]));
  const previousMap = new Map(metricRows(previous.pageRecords || []).map((row) => [`${row.page}/${row.viewport}/${row.scenario}/${row.metric}`, row.value]));
  const rows = [];
  for (const [key, current] of currentMap) {
    const previousValue = previousMap.get(key);
    if (!Number.isFinite(Number(current)) || !Number.isFinite(Number(previousValue))) continue;
    const delta = Number(current) - Number(previousValue);
    rows.push({ key, before: previousValue, after: current, delta, ratio: previousValue ? delta / Number(previousValue) : 0, status: delta > 0 ? "WARN" : "PASS" });
  }
  const markdown = [
    `# 验证对比：${compareLabel} → ${currentRaw.label}`,
    "",
    `- 基线报告：${name}`,
    "- 正值代表数值增加；对于 LCP/TBT/CLS/体积/请求数通常意味着劣化，请结合预算判定。",
    "",
    "| 键 | 改前 | 改后 | 变化量 | 变化比例 | 判定 |",
    "| --- | ---: | ---: | ---: | ---: | --- |",
    ...rows.map((row) => `| ${row.key} | ${row.before} | ${row.after} | ${round(row.delta, 3)} | ${(row.ratio * 100).toFixed(2)}% | ${row.status} |`),
    "",
  ].join("\n");
  await writeText(join(reportDir, "diff.md"), markdown);
  return { status: "PASS", compared: name, rows };
}

async function appendHistory(records, budgetRowsValue, reportId, git) {
  await ensureDir(HISTORY_ROOT);
  const lines = records.map((record) => JSON.stringify({
    timestamp: nowIso(),
    commit: git.commit,
    branch: git.branch,
    pr: git.pr,
    title: git.title,
    author: git.author,
    page: record.page,
    viewport: record.viewport,
    scenario: record.scenario,
    dpr: record.viewportName === "mobile-390" ? (SCENARIOS[record.scenario]?.dpr || 1) : 1,
    firstScreenKB: record.metrics?.firstScreenKB ?? null,
    totalKB: record.metrics?.totalKB ?? null,
    LCP: record.metrics?.LCP ?? record.lighthouse?.metrics?.LCP ?? null,
    CLS: record.metrics?.CLS ?? record.lighthouse?.metrics?.CLS ?? null,
    TBT: record.metrics?.TBT ?? record.lighthouse?.metrics?.TBT ?? null,
    imageShare: record.metrics?.imageShare ?? null,
    requests: record.metrics?.requests ?? null,
    jsonLdPassRate: record.schema?.schemaSummary?.length ? record.schema.schemaSummary.reduce((sum, item) => sum + item.coverage, 0) / record.schema.schemaSummary.length : null,
    sitemapBytes: record.sitemapBytes ?? null,
     visualDiffRatio: record.visualDiffRatio ?? null,
     contribution: (record.contribution || [])
       .toSorted((a, b) => Number(b.transferKB || 0) - Number(a.transferKB || 0))
       .slice(0, 10)
       .map((item) => ({ category: item.category, transferKB: round(item.transferKB, 2), share: item.share })),
     budget: budgetRowsValue.filter((row) => row.page === record.page && row.viewport === record.viewport && row.scenario === record.scenario).every((row) => row.status === "PASS"),
    snapshotId: process.env.OPT_SNAPSHOT_ID || "",
    reportId,
  }));
  await appendFile(join(HISTORY_ROOT, "metrics.jsonl"), `${lines.join("\n")}\n`, "utf8");
}

async function writeRepro(reportDir, label, baseUrl) {
  const script = `#!/usr/bin/env bash\nset -euo pipefail\nBASE_URL="${sanitizeOrigin(baseUrl)}"\nLABEL="repro-$(date +%Y%m%d-%H%M%S)"\n\nif [[ -n "${'${OPT_BASE_URL:-}'}" ]]; then BASE_URL="${'${OPT_BASE_URL}'}"; fi\nnode --version\nnpm --version\necho "Reproducing ${label} at ${'${BASE_URL}'}"\nnpm run opt:verify -- --label "${'${LABEL}'}" --base-url "${'${BASE_URL}'}" "${'${@}'}"\n`;
  await writeText(join(reportDir, "repro.sh"), script);
}

async function main() {
  const args = parseArgs();
  const label = String(args.label || "before");
  const baseUrl = String(args["base-url"] || process.env.OPT_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const selectedPages = pageNames(args);
  const modes = requestedViewportModes(args);
  const scenarioName = String(args.scenario || "fast");
  const reportDir = await createReportDirectory(label);
  const reportId = reportDir.split(/[\\/]/).pop();
  const git = gitMetadata(PROJECT_ROOT);
  const pageRecords = [];
  const lighthouseRuns = [];
  const failures = [];
  const budgetConfig = await loadBudget();
  let browser;
  let browserError = null;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.OPT_CHROME_PATH || chromium.executablePath() });
  } catch (error) {
    browserError = String(error);
    failures.push({ status: "FAIL", scope: "browser", reason: `Chromium 启动失败: ${browserError}` });
  }

  for (const pageInfo of selectedPages) {
    const path = pageInfo.article ? await discoverArticlePath(baseUrl, args.article || "") : pageInfo.path;
    for (const mode of modes) {
      if (!browser) break;
      const record = await collectBrowserPage({ browser, baseUrl, pageInfo, path, viewportModeValue: mode, scenarioName });
      pageRecords.push(record);
      if (record.status === "FAIL") failures.push({ status: record.status, scope: `${record.page}/${mode}`, reason: record.reason });
      if (record.imageHealth?.missingAlt?.length) failures.push({ status: "FAIL", scope: `${record.page}/${mode}/alt`, reason: `缺少 alt ${record.imageHealth.missingAlt.length} 个`, items: record.imageHealth.missingAlt });
      if (record.imageHealth?.missingDimensions?.length) failures.push({ status: "FAIL", scope: `${record.page}/${mode}/dimensions`, reason: `缺少宽高 ${record.imageHealth.missingDimensions.length} 个`, items: record.imageHealth.missingDimensions });
      if (record.imageHealth?.broken?.length) failures.push({ status: "FAIL", scope: `${record.page}/${mode}/images`, reason: `图片 HTTP 失败 ${record.imageHealth.broken.length} 个`, items: record.imageHealth.broken });
      if (record.imageHealth?.nonModern?.length) failures.push({ status: "WARN", scope: `${record.page}/${mode}/modern-images`, reason: `非现代图片格式 ${record.imageHealth.nonModern.length} 个`, items: record.imageHealth.nonModern });

      if (LIGHTHOUSE_PAGES.has(pageInfo.name)) {
        const lighthouse = await runLighthouseMedian({ reportDir, url: record.url, mode, label: `${pageInfo.key}-${mode}` });
        lighthouse.page = pageInfo.name;
        lighthouseRuns.push(lighthouse);
        record.lighthouse = lighthouse;
        if (lighthouse.status !== "FAIL" && lighthouse.metrics) {
          record.metrics = { ...record.metrics, ...lighthouse.metrics };
        }
        if (lighthouse.status === "FAIL") {
          failures.push({ status: "FAIL", scope: `lighthouse/${pageInfo.name}/${mode}`, reason: lighthouse.error || "Lighthouse 失败" });
        } else if (lighthouse.status === "WARN") {
          failures.push({ status: "WARN", scope: `lighthouse/${pageInfo.name}/${mode}`, reason: "Lighthouse 三次采样未全部成功，使用可用样本中位数" });
        }
      }
    }
  }
  if (browser) await browser.close();
  if (!browser && !browserError) failures.push({ status: "FAIL", scope: "browser", reason: "没有可用浏览器" });

  const schemaResults = [];
  for (const record of pageRecords.filter((item) => item.status !== "FAIL")) {
    try {
      const response = await fetchWithTimeout(record.url, {}, 20_000);
      const html = await response.text();
      const schema = await validateJsonLd({ html, pageUrl: record.url, baseUrl, checkImages: !hasFlag(args, "skip-image-http") });
      record.schema = schema;
      schemaResults.push(schema);
      if (schema.status === "FAIL") failures.push({ status: "FAIL", scope: `schema/${record.page}`, reason: `${schema.issues.length} 条 JSON-LD/canonical 问题`, items: schema.issues });
      else if (schema.status === "WARN") failures.push({ status: "WARN", scope: `schema/${record.page}`, reason: `${schema.issues.length} 条 JSON-LD 警告`, items: schema.issues });
    } catch (error) {
      failures.push({ status: "FAIL", scope: `schema/${record.page}`, reason: String(error) });
    }
  }
  const combinedSchema = {
    status: schemaResults.some((item) => item.status === "FAIL") ? "FAIL" : schemaResults.some((item) => item.status === "WARN") ? "WARN" : schemaResults.length ? "PASS" : "SKIP",
    pages: schemaResults,
    schemaSummary: schemaResults.flatMap((item) => item.schemaSummary || []),
    issues: schemaResults.flatMap((item) => item.issues || []),
  };

  const sitemapResult = await validateSitemap({ baseUrl, expectedPaths: STATIC_SITEMAP_PATHS });
  if (sitemapResult.status === "FAIL") failures.push({ status: "FAIL", scope: "sitemap", reason: sitemapResult.failures.map((item) => item.reason).join("；") });
  else if (sitemapResult.status === "WARN") failures.push({ status: "WARN", scope: "sitemap", reason: sitemapResult.warnings.map((item) => item.reason).join("；") });
  for (const record of pageRecords) record.sitemapBytes = sitemapResult.root?.bytes ?? null;
  const robotsResult = await (async () => {
    try {
      const response = await fetchWithTimeout(resolveUrl(baseUrl, "/robots.txt"), {}, 15_000);
      const text = await response.text();
      const ok = response.ok && /User-agent:\s*\*/i.test(text) && /Sitemap:\s*\S+/i.test(text) && !/Disallow:\s*\/\s*$/im.test(text);
      return { status: ok ? "PASS" : "FAIL", code: response.status, body: text.replace(/https?:\/\/[^\s/]+/gi, "[origin]") };
    } catch (error) {
      return { status: "FAIL", reason: String(error) };
    }
  })();
  if (robotsResult.status === "FAIL") failures.push({ status: "FAIL", scope: "robots.txt", reason: robotsResult.reason || `HTTP ${robotsResult.code}` });

  const baseline = !budgetConfig.effective;
  const effectiveBudget = baseline ? effectiveBudgetFor(budgetConfig.configured, pageRecords) : budgetConfig.effective;
  const budgetRowsValue = budgetRows(pageRecords, effectiveBudget, baseline);
  if (!baseline) {
    failures.push(...budgetRowsValue.filter((row) => row.status === "FAIL").map((row) => ({ status: "FAIL", scope: `budget/${row.page}/${row.viewport}/${row.metric}`, reason: `${row.actual} > ${row.budget}（${(Number(row.ratio) * 100).toFixed(1)}%）`, metric: row.metric })));
    failures.push(...budgetRowsValue.filter((row) => row.status === "WARN").map((row) => ({ status: "WARN", scope: `budget/${row.page}/${row.viewport}/${row.metric}`, reason: `${row.actual} > ${row.budget}（警戒）`, metric: row.metric })));
  }
  await ensureDir(HISTORY_ROOT);
  if (baseline) await writeJson(budgetConfig.effectiveFile, effectiveBudget);

  const imageVolume = await loadImageVolumeReport();
  imageVolume.pages = pageImageVolume(pageRecords);
  if (imageVolume.status === "WARN") {
    failures.push({ status: "WARN", scope: "images", reason: `图片派生报告存在 ${imageVolume.overThreshold?.length || 0} 项超标或 ${imageVolume.abandoned?.length || 0} 项负优化放弃` });
  }

  const raw = {
    label,
    reportId,
    generatedAt: nowIso(),
    baseUrl: sanitizeOrigin(baseUrl),
    git,
    env: { node: process.version, platform: process.platform, arch: process.arch, ci: Boolean(process.env.CI), scenario: scenarioName, viewportModes: modes },
    pageRecords,
    lighthouseRuns,
    schema: combinedSchema,
    sitemap: sitemapResult,
    robots: robotsResult,
    imageVolume,
    budget: { baseline, configured: budgetConfig.configured, effective: effectiveBudget, rows: budgetRowsValue },
    failures,
  };
  await writeJson(join(reportDir, "raw.json"), sanitizeReportValue(raw));
  await writeText(join(reportDir, "metrics.csv"), toCsv(metricRows(pageRecords), ["page", "viewport", "scenario", "metric", "value"]));
  await writeText(join(reportDir, "resources.csv"), toCsv(resourceRows(pageRecords), ["page", "viewport", "scenario", "url", "type", "category", "transferKB", "status", "firstScreen", "thirdParty", "cacheHit"]));
  await writeText(join(reportDir, "budget.csv"), toCsv(budgetRowsValue, ["page", "viewport", "scenario", "metric", "budget", "actual", "difference", "ratio", "status"]));
  const schemaRows = combinedSchema.pages.flatMap((item) => (item.issues || []).map((issue) => ({ page: redactUrl(item.pageUrl), type: issue.type, path: issue.path, status: issue.status, message: sanitizeReportValue(issue.message || ""), value: sanitizeReportValue(issue.value || ""), expected: sanitizeReportValue(issue.expected || "") })));
  await writeText(join(reportDir, "schema-results.csv"), toCsv(schemaRows, ["page", "type", "path", "status", "message", "value", "expected"]));
  await writeJson(join(reportDir, "env.json"), raw.env);
  await writeRepro(reportDir, label, baseUrl);
  if (failures.some((failure) => failure.status === "FAIL")) {
    await writeJson(join(reportDir, "failures.json"), failures.filter((failure) => failure.status === "FAIL"));
    await writeText(join(reportDir, "failures.csv"), toCsv(failures.filter((failure) => failure.status === "FAIL"), ["status", "scope", "reason", "metric"]));
  }
  await writeText(join(reportDir, "report.md"), markdownReport({ label, baseUrl, git, pageRecords, lighthouseRuns, schemaResults: combinedSchema, sitemapResult, robotsResult, budgetRowsValue, imageVolume, reportDir, failures }));
  const compare = await compareReports(reportDir, args.compare, { label, pageRecords });
  await appendHistory(pageRecords, budgetRowsValue, reportId, git);
  const allGreen = !failures.some((failure) => failure.status === "FAIL") && budgetRowsValue.every((row) => row.status === "PASS" || row.status === "SKIP" || row.status === "BASELINE");
  if (allGreen && !baseline) await writeJson(join(HISTORY_ROOT, "last-passing.json"), { reportId, commit: git.fullCommit, timestamp: nowIso(), snapshotId: process.env.OPT_SNAPSHOT_ID || "" });
  console.log(JSON.stringify({ reportDir, status: failures.some((failure) => failure.status === "FAIL") ? "FAIL" : baseline ? "BASELINE" : "PASS", compare: compare?.status || "SKIP", failures: failures.length }, null, 2));
  if (failures.some((failure) => failure.status === "FAIL")) process.exitCode = 1;
}

await main();
