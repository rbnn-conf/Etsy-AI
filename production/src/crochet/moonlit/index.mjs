// Moonlit Meadow crochet document design system (PROTOTYPE, awaiting owner
// approval; the Stage 2 adapter still uses ../templates.mjs). Deterministic:
// no model, no network, no image generation. Image slots receive file paths.
import { missingGlyphs } from '../design.mjs';
import { PAPERS } from '../design.mjs';
import { sourceTextProblems, instructionBoundsProblems, normalText } from '../text-qc.mjs';
import { MoonlitFlow, MoonlitFooter } from './components.mjs';
import * as T from './templates.mjs';
import { loadMoonlitFonts, MOONLIT_MEADOW } from './theme.mjs';

export { MOONLIT_MEADOW, loadMoonlitFonts, PALETTE, COLOURS, TYPE, GEOMETRY } from './theme.mjs';
export { ORNAMENTS, ornamentSvg } from './ornaments.mjs';
export { drawMoonlit } from './draw.mjs';
export * as components from './components.mjs';
export * as templates from './templates.mjs';

/**
 * Image slots (all optional; a missing slot is omitted and its space reused):
 *   bundleHeroImage, overviewImage, backImage, materialsLifestyleImage: {asset|file, px:[w,h], crop?, caption?}
 *   diagrams[pattern_id]: [{asset|file, px, caption}] (shown whole)
 *   patterns[pattern_id]: {patternHeroImage?, finishedResultImage?}
 * `crop` (fractions of the source) only chooses what the frame shows.
 */
export const emptySlots=()=>({bundleHeroImage:null,overviewImage:null,backImage:null,materialsLifestyleImage:null,patterns:{},diagrams:{}});

/**
 * Lay out every document for one paper, mirroring the classic adapter: the
 * complete bundle (cover, welcome, index, materials, abbreviations, patterns,
 * combinations, back), the standalone index / materials / abbreviations, each
 * pattern alone, and (A4) the printing guide.
 */
export async function layoutMoonlit(bundle,{paper,slots=emptySlots(),theme=MOONLIT_MEADOW,files={individual:bundle.patterns.length}}){
  const fonts=await loadMoonlitFonts(), P=PAPERS[paper];
  const ctx={bundle,slots,theme,files,pageOf:null};
  const flow=running=>new MoonlitFlow({paper:P,fonts,running:{left:running},theme});
  const bundleDoc=pageOf=>{
    const f=flow(bundle.title);ctx.pageOf=pageOf;
    T.cover(f,ctx);T.welcome(f,ctx);T.index(f,ctx);T.materials(f,ctx);T.abbreviations(f,ctx);
    bundle.patterns.forEach((p,i)=>T.pattern(f,ctx,p,i+1));
    if(bundle.combinations)T.combinations(f,ctx);
    T.back(f,ctx);MoonlitFooter(f);return f;
  };
  // Two passes: the index shows each pattern's page (its pagination does not depend on the numbers).
  const first=bundleDoc(null), pageOf=new Map();
  first.pages.forEach((pg,i)=>{if(pg.kind==='pattern'&&!pg.meta.continued)pageOf.set(pg.meta.pattern_id,i+1);});
  const docs={bundle:bundleDoc(pageOf)};ctx.pageOf=pageOf;
  const single=(fn,...a)=>{const f=flow(bundle.title);fn(f,ctx,...a);MoonlitFooter(f);return f;};
  docs.index=single(T.index,{standalone:true});
  docs.materials=single(T.materials);
  docs.abbreviations=single(T.abbreviations);
  docs.patterns=new Map(bundle.patterns.map((p,i)=>{const f=flow(`${theme.brand} · Pattern ${String(i+1).padStart(2,'0')}`);T.pattern(f,ctx,p,i+1);MoonlitFooter(f);return [p.pattern_id,f];}));
  if(paper==='A4')docs.guide=single(T.guide);
  return {docs,pageOf,fonts};
}

/**
 * Layout QC for Moonlit documents, reusing the Stage 2 checks unchanged:
 * every approved field placed verbatim and in order (sourceTextProblems),
 * instruction rows inside their column and free of collisions
 * (instructionBoundsProblems), plus every text op inside its box and page,
 * and every glyph printable in the font it is drawn with.
 */
export function moonlitLayoutProblems(docs,bundle){
  const problems=[];
  const all=[...Object.entries(docs).filter(([k])=>k!=='patterns'),...[...docs.patterns].map(([k,f])=>[`pattern ${k}`,f])];
  for(const p of bundle.patterns){
    problems.push(...sourceTextProblems(docs.patterns.get(p.pattern_id),p).map(e=>`individual ${p.pattern_id} ${e}`));
    problems.push(...sourceTextProblems(docs.bundle,p).map(e=>`bundle ${p.pattern_id} ${e}`));
  }
  for(const [name,f] of all){
    problems.push(...instructionBoundsProblems(f).map(e=>`${name} ${e}`));
    f.pages.forEach((pg,i)=>{for(const o of pg.ops){
      if(o.t!=='text')continue;
      if(o.width>o.maxWidth+0.5||o.x<o.box.x-0.5||o.x+o.width>o.box.x+o.box.w+0.5||o.x<0||o.x+o.width>f.W||o.y<0||o.y>f.H)problems.push(`${name} p${i+1} text outside its box: "${o.text.slice(0,40)}"`);
      const miss=missingGlyphs(f.fonts[o.font],o.text);
      if(miss.length)problems.push(`${name} p${i+1} font ${o.font} cannot print ${miss.map(c=>JSON.stringify(c)).join(', ')}`);
    }});
  }
  // Cover title: split lines reconstruct the approved title (case aside: the wordmark is set in capitals).
  const coverLines=docs.bundle.pages[0].ops.filter(o=>o.t==='text'&&o.src?.field==='title').map(o=>o.text);
  if(coverLines.length&&normalText(coverLines.join(' ')).toLowerCase()!==normalText(bundle.title).toLowerCase())problems.push('cover title lines differ from the approved title');
  return problems;
}
