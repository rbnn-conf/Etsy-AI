import {mkdir,readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {reviewPath} from './resources.mjs';
import {escapeText} from '../components/index.mjs';
import {sha256} from '../resources.mjs';
let previous=[];
try{previous=JSON.parse(await readFile(reviewPath('inspection/index.json'),'utf8')).batches;}
catch(error){if(error.code!=='ENOENT')throw error;}
const manifest=JSON.parse(await readFile(reviewPath('page-format-manifest.json'),'utf8'));
const pages=manifest.jobs.flatMap(j=>j.pages.map(p=>({name:j.name,page:p.page,path:p.pngPath,sha256:p.pngSha256})));
await mkdir(reviewPath('inspection'),{recursive:true});
const batches=[];
for(let i=0;i<pages.length;i+=2){
  const pair=pages.slice(i,i+2),composites=[];
  for(const [column,p] of pair.entries()){
    composites.push({input:await sharp(reviewPath(p.path)).resize({width:900,height:1275,fit:'contain',background:'white'}).png().toBuffer(),left:column*930+15,top:40});
    composites.push({input:Buffer.from(`<svg width="910" height="40"><text x="10" y="25" font-family="Arial" font-size="18">${escapeText(p.name)} · page ${p.page}</text></svg>`),left:column*930+10,top:0});
  }
  const file=`inspection/batch-${String(batches.length+1).padStart(3,'0')}.png`;
  await sharp({create:{width:1860,height:1330,channels:3,background:'white'}}).composite(composites).png().toFile(reviewPath(file));
  const prior=previous.find(b=>b.file===file&&b.status==='VISUALLY_INSPECTED_PASS'&&JSON.stringify(b.pages)===JSON.stringify(pair));
  const sameView=prior&&prior.inspectionViewSha256===sha256(await readFile(reviewPath(file)));
  batches.push(sameView?prior:{file,pages:pair,status:'NOT_YET_VISUALLY_INSPECTED'});
}
await writeFile(reviewPath('inspection','index.json'),JSON.stringify({milestone:4,pageCount:pages.length,batches},null,2));
console.log(`${pages.length} pages in ${batches.length} individually labelled two-page inspection views`);
