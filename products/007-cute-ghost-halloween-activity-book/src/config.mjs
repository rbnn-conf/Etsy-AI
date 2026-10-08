import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Reuse Product #004's installed libraries; no new dependency installation.
export const lib=createRequire(new URL('../../004-cozy-spooky-coloring/package.json',import.meta.url));
export const config={
  productId:'007', handoffId:'006', title:'Cute Ghost Halloween Activity Book',
  prefix:'LumiumX-Cute-Ghost-Halloween',
  pageCount:30, activityCount:28,
  // Canvas density that keeps every portrait source at native pixels (scale 1)
  // inside 12 mm margins on both papers. Not a claim of source detail.
  dpi:152,
  // Decimal-MB headroom below Etsy's 20 MB per-file limit; five files maximum.
  limit:19_000_000,
  pageMap:join(root,'page-map.json'),
  pdfQualities:[null,95,92,90,88,85,82,80]
};
export const ids=Array.from({length:config.pageCount},(_,i)=>`P${String(i+1).padStart(3,'0')}`);
