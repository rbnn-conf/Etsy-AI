// Real product artwork for Stage 3 images, prepared deterministically from the
// verified Stage 2 package: originals (downscaled for the 2000 px canvas,
// aspect kept) and fresh renders of the customer PDFs. Every item records the
// Stage 2 file and SHA-256 it came from (marketing/work/art-manifest.json).
// Stage 2 files are only read.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { sharp, renderPdf } from '../../../production/src/lib.mjs';
import { Stage3Error } from './errors.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const ART_WIDTH=1400;      // largest artwork shown on a 2000 px canvas
const SHEET_DPI=150;       // printable-sheet renders

export async function fromPng(productDir,file,expectSha,alt,key){
  const src=await readFile(join(productDir,file));
  if(sha(src)!==expectSha)throw new Stage3Error(`Stage 2 artwork changed: ${file}`);
  const meta=await sharp(src).metadata();
  const w=Math.min(ART_WIDTH,meta.width), h=Math.round(meta.height*w/meta.width);
  const bytes=w===meta.width?src:await sharp(src).resize(w,h,{fit:'fill',kernel:'lanczos3'}).png().toBuffer();
  return {key,alt,uri:`data:image/png;base64,${bytes.toString('base64')}`,sha256:sha(bytes),width:w,height:h,
    source:{file,sha256:expectSha,width:meta.width,height:meta.height}};
}
export async function fromPdf(productDir,workDir,file,expectSha,page,alt,key,dpi=SHEET_DPI){
  const src=await readFile(join(productDir,file));
  if(sha(src)!==expectSha)throw new Stage3Error(`Stage 2 PDF changed: ${file}`);
  const prefix=join(workDir,key);
  const pages=await renderPdf(join(productDir,file),{dpi,outPrefix:prefix});
  const bytes=await readFile(pages[page-1].pngPath), meta=await sharp(bytes).metadata();
  return {key,alt,uri:`data:image/png;base64,${bytes.toString('base64')}`,sha256:sha(bytes),width:meta.width,height:meta.height,
    source:{file,sha256:expectSha,page}};
}

/** Greeting cards. Returns {fronts:{[designId]:a}, insides:[a], sheets:{[label]:a}, letter:a|null, panels:{[designId]:a}, guide:a|null, manifest}. */
export async function prepareCardArt(facts,productDir,workDir){
  await mkdir(workDir,{recursive:true});
  const fronts={}, insides=[], sheets={};
  for(const d of facts.designs)fronts[d.id]=await fromPng(productDir,d.front.file,d.front.sha256,`${d.name} card front`,`front-${d.id}`);
  for(const [i,ins] of facts.insides.entries())insides.push(await fromPng(productDir,ins.file,ins.sha256,'Card inside',`inside-${i+1}`));
  const pdf=(d,variant)=>d.files.find(f=>f.variant===variant);
  for(const d of facts.designs){const f=pdf(d,'A4');if(f)sheets[`${d.id} outside`]=await fromPdf(productDir,workDir,f.file,f.sha256,1,`${d.name} A4 printable sheet`,`sheet-${d.id}-A4`);}
  const a4=pdf(facts.designs[0],'A4');
  if(a4&&facts.insides.length)sheets.inside=await fromPdf(productDir,workDir,a4.file,a4.sha256,2,'Inside printable sheet','sheet-inside-A4');
  const lf=pdf(facts.designs[0],'US-Letter');
  const letter=lf?await fromPdf(productDir,workDir,lf.file,lf.sha256,1,'US Letter printable sheet',`sheet-${facts.designs[0].id}-US-Letter`):null;
  // 4x6 in panel pages (page 1 = the front panel) and the printing guide, as the customer receives them.
  const panels={};
  for(const d of facts.designs){const f=pdf(d,'Card-Panels-4x6in');if(f)panels[d.id]=await fromPdf(productDir,workDir,f.file,f.sha256,1,`${d.name} 4x6 in card panel`,`panel-${d.id}-4x6`);}
  const guide=facts.guide?await fromPdf(productDir,workDir,facts.guide.file,facts.guide.sha256,1,'Printing guide','guide',100):null;
  const all=[...Object.values(fronts),...insides,...Object.values(sheets),...(letter?[letter]:[]),...Object.values(panels),...(guide?[guide]:[])];
  const manifest=all.map(({uri,...rest})=>rest);
  await writeFile(join(workDir,'art-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return {fronts,insides,sheets,letter,panels,guide,manifest};
}
