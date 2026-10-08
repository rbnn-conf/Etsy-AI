import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../artwork');
const {assets}=JSON.parse(await readFile(resolve(root,'records/measured-assets.json'),'utf8'));
await mkdir(resolve(root,'review'),{recursive:true});
const tiles=[];
for(const a of assets){
 const source=resolve(root,a.file);
 const panels=[];
 for(const [index,background] of ['#F4EBDD','#FFFFFF'].entries()){
  const image=await sharp(source).flatten({background}).resize({width:360,height:360,fit:'contain',background}).png().toBuffer();
  panels.push({input:image,left:index*380+10,top:35});
 }
 const label=Buffer.from(`<svg width="760" height="35"><rect width="760" height="35" fill="white"/><text x="10" y="23" font-family="Arial" font-size="17">${a.id} ${a.name} / ${a.treatment} / GENERATED REVIEW DRAFT</text></svg>`);
 const tile=await sharp({create:{width:760,height:410,channels:3,background:'white'}}).composite([{input:label,left:0,top:0},...panels]).png().toBuffer();
 tiles.push(tile);
 // Native-resolution backdrop checks are separate from the overview sheet.
 for(const [name,background] of [['ivory','#F4EBDD'],['white','#FFFFFF']])await sharp(source).flatten({background}).png().toFile(resolve(root,'review',`${a.id}-${a.treatment}-${name}.png`));
}
await sharp({create:{width:1520,height:Math.ceil(tiles.length/2)*410,channels:3,background:'#342434'}}).composite(tiles.map((input,i)=>({input,left:(i%2)*760,top:Math.floor(i/2)*410}))).png().toFile(resolve(root,'review/GENERATED-DRAFT-CONTACT-SHEET.png'));
await writeFile(resolve(root,'review/README.md'),'# Incomplete Prompt 3 artwork review\n\nGenerated assets only; this is not the final accepted library or a customer proof. Both ivory and white backdrops are provided for every generated candidate. Native-resolution inspection images accompany the overview.\n');
console.log(`Prepared ${assets.length} individual candidates on both backgrounds.`);
