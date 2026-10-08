// Stage 3 marketing ENGINES: HOW the campaign is visually produced. The
// product adapter (greeting-card.mjs planSlides) still decides WHAT the
// campaign says and shows; an engine only changes the visual production.
//
//   factory      the existing deterministic LumiumX compositions (unchanged).
//   hybrid       AI art direction + an AI environment per image, built around
//                a product placement region; the REAL Stage 2 artwork is
//                composited into that region by code.
//   ai-creative  the same safeguards, with wider AI control over layout
//                (archetype, scale, rotation, perspective, light, décor).
//                The model never renders the product or any text: its
//                composition is an art-direction REFERENCE that code
//                reconstructs deterministically.
//
// Everything here is deterministic (no model call): the contract a model's art
// direction must satisfy (validated and clamped, never trusted), the layout
// geometry, the compositor, and the product-truth checks on AI environments.
// Format-specific inputs (which templates are art-directed, which real artwork
// each shows, the hero benefits) come from the Stage 3 adapter (adapters/).
import { campaignFor } from './campaign.mjs';
import { composeSlide, adapterOf, STAGE3_ADAPTERS } from './adapters/index.mjs';
import { CANVAS, css, placeArt, artHeight, backdrop, scrim, headline, textBlock, copyHtml, fact, benefitList, bokeh, sprig, footer } from './primitives.mjs';
import { sharp } from '../../../production/src/lib.mjs';
import { composeCreative, creativeVariety, creativeTruth } from './creative.mjs';
import { colouringCreativeQc } from './colouring-creative.mjs';

export const ENGINE_VERSION=1;
export const ENGINES=Object.freeze({
  'factory':{id:'factory',label:'🧱 Factory',title:'Factory',summary:'Existing deterministic LumiumX templates',recommended:false,ai_direction:false},
  'hybrid':{id:'hybrid',label:'🎨 Hybrid',title:'Hybrid',summary:'AI art direction + verified real product artwork',recommended:true,ai_direction:true,
    archetypes:['editorial-right','editorial-left','centre-stage'],scale:[0.45,0.55],rotation:3,perspective:3,decor:['none','bokeh']},
  'ai-creative':{id:'ai-creative',label:'✨ AI Creative',title:'AI Creative',summary:'Premium AI-directed advertising compositions',recommended:false,ai_direction:true,
    archetypes:['editorial-right','editorial-left','centre-stage','diagonal','overhead','close-up'],scale:[0.45,0.7],rotation:8,perspective:8,decor:['none','bokeh','sprigs']}});
export const engineOf=id=>{const e=ENGINES[id];if(!e)throw new Error(`Unknown marketing engine "${id}" (available: ${Object.keys(ENGINES).join(', ')})`);return e;};

// Slides whose product is ONE real artwork placed in an art-directed region
// (each gets its own AI environment), as declared by each adapter (template
// names are unique per format). Other templates (greeting cards: inside open
// card, contents grid, sizes, digital, several designs; colouring books:
// collage, coloured examples, included, printable, features, bundle) keep the
// Factory layouts: they show several real files and are information.
export const REGION_TEMPLATES=Object.freeze([...new Set(Object.values(STAGE3_ADAPTERS).flatMap(a=>a.engines.regionTemplates))]);
export const usesEnvironment=slide=>REGION_TEMPLATES.includes(slide.template);
// Product-visibility floors for engine slides. Never below the Factory's own
// min_product_share (max() below); higher because an engine designs the whole
// frame around the product, so the product must read clearly larger.
const ENGINE_MIN_SHARE=Object.assign({},...Object.values(STAGE3_ADAPTERS).map(a=>a.engines.minShare));
export const engineMinShare=(slide,engine)=>engine==='factory'?slide.min_product_share:Math.max(slide.min_product_share??0,ENGINE_MIN_SHARE[slide.template]??0);

