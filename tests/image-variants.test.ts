import assert from "node:assert/strict";
import test from "node:test";

import {
  responsiveSrcSet,
  responsiveVariantUrl,
} from "../src/components/ui/ResponsiveImage";

const source = "/supabase/storage/v1/object/public/media/2026/cover-image.jpg";

test("managed media URLs use the AVIF/WebP variant naming convention", () => {
  assert.equal(
    responsiveVariantUrl(source, "avif", 640),
    "/supabase/storage/v1/object/public/media/variants/2026/cover-image.jpg.w640.avif",
  );
  assert.equal(
    responsiveVariantUrl(source, "webp", 1280),
    "/supabase/storage/v1/object/public/media/variants/2026/cover-image.jpg.w1280.webp",
  );
});

test("managed media URLs produce a complete responsive srcset", () => {
  const srcSet = responsiveSrcSet(source, "webp");

  assert.ok(srcSet);
  assert.match(srcSet, /\.w320\.webp 320w/);
  assert.match(srcSet, /\.w1920\.webp 1920w/);
});

test("external image URLs keep the original image fallback", () => {
  assert.equal(responsiveVariantUrl("https://images.example.test/cover.jpg", "avif", 640), null);
  assert.equal(responsiveSrcSet("https://images.example.test/cover.jpg", "webp"), null);
});
