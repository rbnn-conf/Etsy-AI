import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import sharp from 'sharp';
import {reviewPath} from './resources.mjs';
import {PRODUCT_ROOT} from '../paths.mjs';
import {join} from 'node:path';
import {escapeText} from '../components/index.mjs';
const manifest=JSON.parse(await readFile(reviewPath('page-format-manifest.json'),'utf8'));
const fields=JSON.parse(await readFile(reviewPath('editor-field-manifest.json'),'utf8'));
const edited=JSON.parse(await readFile(reviewPath('reports/editor-export-qc.json'),'utf8'));
const defaultJobs=manifest.jobs.filter(j=>!j.scenario);
const representatives=theme=>manifest.inventory.pages.map(item=>defaultJobs.find(j=>j.id===item.id&&j.theme===theme&&j.format===item.formats[0]));
async function contact(file,entries,{columns=3,width=580,height=720}={}){
  const tiles=[];
  for(const entry of entries){
    const image=await sharp(reviewPath(entry.pngPath)).resize({width:width-20,height:height-65,fit:'contain',background:'white'}).png().toBuffer();
    const title=escapeText(entry.label);
    const label=Buffer.from(`<svg width="${width}" height="55"><rect width="100%" height="100%" fill="white"/><text x="12" y="22" font-family="Arial" font-size="15" fill="#171315">${title}</text><text x="12" y="44" font-family="Arial" font-size="12" fill="#701F2A">${escapeText(entry.note??'Review preview — open individual 300 dpi PNG for detail')}</text></svg>`);
    tiles.push(await sharp({create:{width,height,channels:3,background:'white'}}).composite([{input:image,left:10,top:5},{input:label,left:0,top:height-55}]).png().toBuffer());
  }
  const gap=14,rows=Math.ceil(tiles.length/columns);
  await sharp({create:{width:columns*(width+gap)+gap,height:rows*(height+gap)+gap,channels:3,background:'#342434'}}).composite(tiles.map((input,i)=>({input,left:gap+(i%columns)*(width+gap),top:gap+Math.floor(i/columns)*(height+gap)}))).png().toFile(reviewPath(file));
}
const entries=jobs=>jobs.flatMap(j=>j.pages.map(p=>({pngPath:p.pngPath,label:`${j.id} · ${j.theme} · ${j.format} · page ${p.page}`,note:manifest.inventory.pages.find(i=>i.id===j.id).name})));
for(const theme of manifest.inventory.treatments)await contact(theme==='economy'?'ECONOMY-CONTACT-SHEET.png':'FULL-COLOUR-CONTACT-SHEET.png',entries(representatives(theme)).filter(e=>e.label.endsWith('page 1')));
await contact('EDITABLE-ITEMS-CONTACT-SHEET.png',representatives('full-colour').map(j=>({pngPath:j.pages[0].pngPath,label:`${j.id} · ${Object.keys(fields[j.id]).length} personalisation fields`,note:manifest.inventory.pages.find(i=>i.id===j.id).name})));
await contact('MULTI-UP-CONTACT-SHEET.png',entries(defaultJobs.filter(j=>['S13','S14','S15','S16'].includes(j.id)&&j.format!=='native')),{columns:4,width:540,height:750});
await contact('MAXIMUM-CONTENT-CONTACT-SHEET.png',entries(manifest.jobs.filter(j=>j.scenario==='maximum')),{columns:4,width:540,height:650});
// Actual relative scale: every native small item uses exactly 3 pixels per millimetre.
const smallJobs=defaultJobs.filter(j=>['S13','S14','S15','S16'].includes(j.id)&&j.format==='native');
const composites=[],scale=3,canvasWidth=1700;let x=30,y=50,rowHeight=0;
for(const job of smallJobs)for(const p of job.pages){
  const item=manifest.inventory.pages.find(i=>i.id===job.id),w=Math.round(item.nativeMm[0]*scale),h=Math.round(item.nativeMm[1]*scale);
  if(x+w+20>canvasWidth){x=30;y+=rowHeight+55;rowHeight=0;}
  composites.push({input:await sharp(reviewPath(p.pngPath)).resize(w,h).png().toBuffer(),left:x,top:y});
  composites.push({input:Buffer.from(`<svg width="${w}" height="30"><text x="0" y="20" font-family="Arial" font-size="12">${job.id} · ${job.theme} · ${p.page}</text></svg>`),left:x,top:y+h});
  x+=w+30;rowHeight=Math.max(rowHeight,h);
}
const scaleLabel=Buffer.from('<svg width="1650" height="40"><text x="0" y="22" font-family="Arial" font-size="17">Small-format review · all items at 3 pixels/mm · relative scale only; print PDFs at 100%</text><line x1="1000" y1="25" x2="1300" y2="25" stroke="black"/><text x="1320" y="28" font-family="Arial" font-size="14">100 mm</text></svg>');
await sharp({create:{width:canvasWidth,height:y+rowHeight+60,channels:3,background:'white'}}).composite([{input:scaleLabel,left:30,top:5},...composites]).png().toFile(reviewPath('SMALL-FORMAT-RELATIVE-SCALE.png'));
const reference=await sharp(join(PRODUCT_ROOT,'design/reference/midnight-seance-concept-reference.png')).resize({width:1500}).png().toBuffer();
const meta=await sharp(reference).metadata();
const proofEntries=representatives('full-colour').filter(j=>['S01','S03','S11'].includes(j.id));
await contact('contacts/CONCEPT-PROOFS.png',entries(proofEntries),{columns:3,width:486,height:690});
const proof=await sharp(reviewPath('contacts/CONCEPT-PROOFS.png')).resize(1500).png().toBuffer(),proofMeta=await sharp(proof).metadata();
await sharp({create:{width:1540,height:meta.height+proofMeta.height+110,channels:3,background:'white'}}).composite([{input:Buffer.from('<svg width="1500" height="40"><text x="5" y="28" font-family="Arial" font-size="22">Concept reference above · deterministic Prompt 4 layouts below</text></svg>'),left:20,top:5},{input:reference,left:20,top:50},{input:proof,left:20,top:meta.height+80}]).png().toFile(reviewPath('CONCEPT-COMPARISON.png'));
await mkdir(reviewPath('telegram-review'),{recursive:true});
const selected=[['S01','full-colour','native'],['S03','full-colour','native'],['S11','full-colour','native'],['S04','economy','native'],['S18','economy','native'],['S15','economy','a4'],['S14','full-colour','a4']];
const telegramFiles=[];
for(const [id,theme,format] of selected){const job=defaultJobs.find(j=>j.id===id&&j.theme===theme&&j.format===format);const filename=`${id}-${theme}-${format}.png`;await sharp(reviewPath(job.pages[0].pngPath)).resize({width:1200,withoutEnlargement:true}).png().toFile(reviewPath('telegram-review',filename));telegramFiles.push(filename);}
await copyFile(reviewPath('EDITOR-PREVIEW.png'),reviewPath('telegram-review','EDITOR-PREVIEW.png'));telegramFiles.push('EDITOR-PREVIEW.png');
await copyFile(reviewPath('reports','automated-qc.json'),reviewPath('telegram-review','automated-qc.json'));telegramFiles.push('automated-qc.json');
await writeFile(reviewPath('telegram-review','delivery-manifest.json'),JSON.stringify({milestone:4,status:'PREPARED_NOT_SENT',reason:'No approved Product 3 recipient/review request is recorded; Telegram approval remains a Prompt 10 decision.',files:telegramFiles,containsCustomerZip:false,etsyAction:false},null,2));
const contactFiles=['FULL-COLOUR-CONTACT-SHEET.png','ECONOMY-CONTACT-SHEET.png','EDITABLE-ITEMS-CONTACT-SHEET.png','SMALL-FORMAT-RELATIVE-SCALE.png','MULTI-UP-CONTACT-SHEET.png','MAXIMUM-CONTENT-CONTACT-SHEET.png','CONCEPT-COMPARISON.png'];
await writeFile(reviewPath('REVIEW.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Midnight Séance — Prompt 4 review</title><style>body{max-width:1300px;margin:30px auto;padding:0 20px;background:#F4EBDD;color:#171315;font:17px Georgia,serif;line-height:1.5}a{color:#701F2A}h1{font-size:38px;font-weight:400}table{background:white;border-collapse:collapse;width:100%}td,th{padding:10px;border-bottom:1px solid #A98A5B;text-align:left;font-size:14px}img{max-width:100%}</style></head><body><h1>Midnight Séance — Prompt 4</h1><p>18 stationery masters · ${manifest.jobs.length} PDFs · ${manifest.jobs.reduce((n,j)=>n+j.pages.length,0)} PDF pages, each rendered at 300 dpi. Maximum-content files are review stress fixtures, separate from the sample stationery. Owner visual approval pending.</p><p><a href="${manifest.editor}">Open your offline stationery editor</a> · <a href="page-format-manifest.json">Page/format manifest</a> · <a href="editor-field-manifest.json">Personalisation fields</a> · <a href="reports/automated-qc.json">Automated QC</a> · <a href="reports/VISUAL_QA.md">Visual inspection</a></p><p>Print PDF files at 100%, with matching paper size. Print sheets include cutting guidance; finished-size files omit it. Table tents print on one side and fold at the middle. The economy artwork is independently drawn.</p><ul>${contactFiles.map(file=>`<li><a href="${file}">${file}</a></li>`).join('')}</ul><a href="FULL-COLOUR-CONTACT-SHEET.png"><img src="FULL-COLOUR-CONTACT-SHEET.png" alt="All eighteen stationery masters in Signature Ivory"></a><table><thead><tr><th>Item / edition / format</th><th>PDF</th><th>Actual PDF page previews</th></tr></thead><tbody>${manifest.jobs.map(j=>`<tr><td>${j.name}</td><td><a href="${j.pdf}">PDF</a></td><td>${j.pages.map(p=>`<a href="${p.pngPath}">Page ${p.page}</a>`).join(' · ')}</td></tr>`).join('')}</tbody></table></body></html>`);
console.log('Review sheets and unsent Telegram review package prepared.');
// Include the four customer-edited export checks without inflating the master inventory.
const review=reviewPath('REVIEW.html');
const editedLinks=`<h2>Edited output checks</h2><p>Four additional edited PDFs / four individually inspected 300 dpi pages. Total review evidence: 128 PDFs and 189 PDF pages. These are validation examples of existing masters.</p><ul>${edited.checks.map(j=>`<li>${j.id} · ${j.theme} · ${j.format}: <a href="${j.pdf}">Edited PDF</a> · ${j.pages.map(p=>`<a href="${p.pngPath}">Page ${p.page}</a>`).join(' · ')}</li>`).join('')}</ul><p><a href="reports/editor-export-qc.json">Editor export QC</a> · <a href="reports/editor-browser-qc.json">Chromium / Edge QC</a> · <a href="reports/artwork-usage.json">Artwork usage</a> · <a href="reports/regression-qc.json">Existing regressions</a> · <a href="reports/source-validation.json">Current source evidence</a> · <a href="reports/visual-qc.json">All individual visual records</a> · <a href="telegram-review/delivery-manifest.json">Unsent Telegram package</a></p>`;
await writeFile(review,(await readFile(review,'utf8')).replace('</body>',editedLinks+'</body>'));
