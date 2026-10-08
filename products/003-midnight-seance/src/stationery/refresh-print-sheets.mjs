import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {relative} from 'node:path';
import {loadStationeryResources,reviewPath,STATIONERY_REVIEW_ROOT} from './resources.mjs';
import {startRenderServer} from './local-server.mjs';
import {renderStationery} from './document.mjs';
import {probeDocument} from './preflight.mjs';
import {inspectPdf} from '../render/pdf-preview.mjs';
import {sha256} from '../resources.mjs';
import {buildStationeryEditor} from './editor-build.mjs';
const manifest=JSON.parse(await readFile(reviewPath('page-format-manifest.json'),'utf8'));
const resources=await loadStationeryResources(),offlineFonts=resources.fonts,server=await startRenderServer(resources);
resources.fonts=resources.fontEvidence.map(f=>`@font-face{font-family:'${f.family}';src:url(${server.origin}/fonts/${f.file});font-style:${f.style};font-weight:${f.weight};font-display:block;${f.family==='Bodoni Moda'?'ascent-override:95%;descent-override:25%;line-gap-override:0%;':''}}`).join('');
for(const a of resources.artworkManifest.assets)resources.artwork[a.treatment][a.id].src=`${server.origin}/artwork/${a.file}`;
const browser=await chromium.launch({headless:true});
try{
  for(const job of manifest.jobs.filter(j=>!j.scenario&&j.format!=='native'&&!resources.inventory.pages.find(i=>i.id===j.id).reflow)){
    const page=await browser.newPage();await page.goto(server.origin);await page.setContent(renderStationery(job,resources));
    job.probe=await page.evaluate(`(${probeDocument.toString()})(document,${JSON.stringify(resources.catalogue)})`);
    if(job.probe.issues.length)throw Error(JSON.stringify({name:job.name,issues:job.probe.issues}));
    await page.pdf({path:reviewPath(job.pdf),preferCSSPageSize:true,printBackground:true,tagged:true});await page.close();
    job.sha256=sha256(await readFile(reviewPath(job.pdf)));
    job.pages=await inspectPdf(reviewPath(job.pdf),{dpi:300,outPrefix:reviewPath('preview',job.name)});
    for(const p of job.pages){p.pngSha256=sha256(await readFile(p.pngPath));p.pngPath=relative(STATIONERY_REVIEW_ROOT,p.pngPath).replaceAll('\\','/');}
    console.log(`Refreshed ${job.name}`);
  }
  manifest.sourceHash=resources.stationeryHash;
  manifest.printSheetCorrection='Removed nonessential footer text from the paper edge; essential guidance remains in the offline editor.';
  await writeFile(reviewPath('page-format-manifest.json'),JSON.stringify(manifest,null,2));
  await buildStationeryEditor({...resources,fonts:offlineFonts});
}finally{await browser.close();await server.close();}
