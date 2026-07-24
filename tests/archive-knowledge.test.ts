import assert from "node:assert/strict";
import test from "node:test";

import {
  archiveHtmlToReadableText,
  extractArchiveOriginalUrl,
  extractArchivePublishedAt,
  normalizeArchiveOfflineHtml,
} from "../worker/archive-sync";

test("extracts searchable text and metadata from an archived article", () => {
  const html = `<!doctype html>
    <html><head>
      <link rel="canonical" href="https://example.com/hermes-agent">
      <meta property="article:published_time" content="2025-09-08T12:30:00Z">
      <script>ignore this command</script>
    </head><body>
      <nav>site navigation</nav>
      <article><h1>Hermes Agent deployment</h1><p>Run it behind a private reverse proxy.</p></article>
    </body></html>`;

  assert.equal(extractArchiveOriginalUrl(html), "https://example.com/hermes-agent");
  assert.equal(extractArchivePublishedAt(html), "2025-09-08T12:30:00.000Z");
  const text = archiveHtmlToReadableText(html, 10_000);
  assert.match(text, /Hermes Agent deployment/);
  assert.match(text, /private reverse proxy/);
  assert.doesNotMatch(text, /ignore this command|site navigation/);
});

test("normalizes lazy-loaded images without changing ordinary images", () => {
  const html =
    '<img src="data:image/png;base64,AAA" data-src="https://cdn.example.com/a.png"><img src="/kept.png">';
  const normalized = normalizeArchiveOfflineHtml(html);
  assert.match(normalized, /src="https:\/\/cdn\.example\.com\/a\.png"/);
  assert.match(normalized, /src="\/kept\.png"/);
});

test("extracts Discourse content when an archive contains a very large inline image", () => {
  const inlineImage = "A".repeat(2_000_000);
  const html = `<body>
    <img src="data:image/png;base64,${inlineImage}">
    <div class="topic-post"><div class="cooked"><p>Cloudflare tunnel notes</p></div></div>
    <div class="cooked-selection-barrier"></div>
  </body>`;

  const text = archiveHtmlToReadableText(html, 10_000);
  assert.match(text, /Cloudflare tunnel notes/);
  assert.doesNotMatch(text, /data:image|AAAA/);
});
