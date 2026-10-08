import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {reviewPath,loadStationeryResources,artworkMasks} from './resources.mjs';
import {regionalFixture} from './content.mjs';
import {probeDocument} from './preflight.mjs';
import {inspectPdf} from '../render/pdf-preview.mjs';
import {sha256} from '../resources.mjs';
const resources=await loadStationeryResources(),checks=[],external=[];
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1450,height:1100}});
  await page.route(/https?:\/\//,r=>{external.push(r.request().url());r.abort();});
  await page.goto(pathToFileURL(reviewPath('editable/midnight-seance-stationery-editor.html')).href);
  await page.waitForFunction(()=>window.stationeryReady());
  await page.screenshot({path:reviewPath('EDITOR-PREVIEW.png'),fullPage:true});
  if(!await page.evaluate(()=>Object.values(window.STATIONERY_RESOURCES.artwork).every(theme=>Object.values(theme).every(a=>a.src.startsWith('data:image/webp;base64,')))))throw Error('Editor artwork is not self-contained');
  await mkdir(reviewPath('reports/editor-export'),{recursive:true});
  for(const [id,theme,format] of [['S01','full-colour','native'],['S11','full-colour','native'],['S14','full-colour','a4'],['S15','economy','us-letter']]){
    const values=regionalFixture(resources.stationeryDefaults,id,'uk');
    if(id==='S14')values.labels='Herb-roasted chicken\nWild mushroom risotto';
    await page.locator('#load').setInputFiles({name:'wording.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:4,id,theme,format,values}))});
    await page.waitForFunction(id=>window.stationeryReady()&&window.stationeryState.id===id,id);
    const frame=page.frames()[1];
    await frame.evaluate(()=>{window.print=()=>{window.printInvocations=(window.printInvocations??0)+1;};});
    await page.click('#print');
    if(await frame.evaluate(()=>window.printInvocations)!==1)throw Error('Print button did not target the printable preview');
    const html=await frame.content(),output=await browser.newPage();
    await output.setContent(html,{waitUntil:'load'});
    await output.addScriptTag({content:`window.probeDocument=${probeDocument.toString()}`});
    const probe=await output.evaluate(({catalogue,masks})=>window.probeDocument(document,catalogue,masks),{catalogue:resources.catalogue,masks:artworkMasks(resources)});
    if(probe.issues.length)throw Error(JSON.stringify(probe.issues));
    const name=`${id}-${theme}-${format}-edited`,pdf=`reports/editor-export/${name}.pdf`;
    await output.pdf({path:reviewPath(pdf),preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false,margin:{top:0,right:0,bottom:0,left:0}});
    const pages=await inspectPdf(reviewPath(pdf),{dpi:300,outPrefix:reviewPath('reports/editor-export',name)});
    const dims=format==='native'?resources.inventory.pages.find(i=>i.id===id).nativeMm:resources.inventory.carrierSizesMm[format];
    for(const p of pages){
      if(Math.abs(p.widthMm-dims[0])>.25||Math.abs(p.heightMm-dims[1])>.25||!p.text.trim()||!p.embeddedFontStreams.every(f=>f.embedded))throw Error('Edited PDF dimensions/text/fonts failed');
      p.pngPath=`reports/editor-export/${name}-${String(p.page).padStart(2,'0')}.png`;p.pngSha256=sha256(await readFile(reviewPath(p.pngPath)));
    }
    checks.push({id,theme,format,pdf,sha256:sha256(await readFile(reviewPath(pdf))),printPreviewInvoked:true,embeddedAssets:true,probe,pages,visualStatus:'PENDING_INDIVIDUAL_INSPECTION'});
    await output.close();
  }
  if(external.length)throw Error('Editor requested the network');
}finally{await browser.close();}
await writeFile(reviewPath('reports/editor-export-qc.json'),JSON.stringify({status:'TECHNICAL_PASS_VISUAL_PENDING',checks},null,2));
console.log('Four edited PDF exports rendered to 300 dpi PNG; print-preview targeting and offline embedded assets passed.');
