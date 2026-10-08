import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const root=resolve(repo,'storage/products/003/prompt-03-review'),old=resolve(repo,'storage/products/003/prompt-02-revision-01');
const manifest=JSON.parse(await readFile(resolve(root,'proof-manifest.json'),'utf8'));
if(manifest.milestone!==3)throw Error('Expected final Prompt 3 proof manifest');
const label=s=>Buffer.from(`<svg width="580" height="42"><rect width="580" height="42" fill="#F4EBDD"/><text x="12" y="27" font-family="Arial" font-size="16" fill="#171315">${s}</text></svg>`);
async function contact(jobs,file){const parts=[];for(const [i,j] of jobs.entries()){parts.push({input:await sharp(resolve(root,j.pages[0].pngPath)).resize({width:550,height:820,fit:'contain',background:'white'}).png().toBuffer(),left:(i%4)*580+15,top:Math.floor(i/4)*890+45},{input:label(`${j.kind}${j.answer?' answer':''} · ${j.theme} · ${j.size}`),left:(i%4)*580,top:Math.floor(i/4)*890});}await sharp({create:{width:2320,height:Math.ceil(jobs.length/4)*890,channels:3,background:'#342434'}}).composite(parts).png().toFile(resolve(root,file));}
await contact(manifest.jobs,'CONTACT-SHEET.png');
await contact(manifest.jobs.filter(j=>j.theme==='full-colour'),'FULL-COLOUR-CONTACT-SHEET.png');
await contact(manifest.jobs.filter(j=>j.theme==='economy'),'ECONOMY-CONTACT-SHEET.png');
const parts=[];
for(const [i,j] of manifest.jobs.entries())for(const [side,folder] of [old,root].entries()){
 const col=(i%2)*2+side,row=Math.floor(i/2);
 parts.push({input:label(`${j.kind}${j.answer?' answer':''} · ${j.theme} · ${side?'Prompt 3':'Prompt 2'}`),left:col*580,top:row*890},{input:await sharp(resolve(folder,j.pages[0].pngPath)).resize({width:550,height:820,fit:'contain',background:'white'}).png().toBuffer(),left:col*580+15,top:row*890+45});
}
await sharp({create:{width:2320,height:3560,channels:3,background:'#342434'}}).composite(parts).png().toFile(resolve(root,'BEFORE-AFTER.png'));
console.log('Created eight-page review, signature/economy sheets and all-eight-page Prompt 2/3 comparison.');
