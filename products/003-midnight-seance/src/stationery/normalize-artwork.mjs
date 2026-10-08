import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import sharp from 'sharp';
import {PRODUCT_ROOT,REPO_ROOT} from '../paths.mjs';
import {loadResources,sha256} from '../resources.mjs';

// Production preparation only. Original Prompt 3 sources and accepted assets are immutable.
const resources=await loadResources();
const previous=JSON.parse(await readFile(join(REPO_ROOT,'storage/products/003/prompt-04-review/page-format-manifest.json'),'utf8'));
const placements=previous.jobs.flatMap(j=>j.probe.artwork);
const directory=join(PRODUCT_ROOT,'artwork/prompt-04-polish');await mkdir(directory,{recursive:true});
const manifest={milestone:4,purpose:'Non-destructive placed-print production variants',originalsPreserved:true,assets:[]};
for(const asset of resources.artworkManifest.assets){
  const source=await readFile(join(PRODUCT_ROOT,'artwork',asset.file));
  if(sha256(source)!==asset.sha256)throw Error('Original artwork changed');
  const uses=placements.filter(p=>p.id===asset.id&&p.treatment===asset.treatment);
  if(!uses.length)continue;
  const family=asset.id[0];
  const saturation=asset.id==='B01'?.48:asset.id==='B02'?.52:family==='A'?.72:family==='C'?.62:family==='D'?.68:.78;
  const contrast=asset.id==='B01'?1.03:asset.id==='B02'?1.025:family==='D'?1.045:family==='A'?1.015:1;
  const maxWidth=Math.max(...uses.map(p=>p.widthMm));
  // 900 ppi at the previous largest footprint allows the enlarged raven and corner placements.
  const width=Math.min(asset.pixels[0],Math.ceil(maxWidth*900/25.4));
  let pipeline=sharp(source).resize({width,withoutEnlargement:true});
  if(asset.treatment==='signature')pipeline=pipeline.modulate({saturation,brightness:family==='C'?.95:1}).linear(contrast,-255*(contrast-1)*.42);
  else pipeline=pipeline.linear(asset.id==='B02'?1.055:family==='D'?1.035:1,-(asset.id==='B02'?7:family==='D'?4:0));
  const rgba=await pipeline.ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width:w,height:h,channels}=rgba.info;
  // Preserve the canvas; remove only resampling leakage on the outermost clear pixel ring.
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x===0||y===0||x===w-1||y===h-1)rgba.data.fill(0,(y*w+x)*channels,(y*w+x+1)*channels);
  const bytes=await sharp(rgba.data,{raw:rgba.info}).png({compressionLevel:9}).toBuffer();
  const file=`prompt-04-polish/${asset.id}-${asset.treatment}.png`;
  await writeFile(join(PRODUCT_ROOT,'artwork',file),bytes);
  const alpha=await sharp(bytes).extractChannel('alpha').raw().toBuffer();
  if(!alpha.some(a=>a===0)||!alpha.some(a=>a>0))throw Error('Empty or opaque variant');
  for(let y=0;y<h;y++)if(alpha[y*w]||alpha[y*w+w-1])throw Error('Opaque perimeter');
  if(alpha.subarray(0,w).some(Boolean)||alpha.subarray(alpha.length-w).some(Boolean))throw Error('Opaque perimeter');
  manifest.assets.push({id:asset.id,treatment:asset.treatment,sourceFile:asset.file,sourceSha256:asset.sha256,file,sha256:sha256(bytes),pixels:[w,h],bytes:bytes.length,transparentPerimeter:true,saturation:asset.treatment==='signature'?saturation:null,contrast:asset.treatment==='signature'?contrast:asset.id==='B02'?1.055:family==='D'?1.035:1,sharpen:false,blur:false,canvasPreserved:true,status:'TECHNICAL_PASS_VISUAL_PENDING'});
  console.log(`Prepared ${asset.id}/${asset.treatment}: ${w} × ${h}`);
}
await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(`Prepared ${manifest.assets.length} used variants; original SHA-256 checks passed.`);
