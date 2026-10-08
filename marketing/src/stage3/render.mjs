// Render Stage 3 listing images: compose each planned slide as HTML (design
// system + fonts inlined) and screenshot it with the network-blocked
// Chromium renderer, then make the 300 px Etsy-thumbnail derivatives and a
// contact sheet of them. Deterministic for the same plan, copy, art and scenes.
import { join } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import { composeAsset } from '../compose.mjs';
import { renderAssets } from '../render.mjs';
import { sharp } from '../../../production/src/lib.mjs';
import { CANVAS } from './primitives.mjs';
import { composeSlide } from './adapters/index.mjs';
import { composeEngineSlide } from './engines.mjs';
import { campaignFor } from './campaign.mjs';

export const THUMB=300;
export const accentFor=facts=>campaignFor(facts).tokens.berry;

/**
 * @param plan        { slides:[{id,template,scene?,copy,...}] }
 * @param scenes      { [sceneId]: absolute PNG path }  (AI backgrounds, optional)
 * @param examples    { [exampleId]: absolute PNG path } (AI coloured examples; labelled, never product art)
 * @param engine      'factory' (default: the existing compositions, unchanged) | 'hybrid' | 'ai-creative'
 * @param directions  { [slideId]: normalised art direction } (engine slides)
 * @param only        slide ids to (re)render; the others must already be in outDir.
 *                    Thumbnails are made for these; the contact sheet always shows every slide.
 */
export async function renderSlides({facts,plan,art,scenes={},examples={},outDir,engine='factory',directions={},only=null}){
  const jobs=[], uris={}, exUris={}, layouts=[], todo=plan.slides.filter(s=>!only||only.includes(s.id));
  for(const [id,path] of Object.entries(scenes))uris[id]=`data:image/png;base64,${(await readFile(path)).toString('base64')}`;
  for(const [id,path] of Object.entries(examples))exUris[id]=`data:image/png;base64,${(await readFile(path)).toString('base64')}`;
  for(const slide of todo){
    const sceneUri=slide.scene?uris[slide.scene]??null:null, exampleUri=slide.example?exUris[slide.example]??null:null;
    const {bodyHtml,extraCss,layout}=engine==='factory'?composeSlide(slide,{facts,art,sceneUri,exampleUri})
      :composeEngineSlide(slide,{facts,art,sceneUri,exampleUri,direction:directions[slide.id],engine});
    const {html}=await composeAsset({bodyHtml,extraCss,title:`${facts.product_name} ${slide.id}`});
    jobs.push({html,outPath:join(outDir,`${slide.id}.png`),width:CANVAS,height:CANVAS});layouts.push(layout??null);
  }
  const results=await renderAssets(jobs);
  const thumbs=await makeThumbnails(results.map(r=>r.outPath),join(outDir,'thumbs'),plan.slides.map(s=>join(outDir,`${s.id}.png`)));
  return results.map((r,i)=>({...r,slide:todo[i].id,scene:todo[i].scene??null,expectWidth:CANVAS,expectHeight:CANVAS,
    ...(layouts[i]?{layout:layouts[i]}:{}),thumbPath:thumbs.files[i],contactSheet:thumbs.contactSheet}));
}

/** 300x300 derivatives (what Etsy search shows) + one contact sheet for review (of sheetPaths; default: paths). */
export async function makeThumbnails(paths,dir,sheetPaths=paths){
  await mkdir(dir,{recursive:true});
  const name=p=>p.split(/[\\/]/).at(-1), files=[];
  for(const p of paths){
    const out=join(dir,name(p));
    await sharp(p).resize(THUMB,THUMB,{kernel:'lanczos3'}).png().toFile(out);
    files.push(out);
  }
  // Slides not re-rendered keep their thumbnail (made from their current image).
  const sheet=[];
  for(const p of sheetPaths){
    const out=join(dir,name(p));
    if(!paths.includes(p))await sharp(p).resize(THUMB,THUMB,{kernel:'lanczos3'}).png().toFile(out);
    sheet.push(out);
  }
  const cols=Math.min(5,sheet.length), rows=Math.ceil(sheet.length/cols), g=24;
  const contactSheet=join(dir,'contact-sheet.png');
  await sharp({create:{width:cols*THUMB+(cols+1)*g,height:rows*THUMB+(rows+1)*g,channels:3,background:'#1B1612'}})
    .composite(sheet.map((f,i)=>({input:f,left:g+(i%cols)*(THUMB+g),top:g+Math.floor(i/cols)*(THUMB+g)}))).png().toFile(contactSheet);
  return {files,contactSheet};
}
