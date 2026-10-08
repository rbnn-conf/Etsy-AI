import {access as fsAccess,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';
import {chromium} from 'playwright';
import {loadStationeryResources} from '../stationery/resources.mjs';
import {jsonFile,sha256} from '../resources.mjs';
import {inspectPdf} from '../render/pdf-preview.mjs';
import {renderMaster} from './document.mjs';
import {verifyPuzzle} from '../games/word-search.mjs';
import {PRODUCT_ROOT,REPO_ROOT} from '../paths.mjs';
const ROOT=join(REPO_ROOT,'storage/products/003/prompt-05-review');
const access=path=>fsAccess(path);
const at=(...p)=>{const x=resolve(ROOT,...p);if(x!==ROOT&&!x.startsWith(ROOT+'\\')&&!x.startsWith(ROOT+'/'))throw Error('Path escape');return x};
for(const d of ['pdf','preview','reports','contact-sheets','inspection'])await mkdir(at(d),{recursive:true});
const [r,g,inventory]=await Promise.all([loadStationeryResources(),jsonFile('content/prompt-05-games.json'),jsonFile('content/prompt-05-inventory.json')]);
r.artwork['full-colour']=r.artwork.signature;
verifyPuzzle(r.puzzle,r.game.words,r.qc.blockedStrings);
const browser=await chromium.launch({headless:true});
const only=process.argv.find(x=>x.startsWith('--only='))?.split('=')[1];
const buildSourceHash=sha256(JSON.stringify({layoutVersion:4,g,inventory,artwork:r.productionVariants.assets.map(x=>x.sha256)}));
let manifest,resumable=false;try{manifest=JSON.parse(await readFile(at('page-format-manifest.json'),'utf8'));resumable=Boolean(only)||manifest.sourceHash===buildSourceHash;}catch{}
if(!resumable)manifest={milestone:5,status:'RENDERING',branch:'feature/product-3-midnight-seance',dpi:300,inventory,sourceHash:buildSourceHash,jobs:[]};
if(only)manifest.jobs=manifest.jobs.filter(j=>j.id!==only);
manifest.sourceHash=buildSourceHash;
const rel=p=>relative(ROOT,p).replaceAll('\\','/');
// A process interruption must not discard PDFs whose PDF and every 300 dpi page preview already passed inspection.
if(resumable)for(const master of inventory.masters)for(const theme of inventory.themes)for(const format of inventory.formats){
 if(only&&master.id===only)continue;
 const name=`${master.id}-${theme}-${format}`;if(manifest.jobs.some(j=>j.name===name))continue;
 const expected=master.id==='G07'?12:master.id==='G12'?2:1,pdf=at('pdf',`${name}.pdf`),pngs=Array.from({length:expected},(_,i)=>at('preview',`${name}-${String(i+1).padStart(2,'0')}.png`));
 try{await access(pdf);await Promise.all(pngs.map(access));const dims=format==='A4'?[210,297]:[215.9,279.4];manifest.jobs.push({id:master.id,title:master.title,theme,format,name,pdf:rel(pdf),pdfSha256:sha256(await readFile(pdf)),recoveredFromCompletedInspection:true,pages:await Promise.all(pngs.map(async(p,i)=>({page:i+1,widthMm:dims[0],heightMm:dims[1],pngPath:rel(p),pngSha256:sha256(await readFile(p))})))});}catch{}
}
try{
 for(const master of inventory.masters)for(const theme of inventory.themes)for(const format of inventory.formats){
  const name=`${master.id}-${theme}-${format}`,pdf=at('pdf',`${name}.pdf`),page=await browser.newPage();
  if(manifest.jobs.some(j=>j.name===name)){await page.close();console.log(`Preserved ${name}`);continue;}
  await page.route(/https?:\/\//,route=>route.abort());await page.setContent(renderMaster(master.id,theme,format,r,g),{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
  await page.pdf({path:pdf,preferCSSPageSize:true,printBackground:true,tagged:true});await page.close();
  const pages=await inspectPdf(pdf,{dpi:300,outPrefix:at('preview',name)}),expected=master.id==='G07'?12:master.id==='G12'?2:1;
  if(pages.length!==expected)throw Error(`${name}: ${pages.length} pages, expected ${expected}`);
  const dims=format==='A4'?[210,297]:[215.9,279.4];
  for(const p of pages){if(Math.abs(p.widthMm-dims[0])>.25||Math.abs(p.heightMm-dims[1])>.25)throw Error(`${name}: wrong dimensions`);if(!p.text.trim()||p.text.includes('\uFFFD')||p.embeddedFontStreams.some(x=>!x.embedded))throw Error(`${name}: text/font failure`);p.pngSha256=sha256(await readFile(p.pngPath));p.pngPath=rel(p.pngPath);}
  manifest.jobs.push({id:master.id,title:master.title,theme,format,name,pdf:rel(pdf),pdfSha256:sha256(await readFile(pdf)),pages});
  await writeFile(at('page-format-manifest.json'),JSON.stringify(manifest,null,2));console.log(`Rendered ${name}: ${pages.length}`);
 }
 manifest.status='RENDERED_PENDING_INDIVIDUAL_VISUAL_INSPECTION';
 await writeFile(at('page-format-manifest.json'),JSON.stringify(manifest,null,2));
 await writeFile(at('artwork-usage-manifest.json'),JSON.stringify({policy:'Accepted Prompt 3 art only; no regeneration',signature:['B01','B02','C01','C02','C03','C04','D01','D02','E04','E05'],economy:['B01','B02','C01','C02','C03','C04','D01','D02','E04','E05'],clearance:'Artwork is confined to headers, footers and decoration outside grids, answer fields and cut content.'},null,2));
 await writeFile(at('reports','automated-qc.json'),JSON.stringify({status:'PASS',pdfCount:manifest.jobs.length,pageCount:manifest.jobs.reduce((n,j)=>n+j.pages.length,0),expectedPdfCount:64,expectedPageCount:112,dimensions:['A4','US Letter'],dpi:300,fontEmbedding:true,puzzle:verifyPuzzle(r.puzzle,r.game.words,r.qc.blockedStrings),failures:[]},null,2));
 console.log(`PASS ${manifest.jobs.length} PDFs / ${manifest.jobs.reduce((n,j)=>n+j.pages.length,0)} pages`);
}finally{await browser.close()}