// ---------- art direction contract ----------
const TEXT_ZONE={'editorial-right':'left','editorial-left':'right','centre-stage':'top','diagonal':'left','overhead':'top','close-up':'left'};
const LIGHT=['warm window light from the left','warm window light from the right','soft candlelight','golden evening light','bright soft daylight','cool winter daylight'];
const DEFAULT_ARCH={hero:'editorial-right',design:'editorial-left',gift:'editorial-right',print:'editorial-right',inside:'editorial-left',interior:'editorial-left',lifestyle:'editorial-right'};
/** The art direction used when none was generated (tests, and the engine's safe baseline). */
export function defaultDirection(slide,engine){
  const e=engineOf(engine);
  return {id:slide.id,archetype:e.archetypes?.includes(DEFAULT_ARCH[slide.template])?DEFAULT_ARCH[slide.template]:'editorial-right',product_scale:e.scale?.[0]??0.45,
    rotation:0,perspective:0,lighting:LIGHT[0],decor:'none',scene_brief:'',source:'default'};
}
/**
 * Validate and CLAMP a model's art direction to the engine's bounds. Unknown
 * archetypes fall back to the template default; numbers are clamped; text
 * from the model is kept only as an environment brief (never rendered).
 */
export function normaliseDirection(raw,slide,engine){
  const e=engineOf(engine), base=defaultDirection(slide,engine);
  if(!e.ai_direction)return {...base,source:'factory'};
  const num=(v,lo,hi,d)=>Number.isFinite(v)?Math.min(hi,Math.max(lo,v)):d;
  return {id:slide.id,
    archetype:e.archetypes.includes(raw?.archetype)?raw.archetype:base.archetype,
    product_scale:num(raw?.product_scale,e.scale[0],e.scale[1],base.product_scale),
    rotation:num(raw?.rotation,-e.rotation,e.rotation,0),
    perspective:num(raw?.perspective,-e.perspective,e.perspective,0),
    lighting:LIGHT.includes(raw?.lighting)?raw.lighting:base.lighting,
    decor:e.decor.includes(raw?.decor)?raw.decor:'none',
    scene_brief:String(raw?.scene_brief??'').replace(/\s+/g,' ').trim().slice(0,400),
    source:raw?'model':'default'};
}
export const ENGINE_LIGHTING=LIGHT;

// ---------- geometry ----------
/**
 * Product region and text zone from the direction and the REAL artwork's
 * aspect ratio. The region is exactly the artwork's box (placed whole, never
 * cropped or stretched) and is sized to at least the slide's floor; if an
 * archetype cannot reach it for this aspect ratio, the editorial layout that
 * can is used instead (generic, never product-specific).
 */
export function layoutFor(direction,{aspect,minShare=0.45}){
  const L=layoutAt(direction,{aspect,minShare},direction.rotation??0);
  // Visibility beats décor: if a tilt keeps the product under the floor, it is placed straight.
  if(L.share+1e-9<minShare&&(direction.rotation??0)!==0){const S=layoutAt(direction,{aspect,minShare},0);if(S.share>L.share)return {...S,rotation_dropped:true};}
  return L;
}
function layoutAt(direction,{aspect,minShare},rotation){
  const want=Math.max(direction.product_scale,minShare+0.02), area=want*CANVAS*CANVAS;
  const th=Math.abs(rotation)*Math.PI/180, c=Math.cos(th), s=Math.sin(th);
  // The rotated artwork's bounding box must stay on the canvas and clear of the text column.
  const bbox=(w,h)=>({w:w*c+h*s,h:h*c+w*s});
  const fit=arch=>{
    const side=['editorial-right','editorial-left','diagonal','close-up'].includes(arch);
    // Centred layouts: a compact text band on top (to y≈470), the region below it, clear of the footer (≤1850).
    const maxW=side?(arch==='close-up'?1320:1220):1800, maxH=side?1760:1360;
    let h=Math.sqrt(area/aspect), w=h*aspect;
    const shrink=()=>{const b=bbox(w,h), k=Math.min(1,maxW/b.w,maxH/b.h);w*=k;h*=k;};
    shrink();
    const B=bbox(w,h), dx=(B.w-w)/2, dy=(B.h-h)/2;
    const x=arch==='editorial-left'?90+dx:side?CANVAS-90-w-dx:(CANVAS-w)/2;
    const y=side?(CANVAS-h)/2:490+dy+Math.max(0,(maxH-B.h)/2);
    return {arch,region:{x,y,w,h},bounds:{x:x-dx,y:y-dy,w:B.w,h:B.h},share:w*h/(CANVAS*CANVAS),zone:TEXT_ZONE[arch]};
  };
  let L=fit(direction.archetype);
  if(L.share+1e-9<minShare){const alt=['editorial-right','editorial-left','centre-stage'].map(fit).sort((a,b)=>b.share-a.share)[0];if(alt.share>L.share+1e-9)L={...alt,fallback_from:direction.archetype};}
  const b=L.bounds;
  const text=L.zone==='left'?{x:100,y:0,w:b.x-160,align:'left'}:L.zone==='right'?{x:b.x+b.w+70,y:0,w:CANVAS-(b.x+b.w+70)-100,align:'left'}:{x:100,y:0,w:1800,align:'center'};
  return {...L,text,rotation};
}

