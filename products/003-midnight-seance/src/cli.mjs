import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { REVIEW_ROOT, outputPath } from './paths.mjs';
import { loadResources, sha256 } from './resources.mjs';
import { renderDocument } from './render/document.mjs';
import { preflight } from './render/preflight.mjs';
import { inspectPdf } from './render/pdf-preview.mjs';
import { fixtureValues, validateFields } from './edit/validation.mjs';
import { buildEditor } from './edit/build-editor.mjs';
import { testEditor } from './edit/test-editor.mjs';
import { verifyPuzzle } from './games/word-search.mjs';
import { validateReview } from './qc.mjs';

const resources=await loadResources();
const milestone=3;
const revision=true;
if(revision)resources.qc={...resources.qc,expectedTotalPdfCount:8,expectedTotalPageCount:8};
for(const dir of ['pdf','preview','reports','editable','html'])await mkdir(outputPath(dir),{recursive:true});
const jobs=[];
for(const theme of ['full-colour','economy']) {
  for(const size of ['5x7','a4','us-letter'])jobs.push({kind:'invitation',theme,size,scenario:'default'});
  for(const size of ['8x10','a4','us-letter'])jobs.push({kind:'welcome',theme,size,scenario:'default'});
  for(const size of ['a4','us-letter'])jobs.push({kind:'word-search',theme,size,scenario:'default'});
  for(const [kind,sizes] of [['invitation',['5x7']],['welcome',['8x10','a4','us-letter']]])for(const size of sizes)jobs.push({kind,theme,size,scenario:'maximum'});
  for(const [kind,size] of [['invitation','5x7'],['welcome','8x10']])jobs.push({kind,theme,size,scenario:'maximum-wide'});
}
for(const scenario of ['us','special','optional-empty','uk'])for(const kind of ['invitation','welcome'])jobs.push({kind,theme:'full-colour',size:kind==='invitation'?'5x7':'us-letter',scenario});
if(revision){jobs.length=0;for(const theme of ['full-colour','economy']){jobs.push({kind:'invitation',theme,size:'5x7',scenario:'default'},{kind:'welcome',theme,size:'8x10',scenario:'default'},{kind:'word-search',theme,size:'a4',scenario:'default',singlePage:true,answer:false},{kind:'word-search',theme,size:'a4',scenario:'default',singlePage:true,answer:true});}}
const manifest={productId:'003',milestone,status:'ARTWORK_PROOF_AWAITING_APPROVAL',buildId:`prompt-0${milestone}-${resources.sourceHash.slice(0,12)}`,sourceHash:resources.sourceHash,sourceEvidence:resources.sourceEvidence,dpi:300,artworkStatus:'Original image-generated engravings and purpose-drawn economy variants',artworkManifest:resources.artworkManifest,fontEvidence:resources.fontEvidence,puzzle:verifyPuzzle(resources.puzzle,resources.game.words,resources.qc.blockedStrings),jobs:[]};
const browser=await chromium.launch({headless:true,timeout:15000});
console.log(`Product 003 proof renderer: Chromium ${browser.version()}`);
try {
  if(revision){manifest.revision=1;manifest.supersedes=milestone===3?'storage/products/003/prompt-02-revision-01 (retained at commit 5cf7d15)':'storage/products/003/prompt-02-review (retained at commit 5eff44d)';manifest.stressChecks=[];
    for(const theme of ['full-colour','economy'])for(const kind of ['invitation','welcome','word-search'])for(const size of (kind==='invitation'?['5x7','a4','us-letter']:kind==='welcome'?['8x10','a4','us-letter']:['a4','us-letter']))for(const scenario of (kind==='word-search'?['default']:['default','maximum','maximum-wide','special','optional-empty','us'])){
      const values=kind==='word-search'?null:fixtureValues(resources.schemas,kind,scenario,resources.defaults),page=await browser.newPage();await page.setContent(renderDocument({kind,theme,size,values},resources));const probe=await preflight(page,resources);await page.close();if(probe.issues.length)throw Error(JSON.stringify({kind,theme,size,scenario,issues:probe.issues}));manifest.stressChecks.push({kind,theme,size,scenario,passed:true});
    }
  }
  for(const job of jobs) {
    const name=[job.kind,job.theme,job.size,job.scenario,...(job.answer?['answer']:[])].join('-');
    const values=job.kind==='word-search'?null:fixtureValues(resources.schemas,job.kind,job.scenario,resources.defaults);
    if(values&&!validateFields(job.kind,values,resources.schemas).valid)throw new Error(`Invalid fixture: ${name}`);
    const html=renderDocument({...job,values},resources);
    await writeFile(outputPath('html',`${name}.html`),html);
    const page=await browser.newPage();const blocked=[],pageErrors=[];
    await page.route(/https?:\/\//,r=>{blocked.push(r.request().url());r.abort();});
    page.on('pageerror',e=>pageErrors.push(e.message));
    await page.setContent(html,{waitUntil:'load'});
    const probe=await preflight(page,resources);
    if(probe.issues.length||blocked.length||pageErrors.length)throw new Error(`${name}: ${JSON.stringify({probe,blocked,pageErrors})}`);
    const path=outputPath('pdf',`${name}.pdf`);
    await page.pdf({path,preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false,tagged:true,...(job.singlePage?{pageRanges:job.answer?'2':'1'}:{})});
    await page.close();
    const pdfBytes=await readFile(path),pdf=await PDFDocument.load(pdfBytes);
    pdf.setTitle(`Midnight Séance — ${job.kind} — Prompt ${milestone} proof`);pdf.setAuthor('Midnight Séance');pdf.setSubject('Original illustrated artwork proof for visual approval');
    pdf.setCreationDate(new Date('2026-09-17T00:00:00Z'));pdf.setModificationDate(new Date('2026-09-17T00:00:00Z'));
    await writeFile(path,await pdf.save());
    const pages=await inspectPdf(path,{dpi:300,outPrefix:outputPath('preview',name)});
    manifest.jobs.push({...job,name,values,pdf:relative(REVIEW_ROOT,path).replaceAll('\\','/'),sha256:sha256(await readFile(path)),probe,pages:pages.map(p=>({...p,pngPath:relative(REVIEW_ROOT,p.pngPath).replaceAll('\\','/'),pngSha256:null}))});
    for(const p of manifest.jobs.at(-1).pages)p.pngSha256=sha256(await readFile(outputPath(p.pngPath)));
    console.log(`Rendered ${name}: ${pages.length} page(s)`);
  }
  const editorPath=await buildEditor(resources);
  manifest.editor=await testEditor(browser,editorPath,resources);
  // Verify the same local editor in the other approved browser, not only node-rendered layouts.
  const edge=await chromium.launch({channel:'msedge',headless:true,timeout:15000});
  try{manifest.edgeEditor=await testEditor(edge,editorPath,resources);}finally{await edge.close();}
  manifest.editorFile='editable/midnight-seance-proof-editor.html';manifest.editorSha256=sha256(await readFile(editorPath));
}finally{await browser.close();}
await writeFile(outputPath('reports','word-search-solution.json'),JSON.stringify(resources.puzzle,null,2));
const thumbs=[];
const allPages=manifest.jobs.flatMap(j=>j.pages.map(p=>({name:`${j.name} / ${p.page}`,path:outputPath(p.pngPath)})));
for(const [index,p] of allPages.entries()) {
  const img=await sharp(p.path).resize({width:300,height:420,fit:'contain',background:'#FFFFFF'}).png().toBuffer();
  const safe=p.name.replaceAll('&','&amp;');
  const label=Buffer.from(`<svg width="320" height="44"><rect width="320" height="44" fill="#FFFFFF"/><text x="10" y="16" font-family="Arial" font-size="10" fill="#171315">${safe.split(' / ')[0].replace(/-(default|maximum|optional-empty|special|us|uk)$/,'')}</text><text x="10" y="32" font-family="Arial" font-size="10" fill="#701F2A">${p.name.split('-').at(-1)} · page ${p.name.split(' / ')[1]} · proof ${index+1}</text></svg>`);
  const tile=await sharp({create:{width:320,height:470,channels:3,background:'white'}}).composite([{input:img,left:10,top:5},{input:label,left:0,top:426}]).png().toBuffer();thumbs.push(tile);
}
const cols=revision?4:6,rows=Math.ceil(thumbs.length/cols);
await sharp({create:{width:cols*336,height:rows*486,channels:3,background:'#342434'}}).composite(thumbs.map((input,i)=>({input,left:(i%cols)*336+8,top:Math.floor(i/cols)*486+8}))).png().toFile(outputPath('CONTACT-SHEET.png'));
await writeFile(outputPath('proof-manifest.json'),JSON.stringify(manifest,null,2));
const reviewHtml=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Midnight Séance — Prompt ${milestone} review</title><style>body{margin:32px auto;max-width:1200px;padding:0 24px;background:#F4EBDD;color:#171315;font:16px Georgia,serif;line-height:1.5}h1{font-weight:400;font-size:40px}a{color:#701F2A}table{width:100%;border-collapse:collapse;background:white}th,td{padding:10px;border-bottom:1px solid #A98A5B;text-align:left;font-size:14px}img{max-width:100%}.notice{border:1px solid #701F2A;padding:16px}code{font:13px monospace}</style></head><body><h1>Midnight Séance</h1><p>Prompt  · three visual proof types · ${manifest.jobs.length} PDFs / ${allPages.length} actual PDF pages at 300 dpi</p><p class="notice">Design proofs for approval. Original generated illustrations and intentional economy redraws are integrated into deterministic layouts. Maximum-content fixtures are intentionally synthetic and may end mid-word because the input is constructed to an exact limit; the renderer does not truncate text. This is not the final customer package.</p><p><a href="editable/midnight-seance-proof-editor.html">Open the offline invitation / welcome editor</a> · <a href="proof-manifest.json">Proof manifest</a> · <a href="reports/automated-qc.json">Automated QC</a> · <a href="reports/EDITING_FEASIBILITY.md">Editing report</a> · <a href="reports/VISUAL_QA.md">Visual inspection</a></p><p>Invitation stays 5 × 7 in on native/A4/Letter sheets. Welcome master is 8 × 10 in, with reflowed A4/Letter editions. Print at 100%, selected paper, no margins/header/footer; enable Background graphics for Signature Ivory. Review the full-resolution images individually, using this contact sheet for navigation.</p><a href="CONTACT-SHEET.png"><img src="CONTACT-SHEET.png" alt="Every rendered PDF page in the Prompt ${milestone} review"></a><table><thead><tr><th>Proof</th><th>PDF</th><th>Actual PDF previews</th></tr></thead><tbody>${manifest.jobs.map(j=>`<tr><td>${j.name}</td><td><a href="${j.pdf}">Open PDF</a></td><td>${j.pages.map(p=>`<a href="${p.pngPath}">Page ${p.page} PNG</a>`).join(' · ')}</td></tr>`).join('')}</tbody></table></body></html>`;
await writeFile(outputPath('REVIEW.html'),reviewHtml);
await writeFile(outputPath('.gitignore'),'html/\n');
const validation=await validateReview(manifest,resources);
await writeFile(outputPath('reports','automated-qc.json'),JSON.stringify(validation,null,2));
if(validation.failures.length)throw new Error(JSON.stringify(validation.failures));
console.log(`PASS: ${manifest.jobs.length} PDFs, ${allPages.length} rasterized PDF pages; review at ${REVIEW_ROOT}`);
