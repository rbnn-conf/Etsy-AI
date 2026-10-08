/**
 * HTML -> Playwright/Chromium -> PNG. Same hard rules as the print renderer:
 * every http(s) request is aborted, so a stray external asset fails loudly
 * instead of silently succeeding via the network.
 *
 * Returns the PNG path plus in-page measurements used by Visual QC:
 * clipping past the canvas, whether branding + the product title are present,
 * and the smallest rendered font size (readability).
 */

import { chromium } from "playwright";
import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";

async function blockNetwork(page) {
  const blocked = [];
  for (const scheme of ["http://**", "https://**"]) {
    await page.route(scheme, (route) => {
      blocked.push(route.request().url());
      route.abort();
    });
  }
  return blocked;
}

/** true when a Chromium build is available to Playwright. */
export async function rendererAvailable() {
  try {
    const b = await chromium.launch();
    await b.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {{html:string, outPath:string, width?:number, height?:number}[]} jobs
 * @returns {Promise<Array<{
 *   outPath:string, width:number, height:number, bytes:number, blocked:string[],
 *   overflowPx:number, hasBranding:boolean, hasTitle:boolean, minFontPx:number,
 *   claimTokens:{claim:string,value:string,text:string}[]
 * }>>}
 */
export async function renderAssets(jobs) {
  const browser = await chromium.launch();
  try {
    const out = [];
    for (const job of jobs) {
      const w = job.width ?? 2000;
      const h = job.height ?? 2000;
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const blocked = await blockNetwork(page);
      await page.setContent(job.html, { waitUntil: "load" });
      await page.evaluate(async () => {
        await document.fonts.ready;
      });

      const probe = await page.evaluate(() => {
        const canvas = document.getElementById("canvas");
        const cr = canvas.getBoundingClientRect();
        let overflow = 0;
        let minFont = Infinity;
        for (const el of canvas.querySelectorAll("*")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          // Inside a clipping frame ([data-clip], overflow hidden): only the frame itself can overflow.
          const clipped = !!el.parentElement?.closest("[data-clip]");
          if (!clipped) overflow = Math.max(
            overflow,
            r.right - cr.right,
            cr.left - r.left,
            r.bottom - cr.bottom,
            cr.top - r.top,
          );
          if (el.childElementCount === 0 && (el.textContent || "").trim()) {
            const fs = parseFloat(getComputedStyle(el).fontSize);
            if (fs > 0) minFont = Math.min(minFont, fs);
          }
        }
        const claimTokens = [...document.querySelectorAll("[data-claim]")].map((n) => ({
          claim: n.getAttribute("data-claim"),
          value: n.getAttribute("data-claim-value") || "",
          text: (n.textContent || "").trim(),
        }));
        // Real product artwork (<img data-art="sha256">): natural pixels vs laid-out
        // size (offsetWidth/Height are before any rotation), so QC can prove no stretch.
        const artwork = [...document.querySelectorAll("img[data-art]")].map((n) => ({
          sha256: n.getAttribute("data-art"),
          naturalW: n.naturalWidth,
          naturalH: n.naturalHeight,
          boxW: n.offsetWidth,
          boxH: n.offsetHeight,
          complete: n.complete && n.naturalWidth > 0,
          // On-canvas footprint after perspective/rotation (product prominence).
          rect: (({ left, top, width, height }) => ({ x: left - cr.left, y: top - cr.top, w: width, h: height }))(n.getBoundingClientRect()),
          // The part actually seen: the footprint clipped by every enclosing [data-clip] frame and the canvas.
          visible: (() => {
            let { left, top, right, bottom } = n.getBoundingClientRect();
            for (let p = n.parentElement?.closest("[data-clip]"); p; p = p.parentElement?.closest("[data-clip]")) {
              const q = p.getBoundingClientRect();
              left = Math.max(left, q.left); top = Math.max(top, q.top); right = Math.min(right, q.right); bottom = Math.min(bottom, q.bottom);
            }
            left = Math.max(left, cr.left); top = Math.max(top, cr.top); right = Math.min(right, cr.right); bottom = Math.min(bottom, cr.bottom);
            return { x: left - cr.left, y: top - cr.top, w: Math.max(0, right - left), h: Math.max(0, bottom - top) };
          })(),
          crop: n.parentElement?.closest("[data-crop]")?.getAttribute("data-crop") ?? null,
        }));
        // The primary headline(s): their size decides legibility at thumbnail size.
        const headlines = [...document.querySelectorAll("[data-role=headline]")].map((n) => ({
          text: (n.textContent || "").trim(),
          fontPx: parseFloat(getComputedStyle(n).fontSize),
        }));
        return {
          artwork,
          headlines,
          overflowPx: Math.round(overflow),
          hasBranding: !!document.querySelector("[data-brand]"),
          hasTitle: !!document.querySelector('[data-claim="product-title"]'),
          minFontPx: minFont === Infinity ? 0 : Math.round(minFont),
          claimTokens,
        };
      });

      await mkdir(dirname(job.outPath), { recursive: true });
      const clip = { x: 0, y: 0, width: w, height: h };
      await page.screenshot({ path: job.outPath, clip });
      await page.close();

      const { size } = await stat(job.outPath);
      if (blocked.length) {
        console.warn(`WARNING: ${blocked.length} network request(s) blocked for ${job.outPath}`);
      }
      out.push({ outPath: job.outPath, width: w, height: h, bytes: size, blocked, ...probe });
    }
    return out;
  } finally {
    await browser.close();
  }
}
