import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveMarketingTheme, DEFAULT_MARKETING_THEME } from "../src/design-system/tokens.mjs";
import * as C from "../src/components/index.mjs";
import { composeAsset } from "../src/compose.mjs";
import { renderAssets, rendererAvailable } from "../src/render.mjs";
import { marketingQc } from "../src/qc.mjs";

const t = resolveMarketingTheme({});
const brand = { name: "Test Product", tagline: "Plan · Track · Review" };
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("resolveMarketingTheme: deep-merges overrides, keeps untouched leaves", () => {
  const th = resolveMarketingTheme({ color: { accent: "112233" }, font: { size: { hero: 100 } } });
  assert.equal(th.color.accent, "112233");
  assert.equal(th.color.ink, DEFAULT_MARKETING_THEME.color.ink);
  assert.equal(th.font.size.hero, 100);
  assert.equal(th.font.size.body, DEFAULT_MARKETING_THEME.font.size.body);
});

test("resolveMarketingTheme exposes the deterministic scene tokens", () => {
  const th = resolveMarketingTheme({});
  assert.equal(typeof th.scene.deskMid, "string");
  assert.equal(typeof th.scene.contact, "string");
  assert.equal(typeof th.scene.copyScrim, "string");
});

test("claim() stamps a verifiable span; esc() escapes", () => {
  assert.equal(
    C.claim("worksheet-count", "8", "8 worksheets"),
    '<span data-claim="worksheet-count" data-claim-value="8">8 worksheets</span>',
  );
  assert.match(C.esc('<b>&"x"'), /&lt;b&gt;&amp;&quot;x&quot;/);
});

test("brandingFooter() carries the data-brand marker Visual QC checks for", () => {
  assert.match(C.brandingFooter(t, brand), /data-brand/);
  assert.equal(C.brandingFooter(t, null), "");
});

test("render + Visual QC on a composed asset (needs Chromium)", async (ctx) => {
  if (!(await rendererAvailable())) {
    ctx.skip("Playwright Chromium not available");
    return;
  }
  const dir = await mkdtemp(join(tmpdir(), "mkt-render-"));
  try {
    // A plain asset built from the shared components only: gradient backdrop,
    // a real (tiny) image, the claimed title and spec, and the brand footer.
    const bodyHtml = `<div id="canvas" style="position:relative;width:2000px;height:2000px;overflow:hidden;background:radial-gradient(circle at 30% 25%, #f4ead8, #c9a77c 60%, #7a5a3a)">
  <img src="${TINY_PNG}" alt="" style="position:absolute;left:300px;top:500px;width:1400px;height:1000px;image-rendering:pixelated">
  <h1 style="position:absolute;left:120px;top:120px;margin:0;font-size:120px">${C.claim("product-title", "Test Product")}</h1>
  <p style="position:absolute;left:120px;top:300px;margin:0;font-size:48px">${C.claim("worksheet-count", "8", "8 worksheets")}</p>
  ${C.brandingFooter(t, brand)}
</div>`;
    const { html } = await composeAsset({ bodyHtml, title: "render test" });
    const out = join(dir, "hero.png");
    const [res] = await renderAssets([{ html, outPath: out, width: 2000, height: 2000 }]);

    assert.equal(res.width, 2000);
    assert.equal(res.height, 2000);
    assert.equal(res.blocked.length, 0, "no external requests");
    assert.ok(res.bytes > 20000);
    assert.ok(res.overflowPx <= 2, `overflow ${res.overflowPx}`);
    assert.equal(res.hasBranding, true);
    assert.equal(res.hasTitle, true);
    assert.ok(res.minFontPx >= 20);

    const md = {
      claimIndex: {
        "product-title": ["test product"],
        "worksheet-count": ["8", "8 worksheets"],
      },
    };
    const q = marketingQc({
      renderResults: [{ ...res, expectWidth: 2000, expectHeight: 2000 }],
      marketingData: md,
      expectAssets: 1,
    });
    assert.equal(q.summary.fail, 0, JSON.stringify(q.results.filter((r) => !r.pass)));
    assert.equal(q.claims.pass, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