// ---------- compositor ----------
/** The real artwork(s) an engine slide shows (from the adapter); the first leads (sets the region aspect). */
export const slideArtwork=(slide,facts,A)=>adapterOf(facts).engines.slideArtwork(slide,facts,A);
const fitHeadline=(text,w)=>{const words=String(text??'').split(/\s+/).filter(Boolean);return Math.max(88,Math.min(132,Math.floor(w/(0.72*Math.max(...words.map(s=>s.length),1)))));};
const linesOf=(text,size,w)=>String(text??'').split('\n').reduce((n,l)=>n+l.trim().split(/\s+/).reduce((a,wd)=>{const t=a.cur?`${a.cur} ${wd}`:wd;return a.cur&&t.length*0.72*size>w?{n:a.n+1,cur:wd}:{...a,cur:t};},{n:1,cur:''}).n,0);

/**
 * One engine slide. Region templates: AI environment full-bleed, a scrim only
 * behind the text, the real artwork placed whole in the region with a small
 * perspective and a grounded shadow, then code-rendered copy. Other templates:
 * the Factory composition over the campaign's hero environment.
 * @returns {bodyHtml, extraCss, layout}
 */
export function composeEngineSlide(slide,{facts,art:A,sceneUri,exampleUri=null,direction,engine}){
  const T=campaignFor(facts).tokens, E=adapterOf(facts).engines;
  // Creative cards (ADR-058): the card's validated direction drives the composition.
  if(slide.template==='creative')return composeCreative(slide,{facts,catalogue:adapterOf(facts).creative.catalogue(facts,A),direction:direction?.composition?direction:slide.creative,sceneUri,exampleUri,tokens:T});
  if(engine==='factory'||!usesEnvironment(slide)){const r=composeSlide(slide,{facts,art:A,sceneUri,exampleUri});return {...r,layout:null};}
  const d=direction??defaultDirection(slide,engine), items=slideArtwork(slide,facts,A).filter(Boolean), lead=items[0];
  const L=layoutFor(d,{aspect:lead.width/lead.height,minShare:engineMinShare(slide,engine)});
  const copy=slide.copy??{}, r=L.region;
  let b=backdrop(sceneUri,'table',T);
  b+=L.zone==='top'?scrim('top',.82):L.zone==='left'?scrim('left',.84):`<div class="lx-scrim" style="height:2000px;background:linear-gradient(270deg,rgba(16,10,6,.84) 0%,rgba(16,10,6,.59) 30%,rgba(16,10,6,0) 58%)"></div>`;
  const decor=(E.decor??[d.decor]).includes(d.decor)?d.decor:'none';   // a format may rule out décor (colouring books: no holly sprigs)
  if(decor==='bokeh')b+=bokeh('#F2C27C',{alpha:.22,only:L.zone==='left'?[0,1,7]:[5,6,10]});
  // Décor stays inside the canvas, in the corner away from the copy, behind the product.
  if(decor==='sprigs')b+=sprig(T,{x:L.zone==='right'?0:CANVAS-560,y:CANVAS-400,w:560,h:360,angle:L.zone==='right'?14:-14,flip:L.zone!=='right',z:5});
  // Copy: kicker/title, headline sized to its column, subline, benefits (deterministic, claim-tagged).
  // Top band (centred layouts) is compact: kicker at 100, headline ≤116 px, one subline, all above the region at 490.
  const band=L.zone==='top', tw=L.text.w, size=band?Math.min(116,fitHeadline(copy.headline?.text,tw)):fitHeadline(copy.headline?.text,tw);
  // A long kicker (e.g. a long product name in a narrow column) wraps: the headline moves down by its extra lines
  // (~27.6 px per 30 px spaced capital, 40 px per line); one line keeps the original 80 px gap.
  const kLines=band?1:Math.max(1,Math.ceil(String(copy.kicker?.text??facts.product_name).length*27.6/tw));
  const gap=band?50:80+(kLines-1)*40;
  const top=band?100:Math.max(150,(CANVAS-(60+gap+linesOf(copy.headline?.text,size,tw)*size+(copy.subline?200:0)+(slide.template==='hero'?240:0)))/2);
  const kicker=copy.kicker?copyHtml(copy.kicker):fact('product-title',facts.product_name);
  b+=textBlock(kicker,{x:L.text.x,y:top,w:tw,cls:'lx-micro',color:T.gold,align:L.text.align});
  b+=headline(copy.headline,{x:L.text.x,y:top+gap,w:tw,size,color:T.cream,align:L.text.align,cls:slide.template==='design'||slide.name_headline?'lx-name':''});
  let y=top+gap+linesOf(copy.headline?.text,size,tw)*size+(band?24:50);
  if(copy.subline){b+=textBlock(copyHtml(copy.subline),{x:L.text.x,y,w:tw,cls:band?'lx-sub':'lx-lede',color:T.goldLight,align:L.text.align});y+=band?70:190;}
  if(slide.template==='hero'&&L.zone!=='top')b+=benefitList(E.heroBenefits(facts),{x:L.text.x,y:y+20,w:tw,T});
  // The real artwork: whole, own aspect ratio, in the region; a second design (hero) sits behind, offset.
  if(items[1])b+=placeArt(items[1],{x:r.x+(L.zone==='right'?-r.w*0.16:r.w*0.16),y:r.y+r.h*0.05,w:r.w*0.86,rz:L.rotation+(L.zone==='right'?-5:5),ry:0,shadow:'lift',z:11});
  b+=placeArt(lead,{x:r.x,y:r.y,w:r.w,rz:L.rotation,rx:d.perspective,shadow:'lift',z:12});
  return {bodyHtml:`<div id="canvas" class="dark">${b}${footer(facts.product_name)}</div>`,extraCss:css(T),
    layout:{archetype:L.arch,fallback_from:L.fallback_from??null,region:Object.fromEntries(Object.entries(r).map(([k,v])=>[k,Math.round(v)])),text_zone:L.zone,rotation:L.rotation,rotation_dropped:!!L.rotation_dropped,min_share:engineMinShare(slide,engine)}};
}

