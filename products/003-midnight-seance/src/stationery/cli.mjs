import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import sharp from 'sharp';
import {loadStationeryResources,reviewPath,STATIONERY_REVIEW_ROOT,artworkMasks} from './resources.mjs';
import {renderStationery} from './document.mjs';
import {probeDocument} from './preflight.mjs';
import {inspectPdf} from '../render/pdf-preview.mjs';
import {sha256} from '../resources.mjs';
import {buildStationeryEditor} from './editor-build.mjs';
import {validateStationery,regionalFixture} from './content.mjs';
import {startRenderServer} from './local-server.mjs';

const resources=await loadStationeryResources();
const offlineFonts=resources.fonts;
const server=await startRenderServer(resources);
resources.fonts=resources.fontEvidence.map(f=>`@font-face{font-family:'${f.family}';src:url(${server.origin}/fonts/${f.file});font-style:${f.style};font-weight:${f.weight};font-display:block;${f.family==='Bodoni Moda'?'ascent-override:95%;descent-override:25%;line-gap-override:0%;':''}}`).join('');
for(const asset of resources.artworkManifest.assets)resources.artwork[asset.treatment][asset.id].src=`${server.origin}/artwork/${asset.file}`;
for(const directory of ['pdf','preview','reports','editable','contacts'])await mkdir(reviewPath(directory),{recursive:true});
const browser=await chromium.launch({headless:true});
const manifest={milestone:4,status:'RENDERING_CANDIDATE',sourceHash:resources.stationeryHash,inventory:resources.inventory,fontEvidence:resources.fontEvidence,dpi:300,jobs:[],stressChecks:[],editorChecks:[]};
const relativePath=p=>relative(STATIONERY_REVIEW_ROOT,p).replaceAll('\\','/');
const probeFunction=`(${probeDocument.toString()})(document,${JSON.stringify(resources.catalogue)},${JSON.stringify(artworkMasks(resources))})`;
try{
  for(const item of resources.inventory.pages){
    const defaultValues=resources.stationeryDefaults[item.id];
    const validation=validateStationery(item.id,defaultValues,resources.stationerySchemas);
    if(!validation.valid)throw Error(`${item.id}: ${JSON.stringify(validation)}`);
    for(const theme of resources.inventory.treatments)for(const format of item.formats){
      const page=await browser.newPage();await page.goto(server.origin);
      const config={id:item.id,theme,format,values:defaultValues};
      await page.setContent(renderStationery(config,resources),{waitUntil:'load'});
      const probe=await page.evaluate(probeFunction);
      const name=`${item.id}-${theme}-${format}`;
      if(probe.issues.length){await page.screenshot({path:reviewPath('reports',`${name}-failure.png`),fullPage:true});await writeFile(reviewPath('reports',`${name}-failure.json`),JSON.stringify(probe,null,2));throw Error(`${name}: ${probe.issues.join('; ')}`);}
      if(process.argv.includes('--probe')){console.log(`PASS ${name}`);await page.close();continue;}
      const path=reviewPath('pdf',`${name}.pdf`);
      await page.pdf({path,preferCSSPageSize:true,printBackground:true,tagged:true});
      await page.close();
      const pages=await inspectPdf(path,{dpi:300,outPrefix:reviewPath('preview',name)});
      if(pages.length!==probe.pageCount)throw Error(`Unexpected blank or extra pages: ${name}`);
      for(const p of pages){
        const dims=format==='native'?item.nativeMm:resources.inventory.carrierSizesMm[format];
        if(Math.abs(p.widthMm-dims[0])>.25||Math.abs(p.heightMm-dims[1])>.25)throw Error(`Wrong PDF size: ${name}`);
        if(!p.text.trim()||p.text.includes('\uFFFD')||p.embeddedFontStreams.some(f=>!f.embedded))throw Error(`Blank page, broken text or font embedding: ${name}`);
        p.pngSha256=sha256(await readFile(p.pngPath));p.pngPath=relativePath(p.pngPath);
      }
      manifest.jobs.push({...config,values:undefined,name,pdf:relativePath(path),sha256:sha256(await readFile(path)),probe,pages});
      await writeFile(reviewPath('page-format-manifest.json'),JSON.stringify(manifest,null,2));
      console.log(`Rendered ${name}: ${pages.length} page(s)`);
    }
  }
  if(!process.argv.includes('--probe')){
    const editor=await buildStationeryEditor({...resources,fonts:offlineFonts});
    for(const item of resources.inventory.pages){
      const page=await browser.newPage();await page.route(/https?:\/\//,route=>route.abort());await page.goto(pathToFileURL(editor).href);
      await page.selectOption('#item',item.id);await page.waitForFunction(()=>window.stationeryReady(),{},{timeout:30000});
      const state=await page.evaluate(()=>structuredClone(window.stationeryState));
      if(JSON.stringify(state.values)!==JSON.stringify(resources.stationeryDefaults[item.id]))throw Error(`Editor default mismatch: ${item.id}`);
      const key=Object.keys(state.values)[0];
      await page.locator(`[data-key="${key}"]`).fill('W'.repeat(resources.stationerySchemas[item.id][key].max+1));
      await page.waitForFunction(()=>document.getElementById('status').dataset.state==='error'&&document.getElementById('print').disabled);
      if(!(await page.locator('#status').textContent()).includes('at most'))throw Error(`Missing useful overflow error: ${item.id}`);
      await page.click('#reset');await page.waitForFunction(()=>window.stationeryReady());
      const downloadPromise=page.waitForEvent('download');await page.click('#save');const download=await downloadPromise;await download.saveAs(reviewPath('reports',`${item.id}-saved.json`));
      const saved=JSON.parse(await readFile(reviewPath('reports',`${item.id}-saved.json`),'utf8'));
      if(JSON.stringify(saved.values)!==JSON.stringify(state.values))throw Error(`Editor save mismatch: ${item.id}`);
      saved.values[key]=state.values[key].slice(0,-1)+'!';
      await page.locator('#load').setInputFiles({name:'saved.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
      await page.waitForFunction(expected=>window.stationeryReady()&&JSON.stringify(window.stationeryState.values)===expected,JSON.stringify(saved.values));
      await page.click('#reset');await page.waitForFunction(()=>window.stationeryReady());
      manifest.editorChecks.push({id:item.id,offline:true,default:true,overflowRejected:true,reset:true,save:true,load:true});
      if(item.id==='S01')await page.screenshot({path:reviewPath('EDITOR-PREVIEW.png'),fullPage:true});
      await page.close();
    }
    manifest.editor='editable/midnight-seance-stationery-editor.html';
  }
  // Accepted stress content must fit without dropping below the supported type sizes.
  for(const item of resources.inventory.pages)for(const scenario of ['optional-empty','special','uk','us','maximum']){
    let values=regionalFixture(resources.stationeryDefaults,item.id,scenario);
    if(scenario==='optional-empty')for(const [key,rule] of Object.entries(resources.stationerySchemas[item.id]))if(!rule.required)values[key]='';
    if(scenario==='special')for(const key of ['host','names','signoff'])if(Object.hasOwn(values,key))values[key]=key==='names'?'Amélie & Jean-Luc\nChloë O’Neill\nEva-Marie Clark':'Amélie & Jean-Luc O’Neill';
    if(scenario==='maximum')for(const [key,rule] of Object.entries(resources.stationerySchemas[item.id])){
      if(rule.maxEntry){values[key]=Array.from({length:rule.maxLines},()=>('Alexandra Beatrice Laurent ').repeat(2).slice(0,rule.maxEntry)).join('\n');continue;}
      values[key]=('Velvet midnight garden ').repeat(Math.ceil(rule.max/23)).slice(0,rule.max);
    }
    const config={id:item.id,theme:'full-colour',format:item.formats[0],values},page=await browser.newPage();await page.goto(server.origin);
    await page.setContent(renderStationery(config,resources));
    const probe=await page.evaluate(probeFunction);
    if(probe.issues.length){await page.screenshot({path:reviewPath('reports',`${item.id}-${scenario}-failure.png`),fullPage:true});throw Error(`${item.id}/${scenario}: ${probe.issues.join('; ')}`);}
    manifest.stressChecks.push({id:item.id,scenario,passed:true,probe});
    if(scenario==='maximum'&&!process.argv.includes('--probe')){
      const name=`${item.id}-maximum`,path=reviewPath('pdf',`${name}.pdf`);await page.pdf({path,preferCSSPageSize:true,printBackground:true});
      const pages=await inspectPdf(path,{dpi:300,outPrefix:reviewPath('preview',name)});
      for(const p of pages){p.pngSha256=sha256(await readFile(p.pngPath));p.pngPath=relativePath(p.pngPath);}
      manifest.jobs.push({...config,values:undefined,scenario:'maximum',name,pdf:relativePath(path),sha256:sha256(await readFile(path)),probe,pages});
    }
    await page.close();console.log(`Stress PASS ${item.id}/${scenario}`);
  }
  manifest.status=process.argv.includes('--probe')?'PREFLIGHT_PASS':'RENDERED_PENDING_INDIVIDUAL_VISUAL_INSPECTION';
  await writeFile(reviewPath('page-format-manifest.json'),JSON.stringify(manifest,null,2));
  await writeFile(reviewPath('editor-field-manifest.json'),JSON.stringify(resources.stationerySchemas,null,2));
  await writeFile(reviewPath('reports','automated-qc.json'),JSON.stringify({status:manifest.status,pdfCount:manifest.jobs.length,pageCount:manifest.jobs.reduce((n,j)=>n+j.pages.length,0),stressChecks:manifest.stressChecks.length,editorChecks:manifest.editorChecks,failures:[]},null,2));
  if(!process.argv.includes('--probe')){
    for(const theme of resources.inventory.treatments){
      const invitation=manifest.jobs.find(j=>j.id==='S01'&&j.theme===theme&&j.format==='native');
      await sharp(reviewPath(invitation.pages[0].pngPath)).resize(1500,2100).withMetadata({density:300}).png().toFile(reviewPath(`S01-${theme}-digital.png`));
      await sharp(reviewPath(invitation.pages[0].pngPath)).resize(1500,2100).jpeg({quality:95}).toFile(reviewPath(`S01-${theme}-digital.jpg`));
    }
    console.log(`PASS ${manifest.jobs.length} PDFs / ${manifest.jobs.reduce((n,j)=>n+j.pages.length,0)} rendered pages`);
  }
}finally{await browser.close();await server.close();}
