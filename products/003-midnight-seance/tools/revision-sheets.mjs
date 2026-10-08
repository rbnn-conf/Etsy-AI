import sharp from 'sharp';
import { readFile,writeFile } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const root=resolve(repo,'storage/products/003/prompt-02-revision-01'),old=resolve(repo,'storage/products/003/prompt-02-review');
const manifest=JSON.parse(await readFile(resolve(root,'proof-manifest.json'),'utf8'));
const contact=[];
for(const [i,job] of manifest.jobs.entries()){
  const input=await sharp(resolve(root,job.pages[0].pngPath)).resize({width:480,height:720,fit:'contain',background:'white'}).png().toBuffer();
  contact.push({input,left:(i%4)*520+20,top:Math.floor(i/4)*820+50});
  const label=Buffer.from(`<svg width="510" height="42"><text x="12" y="22" font-family="Arial" font-size="15" fill="#171315">${job.kind}${job.answer?' answer':''} · ${job.theme} · ${job.size}</text></svg>`);
  contact.push({input:label,left:(i%4)*520,top:Math.floor(i/4)*820+780});
}
await sharp({create:{width:2080,height:1640,channels:3,background:'#F4EBDD'}}).composite(contact).png().toFile(resolve(root,'CONTACT-SHEET.png'));
const types=[['Invitation','invitation-full-colour-5x7-default'],['Welcome sign','welcome-full-colour-8x10-default'],['Word search','word-search-full-colour-a4-default']];
const textSvg=(title,width=600,height=42)=>Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#F4EBDD"/><text x="12" y="28" font-family="Arial" font-size="19" fill="#171315">${title}</text></svg>`);
const comparison=[];
for(const [i,[title,name]] of types.entries())for(const [j,folder] of [old,root].entries()){
  const img=await sharp(resolve(folder,`preview/${name}-01.png`)).resize({width:440,height:660,fit:'contain',background:'white'}).png().toBuffer();
  comparison.push({input:img,left:i*920+j*460+10,top:65},{input:textSvg(`${title} — ${j?'revision candidate':'superseded draft'}`,450),left:i*920+j*460,top:8});
}
await sharp({create:{width:2760,height:735,channels:3,background:'#342434'}}).composite(comparison).png().toFile(resolve(root,'BEFORE-AFTER.png'));
const map=[];
for(const [i,[title,name]] of types.entries()){
  const job=manifest.jobs.find(j=>j.name===name),[w,h]=[job.pages[0].widthMm,job.pages[0].heightMm];
  const scale=Math.min(540/w,710/h),iw=w*scale,ih=h*scale;
  const image=await sharp(resolve(root,job.pages[0].pngPath)).resize(Math.round(iw),Math.round(ih)).png().toBuffer();
  map.push({input:image,left:i*620+Math.round((620-iw)/2),top:60},{input:textSvg(`${title} — development attachment zones`,620),left:i*620,top:8});
  const slots=job.probe.artworkSlots.filter(s=>s.master===(job.kind==='word-search'?'G03':job.kind==='welcome'?'S03':'S01'));
  const overlay=Buffer.from(`<svg width="${Math.ceil(iw)}" height="${Math.ceil(ih)}">${slots.map((s,k)=>{const[sx,sy,bw,bh]=s.boxMm;const x=sx+(job.kind==='word-search'?10:0),y=sy+(job.kind==='word-search'?10:0);return `<rect x="${x*scale}" y="${y*scale}" width="${bw*scale}" height="${bh*scale}" fill="#701F2A" fill-opacity=".08" stroke="#701F2A" stroke-width="2" stroke-dasharray="6 3"/><circle cx="${x*scale+8}" cy="${y*scale+8}" r="9" fill="#171315"/><text x="${x*scale+5}" y="${y*scale+12}" font-family="Arial" font-size="11" fill="white">${k+1}</text>`;}).join('')}</svg>`);
  map.push({input:overlay,left:i*620+Math.round((620-iw)/2),top:60});
  for(const [k,s] of slots.entries())map.push({input:textSvg(`${k+1}. ${s.id}`,620,32),left:i*620,top:790+k*34});
}
await sharp({create:{width:1860,height:1060,channels:3,background:'#F4EBDD'}}).composite(map).png().toFile(resolve(root,'ARTWORK-PLACEMENT-MAP.png'));
await writeFile(resolve(root,'reports/artwork-placement.json'),JSON.stringify({buildId:manifest.buildId,status:'development-only',pages:types.map(([,name])=>({name,slots:manifest.jobs.find(j=>j.name===name).probe.artworkSlots}))},null,2));
let review=await readFile(resolve(root,'REVIEW.html'),'utf8');
review=review.replace('Prompt 2 · three visual proof types','Prompt 2 visual revision 01 · approval pending · three visual proof types');
if(!review.includes('href="ARTWORK-PLACEMENT-MAP.png"'))review=review.replace('<p><a href="editable/','<p><a href="ARTWORK-PLACEMENT-MAP.png">Annotated artwork-placement map</a> · <a href="BEFORE-AFTER.png">Before-and-after comparison</a></p><p><a href="editable/');
await writeFile(resolve(root,'REVIEW.html'),review);
console.log('Created before/after and annotated placement sheets from actual PDF previews.');
