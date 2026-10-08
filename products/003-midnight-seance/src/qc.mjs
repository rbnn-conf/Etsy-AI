import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { outputPath } from './paths.mjs';
import { sha256,loadResources } from './resources.mjs';
export function contrast(a,b) {
  const luminance=c=>{const rgb=c.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
  const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
export async function validateReview(manifest,resources) {
  const failures=[],checks=[];const check=(label,pass,detail)=>{checks.push({label,pass,detail});if(!pass)failures.push({label,detail});};
  check('source matches frozen proof build',manifest.sourceHash===resources.sourceHash);
  check('PDF count',manifest.jobs.length===resources.qc.expectedTotalPdfCount,manifest.jobs.length);
  check('rasterized page count',manifest.jobs.flatMap(j=>j.pages).length===resources.qc.expectedTotalPageCount,manifest.jobs.flatMap(j=>j.pages).length);
  check('unique output names',new Set(manifest.jobs.map(j=>j.name)).size===manifest.jobs.length);
  const assets=resources.artworkManifest.assets;
  check('complete original artwork library',assets.length===70&&new Set(assets.map(a=>a.id)).size===35);
  check('all artwork individually inspected and print safe',assets.every(a=>a.visualQc==='pass'&&a.edgeOpaque===0&&a.effectivePpiAtMaxBox>=300));
  check('neutral purpose-drawn economy artwork',assets.filter(a=>a.treatment==='economy').length===35&&assets.filter(a=>a.treatment==='economy').every(a=>a.chromaticOpaqueFraction<.01));
  for(const a of assets)check(`${a.id}/${a.treatment} frozen artwork hash`,sha256(await readFile(new URL(`../artwork/${a.file}`,import.meta.url)))===a.sha256);
  for(const [name,theme] of Object.entries(resources.tokens.themes))for(const key of ['text','accent','secondary'])check(`${name}/${key} text contrast`,contrast(theme[key],theme.paper)>=4.5,contrast(theme[key],theme.paper));
  for(const job of manifest.jobs) {
    check(`${job.name} PDF hash`,sha256(await readFile(outputPath(job.pdf)))===job.sha256);
    check(`${job.name} preflight`,job.probe.issues.length===0,job.probe);
    check(`${job.name} expected pages`,job.pages.length===(job.singlePage?1:job.kind==='word-search'?2:1));
    const [w,h]=resources.tokens.sizes[job.size];
    for(const page of job.pages) {
      check(`${job.name}/${page.page} physical size`,Math.abs(page.widthMm-w)<.5&&Math.abs(page.heightMm-h)<.5,[page.widthMm,page.heightMm]);
      const bytes=await readFile(outputPath(page.pngPath)),meta=await sharp(bytes).metadata();
      check(`${job.name}/${page.page} decoded preview dimensions`,meta.width===page.widthPx&&meta.height===page.heightPx,[meta.width,meta.height]);
      check(`${job.name}/${page.page} effective 300dpi`,Math.abs(meta.width-w*300/25.4)<3&&Math.abs(meta.height-h*300/25.4)<3);
      check(`${job.name}/${page.page} PNG density metadata`,meta.density===300,meta.density);
      check(`${job.name}/${page.page} preview hash`,sha256(bytes)===page.pngSha256);
      check(`${job.name}/${page.page} selectable text`,page.text.length>80,page.text.length);
      check(`${job.name}/${page.page} embedded fonts`,page.fonts.length>0&&page.fonts.every(f=>f.embedded),page.fonts);
      check(`${job.name}/${page.page} actual embedded font streams`,page.embeddedFontStreams.length>=page.fonts.length&&page.embeddedFontStreams.every(f=>f.embedded),page.embeddedFontStreams);
      check(`${job.name}/${page.page} no tofu/replacement characters`,!/[\uFFFD\u25A1]/.test(page.text));
      if(job.kind==='word-search')check(`${job.name}/${page.page} complete word list`,resources.game.words.every(w=>page.text.includes(w)));
    }
  }
  check('Chromium offline editor',manifest.editor.results.length===17&&manifest.editor.results.every(r=>r.ready||r.rejected),manifest.editor);
  check('Edge offline editor',manifest.edgeEditor.results.length===17&&manifest.edgeEditor.results.every(r=>r.ready||r.rejected),manifest.edgeEditor);
  check('editor hash',sha256(await readFile(outputPath(manifest.editorFile)))===manifest.editorSha256);
  return {buildId:manifest.buildId,passed:failures.length===0,checkCount:checks.length,failures,checks};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const manifest=JSON.parse(await readFile(outputPath('proof-manifest.json'),'utf8'));
  const resources=await loadResources();if(manifest.revision===1)resources.qc={...resources.qc,expectedTotalPdfCount:8,expectedTotalPageCount:8};
  const report=await validateReview(manifest,resources);
  console.log(JSON.stringify({checks:report.checkCount,failures:report.failures},null,2));if(report.failures.length)process.exitCode=1;
}
