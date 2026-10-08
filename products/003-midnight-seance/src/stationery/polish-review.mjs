import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,relative} from 'node:path';
import sharp from 'sharp';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {PRODUCT_ROOT,REPO_ROOT} from '../paths.mjs';
import {reviewPath,STATIONERY_REVIEW_ROOT} from './resources.mjs';
import {inspectPdf} from '../render/pdf-preview.mjs';
import {sha256} from '../resources.mjs';
import {escapeText} from '../components/index.mjs';
const manifest=JSON.parse(await readFile(reviewPath('page-format-manifest.json'),'utf8'));
const previousRoot=join(REPO_ROOT,'storage/products/003/prompt-04-review');
const previous=JSON.parse(await readFile(join(previousRoot,'page-format-manifest.json'),'utf8'));
await mkdir(reviewPath('focused'),{recursive:true});
await mkdir(reviewPath('contacts'),{recursive:true});
const focused=[['S01','full-colour','native'],['S01','economy','native'],['S03','full-colour','native'],['S03','economy','native'],['S11','full-colour','native'],['S11','economy','native'],['S15','full-colour','a4'],['S14','full-colour','a4'],['S13','full-colour','a4'],['S18','full-colour','native']].map(([id,theme,format])=>manifest.jobs.find(j=>j.id===id&&j.theme===theme&&j.format===format&&!j.scenario));
async function sheet(path,entries,columns=2,width=850,height=1100){
  const gap=15,tiles=[];
  for(const entry of entries){
    const image=await sharp(entry.path).resize({width:width-20,height:height-60,fit:'contain',background:'white'}).png().toBuffer();
    const label=Buffer.from(`<svg width="${width}" height="50"><rect width="100%" height="100%" fill="white"/><text x="12" y="21" font-family="Arial" font-size="17">${escapeText(entry.label)}</text><text x="12" y="42" font-family="Arial" font-size="13" fill="#701F2A">${escapeText(entry.note??'Actual PDF raster — open individual page for print detail')}</text></svg>`);
    tiles.push(await sharp({create:{width,height,channels:3,background:'white'}}).composite([{input:image,top:5,left:10},{input:label,top:height-50,left:0}]).png().toBuffer());
  }
  await sharp({create:{width:columns*(width+gap)+gap,height:Math.ceil(tiles.length/columns)*(height+gap)+gap,channels:3,background:'#342434'}}).composite(tiles.map((input,i)=>({input,left:gap+i%columns*(width+gap),top:gap+Math.floor(i/columns)*(height+gap)}))).png().toFile(path);
}
const focusedEntries=focused.flatMap(j=>j.pages.map(p=>({path:reviewPath(p.pngPath),label:`${j.id} · ${j.theme} · ${j.format} · ${p.page}`})));
await sheet(reviewPath('FOCUSED-POLISH-REVIEW.png'),focusedEntries,3,720,970);
await writeFile(reviewPath('focused/index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><title>Prompt 4 final polish — focused review</title><style>body{margin:30px auto;max-width:1600px;background:#f4ebdd;font:18px Georgia;line-height:1.5}a{color:#701f2a}img{max-width:100%}section{background:white;margin:30px;padding:20px}h1,h2{font-weight:400}</style><h1>Prompt 4 final polish · ten requested review items</h1><p>S14 has two A4 sheets to show all six labels. Visual approval is pending. Print PDFs at 100% with the matching paper size.</p>${focused.map(j=>`<section><h2>${j.id} · ${j.theme} · ${j.format}</h2><a href="../${j.pdf}">Open actual PDF</a>${j.pages.map(p=>`<p><a href="../${p.pngPath}"><img src="../${p.pngPath}" alt="${j.name} page ${p.page}"></a></p>`).join('')}</section>`).join('')}`);
const comparisons=[];
for(const id of ['S01','S03','S11','S12','S13','S14','S15','S16','S18'])for(const theme of ['full-colour','economy']){
  const format=['S13','S14','S15'].includes(id)?'a4':'native';
  const before=previous.jobs.find(j=>j.id===id&&j.theme===theme&&j.format===format&&!j.scenario);
  const after=manifest.jobs.find(j=>j.id===id&&j.theme===theme&&j.format===format&&!j.scenario);
  comparisons.push({path:join(previousRoot,before.pages[0].pngPath),label:`BEFORE · ${id} · ${theme}`,note:'Preserved candidate 7cf316e'});
  comparisons.push({path:reviewPath(after.pages[0].pngPath),label:`AFTER · ${id} · ${theme}`,note:'Prompt 4 refinement — owner approval pending'});
}
await sheet(reviewPath('BEFORE-AND-AFTER.png'),comparisons,4,650,880);
const variants=JSON.parse(await readFile(join(PRODUCT_ROOT,'artwork/prompt-04-polish/manifest.json'),'utf8'));
const ids=[...new Set(variants.assets.map(a=>a.id))],artSheets=[];
for(let i=0;i<ids.length;i+=4){
  const entries=[];
  for(const id of ids.slice(i,i+4))for(const treatment of ['signature','economy']){
    const variant=variants.assets.find(a=>a.id===id&&a.treatment===treatment);
    entries.push({path:join(PRODUCT_ROOT,'artwork',variant.sourceFile),label:`${id} · ${treatment} · original`,note:'Accepted Prompt 3 original — unchanged'});
    entries.push({path:join(PRODUCT_ROOT,'artwork',variant.file),label:`${id} · ${treatment} · production`,note:'Canvas preserved · no blur or invented engraving'});
  }
  const file=`contacts/ARTWORK-CONSISTENCY-${String(i/4+1).padStart(2,'0')}.png`;
  await sheet(reviewPath(file),entries,4,500,400);artSheets.push(file);
}
await writeFile(reviewPath('contacts/ARTWORK-CONSISTENCY.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><title>Artwork consistency inspection</title><style>body{font:18px Georgia;margin:30px}img{max-width:100%}</style><h1>Artwork consistency · ${variants.assets.length} non-destructive production variants</h1><p>Each row: original Signature, prepared Signature, original economy, prepared economy. RGBA variants are displayed on white to expose alpha fringes. Images are technical review evidence.</p>${artSheets.map(file=>`<p><a href="../${file}"><img src="../${file}" alt="Artwork comparison ${file}"></a></p>`).join('')}`);
// Embed actual PDF page regions at 1:1, retaining vector lettering and embedded fonts.
const mm=72/25.4,doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);
const samples=[['S01','date'],['S01','address'],['S01','rsvp'],['S03','host'],['S11','mainName'],['S11','mainDetail'],['S11','footer'],['S12','detail4'],['S13','names'],['S14','note'],['S15','detail'],['S16','host'],['S18','message'],['S18','signoff']];
let page,y;
for(const [id,label] of samples){
  const job=manifest.jobs.find(j=>j.id===id&&j.theme==='full-colour'&&j.format==='native'&&!j.scenario),field=job.probe.fields.find(f=>f.label===label);
  if(!job||!field)throw Error('Missing typography sample');
  const source=await PDFDocument.load(await readFile(reviewPath(job.pdf))),sourcePage=source.getPages()[0];
  const cropPad=2,widthPt=field.bounds.width*.75+cropPad*2,heightPt=field.bounds.height*.75+cropPad*2;
  if(!page||y-heightPt-35<20*mm){page=doc.addPage([210*mm,297*mm]);y=260*mm;page.drawText('Actual-size typography inspection - print at 100%',{x:12*mm,y:280*mm,size:12,font});page.drawText('Vector crops of current customer PDFs; no scaling or raster lettering.',{x:12*mm,y:272*mm,size:9,font});}
  const left=Math.max(0,field.bounds.left*.75-cropPad),bottom=Math.max(0,sourcePage.getHeight()-field.bounds.bottom*.75-cropPad);
  const embedded=await doc.embedPage(sourcePage,{left,bottom,right:left+widthPt,top:bottom+heightPt});
  page.drawText(`${id} / ${label} / ${field.pt.toFixed(1)} pt`,{x:12*mm,y,size:9,font,color:rgb(.44,.12,.17)});y-=heightPt+8;
  page.drawPage(embedded,{x:12*mm,y,width:widthPt,height:heightPt});y-=20;
}
for(const p of doc.getPages()){p.drawLine({start:{x:12*mm,y:12*mm},end:{x:112*mm,y:12*mm},thickness:.5});p.drawText('100 mm calibration line - measure after printing',{x:12*mm,y:7*mm,size:8,font});}
const pdf='contacts/ACTUAL-SIZE-TYPOGRAPHY.pdf';await writeFile(reviewPath(pdf),await doc.save());
const pages=await inspectPdf(reviewPath(pdf),{dpi:300,outPrefix:reviewPath('contacts/ACTUAL-SIZE-TYPOGRAPHY')});
for(const p of pages){p.pngSha256=sha256(await readFile(p.pngPath));p.pngPath=relative(STATIONERY_REVIEW_ROOT,p.pngPath).replaceAll('\\','/');}
await writeFile(reviewPath('reports/polish-review-evidence.json'),JSON.stringify({milestone:4,baselineCommit:'7cf316e78435d4e9969046b842f161b10bf4fc1f',focusedItems:focused.map(j=>j.name),focusedPdfPages:focusedEntries.length,artworkConsistencySheets:artSheets,typography:{pdf,sha256:sha256(await readFile(reviewPath(pdf))),pages,status:'PENDING_INDIVIDUAL_VISUAL_INSPECTION'},paperDepth:{decision:'Omitted',reason:'Retain approved clean antique ivory; added grain is not necessary for coherence and adds print noise. Economy remains untextured white.'}},null,2));
const extras=['focused/index.html','FOCUSED-POLISH-REVIEW.png','BEFORE-AND-AFTER.png','contacts/ARTWORK-CONSISTENCY.html',...artSheets,pdf,...pages.map(p=>p.pngPath)];
const indexPath=reviewPath('REVIEW.html'),html=await readFile(indexPath,'utf8');
await writeFile(indexPath,html.replace('<h1>',`<ul>${extras.map(file=>`<li><a href="${file}">${file}</a></li>`).join('')}</ul><h1>`));
await writeFile(reviewPath('.gitignore'),'inspection/batch-*.png\nstage-paths.nul\nreports/*failure*\nreports/*-clearance.png\n');
console.log(`Prepared ${focused.length} focused items / ${focusedEntries.length} pages, ${artSheets.length} artwork comparison sheets and ${pages.length} actual-size typography PDF pages.`);