/** The real approved artwork the art director sees (downscaled PNG, for colour and mood only; never reproduced). */
export async function representativeArtwork(facts,A,{width=512}={}){
  const a=adapterOf(facts).engines.representative(facts,A), bytes=Buffer.from(a.uri.split(',')[1],'base64');
  return {mime:'image/png',bytes:await sharp(bytes).resize({width,withoutEnlargement:true}).png().toBuffer(),width:a.width,height:a.height,sha256:a.sha256};
}

// ---------- product truth on AI environments ----------
/**
 * Deterministic check for a product SUBSTITUTE in an AI environment: large,
 * flat, bright, rectangular shapes (a card, sheet or book the model drew)
 * outside the region where the real artwork goes (inside it, the real artwork
 * covers whatever is there). Returns suspect boxes in canvas pixels.
 */
export async function productLikeShapes(envBytes,region=null,{grid=100}={}){
  const {data}=await sharp(envBytes).resize(grid,grid,{fit:'fill'}).greyscale().raw().toBuffer({resolveWithObject:true});
  const s=CANVAS/grid, inRegion=(x,y)=>region&&x*s>=region.x-s&&x*s<=region.x+region.w+s&&y*s>=region.y-s&&y*s<=region.y+region.h+s;
  const flat=(x,y)=>{const v=data[y*grid+x];if(v<205)return false;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<grid&&ny<grid&&Math.abs(data[ny*grid+nx]-v)>18)return false;}return true;};
  const seen=new Uint8Array(grid*grid), found=[];
  for(let y=0;y<grid;y++)for(let x=0;x<grid;x++){
    if(seen[y*grid+x]||!flat(x,y)||inRegion(x,y))continue;
    const stack=[[x,y]];seen[y*grid+x]=1;let n=0,x0=x,x1=x,y0=y,y1=y;
    while(stack.length){const [cx,cy]=stack.pop();n++;x0=Math.min(x0,cx);x1=Math.max(x1,cx);y0=Math.min(y0,cy);y1=Math.max(y1,cy);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=cx+dx,ny=cy+dy,k=ny*grid+nx;if(nx>=0&&ny>=0&&nx<grid&&ny<grid&&!seen[k]&&flat(nx,ny)&&!inRegion(nx,ny)){seen[k]=1;stack.push([nx,ny]);}}}
    const bw=x1-x0+1, bh=y1-y0+1;
    if(n>=grid*grid*0.03&&n/(bw*bh)>=0.72&&Math.min(bw,bh)>=grid*0.08)found.push({x:x0*s,y:y0*s,w:bw*s,h:bh*s,fill:+(n/(bw*bh)).toFixed(2)});
  }
  return found;
}

