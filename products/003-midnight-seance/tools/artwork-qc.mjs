import sharp from 'sharp';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../artwork');
const catalogue=JSON.parse(await readFile(resolve(root,'records/catalogue.json'),'utf8'));
let previousAssets=[];
try{previousAssets=JSON.parse(await readFile(resolve(root,'records/measured-assets.json'),'utf8')).assets;}catch{}
const records=[];const hash=b=>createHash('sha256').update(b).digest('hex');
for(const a of catalogue)for(const treatment of ['signature','economy']){
 const file=`${a.id}-${a.name}.png`,path=resolve(root,'source',treatment,file);let source;
 try{source=await readFile(path);}catch{if(process.argv.includes('--partial'))continue;throw Error(`Missing ${file} ${treatment}`);}
 const meta=await sharp(source).metadata();
 const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let xmin=info.width,ymin=info.height,xmax=-1,ymax=-1,transparent=0,edgeOpaque=0,occupied=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const alpha=data[(y*info.width+x)*4+3];if(alpha===0)transparent++;if(alpha>16){occupied++;xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);if(x===0||y===0||x===info.width-1||y===info.height-1)edgeOpaque++;}}
 if(!meta.hasAlpha||transparent/info.width/info.height<.08||xmax<0)throw Error(`Invalid transparency ${file} ${treatment}`);
 if(edgeOpaque>0)throw Error(`Clipped/dirty source boundary ${file} ${treatment}: ${edgeOpaque}`);
 const width=xmax-xmin+1,height=ymax-ymin+1,padding=20;
 const production=await sharp(source).extract({left:xmin,top:ymin,width,height}).extend({top:padding,bottom:padding,left:padding,right:padding,background:{r:0,g:0,b:0,alpha:0}}).withMetadata({density:600}).png().toBuffer();
 await mkdir(resolve(root,'production',treatment),{recursive:true});await writeFile(resolve(root,'production',treatment,file),production);
 // CSS object-fit:contain scales until the first box edge is reached.
 // PPI must describe the painted image, rather than a stretched bounding box.
 const maximumScale=Math.max((width+40)/a.maxWidthMm,(height+40)/a.maxHeightMm);
 const previous=previousAssets.find(v=>v.id===a.id&&v.treatment===treatment&&v.sourceSha256===hash(source)&&v.sha256===hash(production));
 records.push({...a,...previous,treatment,file:`production/${treatment}/${file}`,source:`source/${treatment}/${file}`,sourceSha256:hash(source),sha256:hash(production),sourcePixels:[info.width,info.height],pixels:[width+40,height+40],alphaBounds:[20,20,width,height],transparentFraction:transparent/info.width/info.height,edgeOpaque,effectivePpiAtMaxBox:maximumScale*25.4,minimumPpi:300,visualQc:previous?.visualQc??'pending',provenance:'Original built-in image_gen generation; economy independently regenerated as sparse engraving; technical crop/padding only; no upscaling'});
}
await writeFile(resolve(root,'records/measured-assets.json'),JSON.stringify({assets:records},null,2));
console.log(JSON.stringify({measured:records.length,below300ppi:records.filter(a=>a.effectivePpiAtMaxBox<300).map(a=>a.id+'-'+a.treatment)}));
