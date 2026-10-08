import {readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {reviewPath,loadStationeryResources} from './resources.mjs';
import {sha256,jsonFile} from '../resources.mjs';
const manifest=JSON.parse(await readFile(reviewPath('page-format-manifest.json'),'utf8'));
const config=await jsonFile('qc/prompt-04.json'),resources=await loadStationeryResources();
const browserReport=JSON.parse(await readFile(reviewPath('reports/editor-browser-qc.json'),'utf8'));
const extra=JSON.parse(await readFile(reviewPath('reports/wide-content-and-clearance-qc.json'),'utf8'));
const inspection=JSON.parse(await readFile(reviewPath('inspection/index.json'),'utf8'));
const editorArt=JSON.parse(await readFile(reviewPath('editable/editor-artwork-manifest.json'),'utf8'));
const editorExports=JSON.parse(await readFile(reviewPath('reports/editor-export-qc.json'),'utf8'));
const editorHtml=await readFile(reviewPath('editable/midnight-seance-stationery-editor.html'),'utf8');
const editorClearance=JSON.parse(await readFile(reviewPath('reports/editor-clearance-qc.json'),'utf8'));
const failures=[],ink=[];
const defaults=manifest.jobs.filter(j=>!j.scenario),maximum=manifest.jobs.filter(j=>j.scenario==='maximum');
const check=(valid,message)=>{if(!valid)failures.push(message);};
const typography=JSON.parse(await readFile(reviewPath('reports/typography-qc.json'),'utf8'));
const polishEvidence=JSON.parse(await readFile(reviewPath('reports/polish-review-evidence.json'),'utf8'));
check(typography.status==='PASS'&&typography.checks.length===6,'Category type minimum verification incomplete');
check(polishEvidence.typography.status==='VISUALLY_INSPECTED_PASS'&&polishEvidence.artworkConsistencyStatus==='VISUALLY_INSPECTED_PASS','Polish review evidence incomplete');
check(resources.productionVariants.assets.length===52&&resources.productionVariants.assets.every(a=>a.status==='VISUALLY_INSPECTED_PASS'&&a.transparentPerimeter),'Production variant inspections incomplete');
for(const p of polishEvidence.typography.pages)check(sha256(await readFile(reviewPath(p.pngPath)))===p.pngSha256,'Actual-size typography inspection is stale');
check(defaults.length===config.expectedDefaultPdfCount,'Incomplete default format matrix');
check(defaults.reduce((n,j)=>n+j.pages.length,0)===config.expectedDefaultPdfPages,'Wrong default PDF page count');
check(maximum.length===config.expectedMaximumPdfCount,'Missing maximum-content PDF');
check(maximum.reduce((n,j)=>n+j.pages.length,0)===config.expectedMaximumPdfPages,'Wrong maximum-content page count');
check(browserReport.status==='PASS'&&browserReport.checks.length===config.expectedEditorBrowserChecks,'Incomplete Chrome/Edge editor verification');
check(editorClearance.status==='PASS'&&editorClearance.checks.length===2&&editorClearance.checks.every(c=>c.wideHostDecorationOverlapBlocked&&c.accentedHostRecovery),'Customer decoration-overlap rejection failed');
check(manifest.stressChecks.length===90&&manifest.stressChecks.every(c=>c.passed),'Missing or failed text stress checks');
check(extra.checks.length===108&&extra.checks.every(c=>!c.artworkClearance.length&&(c.scenario==='maximum-wide'||c.result==='FITS')),'Missing or failed full/economy stress and artwork-clearance checks');
check(inspection.pageCount===185&&inspection.batches.every(b=>b.status==='VISUALLY_INSPECTED_PASS'),'Not every current PDF page has an individual visual inspection');
const seen=new Set();
for(const batch of inspection.batches)for(const p of batch.pages){
  check(sha256(await readFile(reviewPath(p.path)))===p.sha256,`Visual inspection is stale: ${p.path}`);seen.add(p.path);
}
check(seen.size===185,'Duplicate or missing visual inspection records');
check(editorArt.status==='TECHNICAL_PASS'&&editorArt.assets.length>0,'Missing editor derivative QC');
for(const a of editorArt.assets){
  const source=resources.artworkManifest.assets.find(s=>s.id===a.id&&s.treatment===a.treatment);
  check(source?.sha256===a.sourceSha256&&a.transparentPerimeter&&a.minPlacedPpi>=590,`Editor derivative failed: ${a.id}/${a.treatment}`);
}
check(!editorHtml.includes('src:"assets/')&&!editorHtml.includes('src="assets/'),'Editor still requires an artwork folder');
check(editorExports.status==='PASS'&&editorExports.checks.length===4&&editorExports.checks.every(c=>c.visualStatus==='VISUALLY_INSPECTED_PASS'),'Edited PDF exports are not fully inspected');
for(const job of editorExports.checks){
  check(sha256(await readFile(reviewPath(job.pdf)))===job.sha256&&!job.probe.issues.length,'Edited PDF changed or failed fit');
  for(const p of job.pages){check(sha256(await readFile(reviewPath(p.pngPath)))===p.pngSha256,'Edited PNG changed');check((await sharp(reviewPath(p.pngPath)).metadata()).density===300,'Edited PNG is not 300 dpi');}
}
for(const item of resources.inventory.pages)for(const theme of resources.inventory.treatments)for(const format of item.formats){
  check(defaults.filter(j=>j.id===item.id&&j.theme===theme&&j.format===format).length===1,`Missing or duplicate edition: ${item.id}/${theme}/${format}`);
}
const defaultPreviewHashes=new Set();
for(const job of manifest.jobs){
  check(sha256(await readFile(reviewPath(job.pdf)))===job.sha256,`PDF changed: ${job.name}`);
  check(!job.probe.issues.length,`Failed browser preflight: ${job.name}`);
  const dims=job.format==='native'?resources.inventory.pages.find(i=>i.id===job.id).nativeMm:resources.inventory.carrierSizesMm[job.format];
  for(const page of job.pages){
    const bytes=await readFile(reviewPath(page.pngPath)),meta=await sharp(bytes).metadata();
    check(sha256(bytes)===page.pngSha256,`Preview changed: ${page.pngPath}`);
    check(meta.density===300&&meta.width===page.widthPx&&meta.height===page.heightPx,`Wrong PNG resolution: ${page.pngPath}`);
    check(Math.abs(page.widthMm-dims[0])<=config.dimensionToleranceMm&&Math.abs(page.heightMm-dims[1])<=config.dimensionToleranceMm,`Wrong physical dimensions: ${job.name}`);
    check(page.text.trim()&&!page.text.includes('\uFFFD'),'Blank page or missing glyph');
    check(page.embeddedFontStreams.length>0&&page.embeddedFontStreams.every(f=>f.embedded),`Unembedded font: ${job.name}`);
    if(!job.scenario){check(!defaultPreviewHashes.has(page.pngSha256),`Unexpected duplicate default page: ${page.pngPath}`);defaultPreviewHashes.add(page.pngSha256);}
    if(job.theme==='economy'){
      const {data,info}=await sharp(bytes).resize({width:600}).removeAlpha().greyscale().raw().toBuffer({resolveWithObject:true});
      const averageInkFraction=[...data].reduce((n,v)=>n+(255-v)/255,0)/(info.width*info.height);
      ink.push({page:page.pngPath,averageInkFraction});check(averageInkFraction<=config.maximumEconomyAverageInkFraction,`Excessive economy ink: ${page.pngPath}`);
    }
  }
  for(const art of job.probe.artwork){
    check(art.ppi>=299.9,`Low-resolution artwork ${job.name}/${art.id}`);
    check(art.treatment===(job.theme==='economy'?'economy':'signature'),`Incorrect artwork treatment ${job.name}/${art.id}`);
    check(resources.artworkManifest.assets.some(a=>a.id===art.id&&a.treatment===art.treatment),`Unapproved artwork ${job.name}/${art.id}`);
  }
}
const report={status:failures.length?'FAIL':'AUTOMATED_PASS_VISUAL_APPROVAL_PENDING',milestone:4,pdfCount:manifest.jobs.length,pageCount:manifest.jobs.reduce((n,j)=>n+j.pages.length,0),defaultPdfCount:defaults.length,defaultPages:defaults.reduce((n,j)=>n+j.pages.length,0),maximumPdfCount:maximum.length,maximumPages:maximum.reduce((n,j)=>n+j.pages.length,0),browserChecks:browserReport.checks.length,stressChecks:manifest.stressChecks.length,minimumPlacedPpi:Math.min(...manifest.jobs.flatMap(j=>j.probe.artwork.map(a=>a.ppi))),minimumFieldTypePt:Math.min(...manifest.jobs.flatMap(j=>j.probe.fields.map(f=>f.pt))),maximumEconomyAverageInkFraction:Math.max(...ink.map(i=>i.averageInkFraction)),ink,failures};
report.additionalStressChecks=extra.checks.length;report.wideStressRejected=extra.checks.filter(c=>c.scenario==='maximum-wide'&&c.result==='REJECTED_BY_FIT_CHECK').length;
report.individuallyInspectedProductionAndStressPages=seen.size;report.editedPdfCount=editorExports.checks.length;report.editedPdfPages=editorExports.checks.reduce((n,c)=>n+c.pages.length,0);
report.individuallyInspectedTotalPdfPages=seen.size+report.editedPdfPages;report.editorDerivativeAssets=editorArt.assets.length;
report.minimumEditorPlacedPpi=Math.min(...editorArt.assets.map(a=>a.minPlacedPpi));report.editorHtmlBytes=Buffer.byteLength(editorHtml);report.editorSha256=sha256(Buffer.from(editorHtml));report.validatedSourceHash=resources.stationeryHash;
report.editorDecorationOverlapBrowserChecks=editorClearance.checks.length;
await writeFile(reviewPath('reports','automated-qc.json'),JSON.stringify(report,null,2));
await writeFile(reviewPath('reports','artwork-usage.json'),JSON.stringify(resources.inventory.pages.map(i=>({id:i.id,artworkIds:[...new Set(defaults.filter(j=>j.id===i.id).flatMap(j=>j.probe.artwork.map(a=>a.id)))],treatments:['signature','economy']})),null,2));
if(failures.length)throw Error(JSON.stringify(failures));
console.log(JSON.stringify({...report,ink:undefined},null,2));