/**
 * Engine QC (added to the standard Stage 3 QC, never replacing it):
 *  - engine recorded with the run;
 *  - every engine slide's product region is covered by the REAL artwork;
 *  - product visibility floor per engine slide (engineMinShare);
 * Non-blocking warnings: product-like shapes in an AI environment (the owner
 * can regenerate that scene). Layout fallbacks are recorded in the layout only.
 */
export function engineQc({plan,renderResults,productShare,shapes={},facts=null}){
  const checks=[], warnings=[], add=(name,ok,detail='')=>checks.push({name,ok:!!ok,detail:String(detail)});
  const engine=plan.engine?.id;
  add('marketing engine recorded with the run',!!ENGINES[engine]&&plan.engine.version===ENGINE_VERSION,`${engine} v${plan.engine?.version}`);
  const uncovered=[], small=[];
  for(const [i,r] of renderResults.entries()){
    const s=plan.slides[i], lay=r.layout;
    if(!lay||lay.creative)continue;   // creative cards: their own checks below
    const g=lay.region, cover=(r.artwork??[]).some(a=>a.rect&&a.rect.x<=g.x+g.w*0.08&&a.rect.y<=g.y+g.h*0.08&&a.rect.x+a.rect.w>=g.x+g.w*0.92&&a.rect.y+a.rect.h>=g.y+g.h*0.92);
    if(!cover)uncovered.push(r.slide);
    const got=productShare(r.artwork,r.width);
    if(got+1e-9<lay.min_share)small.push(`${r.slide} ${(got*100).toFixed(0)}% < ${(lay.min_share*100).toFixed(0)}%`);
    if(s&&shapes[s.id]?.length)warnings.push(`${r.slide}: the AI environment contains ${shapes[s.id].length} flat paper-like shape(s) outside the product region; check it is not a fake product (✨ Regenerate Scene replaces it).`);
  }
  add('product region covered by real Stage 2 artwork',!uncovered.length,uncovered.join(', ')||'every art-directed region holds the real artwork');
  add('engine product visibility floor',!small.length,small.join(', ')||'hero/design ≥ 45%, gift ≥ 35%, inside/print ≥ 30%');
  // ADR-058: creative campaigns are checked for variety and for render truth (crops, resolution, pattern IDs).
  if(plan.slides.some(s=>s.template==='creative')){
    const shares=Object.fromEntries(renderResults.filter(r=>r.layout?.creative).map(r=>[r.slide,productShare(r.artwork,r.width)]));
    const v=creativeVariety(plan.directions??{},{shares});
    checks.push(...v.checks,...(facts?creativeTruth(renderResults,facts):[]));warnings.push(...v.warnings);
    // Colouring books (ADR-060): the hero is not mostly copy, each card shows its focal asset, shared backplates differ.
    if(plan.creative?.composer){const c=colouringCreativeQc({plan,renderResults,shapes});checks.push(...c.checks);warnings.push(...c.warnings);}
  }
  return {checks,warnings};
}
