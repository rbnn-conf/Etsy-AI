// Crochet VISUAL SET (ADR-063): one collection HERO + one finished-item
// PREVIEW per approved pattern. Deterministic; no model, no image call, no
// network. Shared by Stage 1 (which plans, generates and reviews the images)
// and Stage 2 (which places the approved previews and re-checks everything).
//
//   approved patterns -> fingerprints (fingerprint.mjs, authoritative)
//     -> CROCHET VISUAL DIRECTOR (this file): hero_scene_brief + one pattern_preview_brief per pattern
//     -> prompt builder and image provider (Stage 1 only; this package never calls a model)
//     -> integrity + file QC (this file) -> owner approval (Stage 1) -> Stage 2 handoff gate (this file)
//     -> PDF renderer: each preview in the pattern page's fixed top-right slot.
//
// The art direction may decide HOW approved crochet objects are staged; it can
// never decide WHAT crochet objects exist. Every crochet object in a brief is
// an approved pattern ID bound to the SHA-256 of its fingerprint. Props are
// non-crochet and are named concretely; vague "complementary crochet" wording
// is refused. Code cannot see what a generated image shows: content is the
// owner's review, and the images are illustrative renderings, never
// photographs of test-crocheted items.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hash, sharp } from '../lib.mjs';
import { bundleFingerprints } from './fingerprint.mjs';

export const VISUAL_SET_VERSION=1;
export const VISUAL_SET_DIR='visuals/crochet';
export const VISUAL_BRIEFS=`${VISUAL_SET_DIR}/briefs.json`;
export const VISUAL_MANIFEST=`${VISUAL_SET_DIR}/visual-manifest.json`;
export const HERO_ASSET='crochet-hero';
export const previewAsset=pid=>`crochet-preview-${pid}`;
const pad=n=>String(n).padStart(2,'0');
const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export const HERO_FILE=`${VISUAL_SET_DIR}/hero/hero.png`;
export const previewFile=(n,pid)=>`${VISUAL_SET_DIR}/previews/${pad(n)}-${slug(pid)}.png`;
export const historyFile=(id,revision)=>`${VISUAL_SET_DIR}/history/${id}-r${pad(revision)}.png`;
/** Owner-visible label of the PDF image: an illustration, never a photograph of a tested item. */
export const PREVIEW_CAPTION='Illustrative finished-item preview';
// The pattern page's fixed top-right image slot (Moonlit Meadow, templates.mjs pattern()).
export const PREVIEW_SLOT_MM=Object.freeze({w:56,h:70});
// Print resolution of a preview in that slot (cover fit): below MIN fails, below GOOD warns.
export const MIN_PREVIEW_PPI=200, GOOD_PREVIEW_PPI=300;
// A cover crop must keep at least this share of the source, or the subject may be cut off.
export const MIN_VISIBLE_FRACTION=0.5;
export const MIN_HERO_SHORT_SIDE=768;
// The hero is a scene, not an inventory: at most this many approved pieces are staged in it.
export const MAX_HERO_PIECES=8;

const canon=v=>Array.isArray(v)?`[${v.map(canon).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`:JSON.stringify(v);
export const canonSha=v=>hash(Buffer.from(canon(v)));
/** SHA-256 of one pattern fingerprint (canonical JSON): the binding between a visual and its pattern. */
export const fingerprintSha=fp=>canonSha(fp);

// ---------- what each approved pattern IS (function, staging, preview view) ----------
// Matched on the pattern NAME + CATEGORY, specific functions before shapes ("Maple Leaf Placemat" is a placemat).
// props: [text, kind] NON-crochet objects that show the function; never crochet, knitted or yarn.
const OBJECTS=Object.freeze([
  {type:'placemat',match:/\bplace ?mats?\b/,hero:'laid flat on the table beneath a plain stoneware dinner plate',
    view:'shown flat from directly above so its whole outline reads',context:'on a warm wood table, with the edge of a plain stoneware plate resting on it',props:[['a plain stoneware dinner plate','plate']]},
  {type:'table runner',match:/\b(table )?runners?\b/,hero:'running lengthwise through the centre of the table',
    view:'a gentle three-quarter view along its length, showing its full width and repeating motif',context:'laid along a warm wood table',props:[]},
  {type:'coaster',match:/\bcoasters?\b/,hero:'beneath a ceramic mug',
    view:'a three-quarter view with the whole coaster outline visible',context:'a plain ceramic mug resting partly on it or beside it; the coaster stays clearly visible',props:[['a plain ceramic mug','mug']]},
  {type:'napkin ring',match:/\bnapkin (rings?|holders?)\b/,hero:'wrapped around a rolled natural linen napkin',
    view:'a close three-quarter view',context:'actually wrapped around a rolled plain linen napkin',props:[['a rolled plain linen napkin','napkin']]},
  {type:'cutlery pocket',match:/\b(cutlery|silverware|utensils?|flatware)\b/,hero:'holding a knife and fork',
    view:'a front view with the pocket shape and its opening readable',context:'with a plain steel knife and fork inserted',props:[['a plain steel knife and fork','cutlery']]},
  {type:'appliqué',match:/\bappliqu[eé]s?\b/,hero:'laid flat as a small decorative accent',
    view:'flat and top-down, the whole outline visible',context:'laid flat on plain natural linen',props:[]},
  {type:'garland',match:/\b(garlands?|bunting)\b/,hero:'draped gently in the background',view:'a straight-on view of a short length, every motif readable',context:'draped against a plain wall',props:[]},
  {type:'basket',match:/\bbaskets?\b/,hero:'standing open on the surface',view:'a three-quarter view showing its shape and opening',context:'standing empty on a plain wood surface',props:[]},
  {type:'cushion',match:/\b(cushions?|pillows?)\b/,hero:'resting on a plain sofa or chair',view:'a front view, slightly angled',context:'on a plain linen sofa',props:[]},
  {type:'blanket',match:/\b(blankets?|throws?|afghans?)\b/,hero:'folded or draped naturally',view:'folded to show its texture and edge',context:'folded on a plain linen chair',props:[]},
  {type:'bag',match:/\b(bags?|pouch(es)?|totes?|purses?)\b/,hero:'resting naturally on the surface',view:'a front view showing its shape and opening',context:'resting on a plain surface',props:[]},
  {type:'hat',match:/\b(hats?|beanies?|berets?)\b/,hero:'resting naturally',view:'a three-quarter view showing crown and brim',context:'resting on a plain surface',props:[]},
  {type:'scarf',match:/\b(scarf|scarves|cowls?|shawls?)\b/,hero:'folded naturally',view:'folded to show texture and width',context:'folded on a plain surface',props:[]},
  {type:'ornament',match:/\b(ornaments?|baubles?)\b/,hero:'hanging or resting as an accent',view:'a straight-on view of the whole ornament',context:'resting on plain linen',props:[]},
  {type:'toy',match:/\b(amigurumi|toys?|plush(ies)?|dolls?)\b/,hero:'sitting upright',view:'a front three-quarter view',context:'sitting on a plain surface',props:[]},
  {type:'doily',match:/\bdoil(y|ies)\b/,hero:'laid flat',view:'flat and top-down, the whole outline visible',context:'laid flat on a plain wood surface',props:[]},
  {type:'flower',match:/\b(flowers?|blooms?|blossoms?|rose|daisy|tulip|peony|poppy|lily|sunflower|bud)\b/,hero:'arranged naturally',
    view:'a close three-quarter view of the whole flower',context:'laid on plain natural linen',props:[]},
  {type:'leaf',match:/\b(leaf|leaves|foliage|fern)\b/,hero:'laid naturally as an accent',view:'flat and top-down, the whole outline visible',context:'laid flat on plain natural linen',props:[]}]);
const TABLE_TYPES=new Set(['placemat','table runner','coaster','napkin ring','cutlery pocket']);
const GENERIC=Object.freeze({type:null,hero:'placed naturally where it is clearly visible',view:'the whole piece visible',context:'on plain natural linen',props:[]});
const PLURAL={placemat:'crochet placemats','table runner':'crochet table runners',coaster:'crochet coasters','napkin ring':'crochet napkin rings','cutlery pocket':'crochet cutlery pockets or pouches',
  'appliqué':'crochet appliqués',garland:'crochet garlands or bunting',basket:'crochet baskets',cushion:'crochet cushions',blanket:'crochet blankets or throws',bag:'crochet bags or purses',
  hat:'crochet hats',scarf:'crochet scarves',ornament:'crochet ornaments',toy:'crochet toys or amigurumi',doily:'crochet doilies',flower:'crochet flowers',leaf:'loose crochet leaves'};

/** What an approved pattern is, from its own name and category (and fingerprint motif): {type, noun, hero, view, context, props}. */
export function crochetObjectOf(pattern,fp){
  const text=`${pattern.name} ${pattern.category??''}`.toLowerCase();
  const o=OBJECTS.find(x=>x.match.test(text))??(fp?.motif_type==='flower'||fp?.motif_type==='bud'?OBJECTS.find(x=>x.type==='flower'):fp?.motif_type==='foliage'?OBJECTS.find(x=>x.type==='leaf'):null)??GENERIC;
  return {...o,type:o.type??(String(pattern.category??'crochet piece').toLowerCase()),noun:pattern.name};
}

// ---------- non-crochet props ----------
// [text, kind, resembles]: a prop that resembles a crochet subject type (real leaves next to crochet leaves) is
// left out, so an image can never be read as having more crochet pieces than were approved.
const SEASON=Object.freeze({
  autumn:{props:[['a few dried berries','berries'],['small pinecones','pinecones'],['a lit pillar candle','candle'],['a sprig of real dried autumn leaves','real leaves','leaf']],
    palette:['warm walnut','natural linen','cream stoneware'],light:'warm late-afternoon autumn light'},
  winter:{props:[['a lit pillar candle','candle'],['real pine sprigs','pine','leaf'],['cinnamon sticks','cinnamon']],palette:['warm wood','natural linen','soft white'],light:'soft warm winter window light'},
  spring:{props:[['a small glass bottle vase with real fresh tulips','real flowers','flower'],['a plain ceramic jug','jug']],palette:['pale oak','natural linen','soft white'],light:'fresh soft spring daylight'},
  summer:{props:[['a glass of lemon water','glass'],['a bowl of fresh lemons','lemons']],palette:['light oak','natural linen','soft white'],light:'bright soft summer daylight'},
  any:{props:[['a lit pillar candle','candle'],['a small plain ceramic vase','vase']],palette:['warm wood','natural linen','cream'],light:'soft natural window light'}});
const seasonOf=s=>{const t=String(s??'').toLowerCase();
  return /autumn|fall|harvest|thanksgiving|halloween/.test(t)?'autumn':/winter|christmas|xmas|holiday|snow/.test(t)?'winter':/spring|easter/.test(t)?'spring':/summer/.test(t)?'summer':'any';};
const TABLE_PROPS=[['plain stoneware plates','plate'],['a plain ceramic mug of tea','mug'],['a natural linen napkin','napkin'],['a plain linen table runner','table runner']];
// Words that make a "prop" a crochet item: a non-crochet field may never use them.
const CROCHET_WORD=/\b(crochet\w*|knit\w*|yarn|amigurumi|doil(?:y|ies)|granny squares?|macram[eé])\b/i;
// Vague wording that would let an image model invent products.
const VAGUE=/\b(complementary|coordinating|matching|assorted|additional|extra|more|other|various|similar)\b[^.;]{0,30}\b(crochet|knit\w*|decorations?|pieces?|motifs?|items?|accents?)\b/i;

/** Pattern-supported description of one piece (colours, size, construction): from the approved pattern and its fingerprint only. */
function pieceFacts(p,fp){
  const colours=[...new Set((p.yarn??[]).map(y=>y.colour).filter(Boolean))];
  const details=(fp.construction_details??[]).filter(d=>!/magic ring/.test(d));
  return {finished_dimensions:p.finished_size,colour_direction:colours.length?colours.join(', '):'as the pattern specifies',
    construction:details.length?details.join(', '):'as written in the pattern'};
}
const objectRef=(p,fp,o,quantity=1)=>({pattern_id:p.pattern_id,pattern_name:p.name,object_type:o.type,quantity,fingerprint_sha256:fingerprintSha(fp)});

/**
 * The COLLECTION HERO art direction (hero_scene_brief). Commercial/editorial: one dominant approved piece
 * (the plan's focal pattern, else the largest), up to MAX_HERO_PIECES-1 supporting approved pieces used
 * naturally, concrete non-crochet props, a seasonal table or interior. Every crochet object is an approved pattern.
 */
export function heroSceneBrief({bundle,fingerprints=bundleFingerprints(bundle),product={},focalId=null}){
  const P=bundle.patterns, F=fingerprints, obj=p=>crochetObjectOf(p,F[p.pattern_id]);
  const area=p=>(F[p.pattern_id].finished.width_cm??0)*(F[p.pattern_id].finished.height_cm??F[p.pattern_id].finished.width_cm??0);
  const hero=P.find(p=>p.pattern_id===focalId)??[...P].sort((a,b)=>area(b)-area(a))[0];
  const support=P.filter(p=>p!==hero).slice(0,MAX_HERO_PIECES-1), shown=[hero,...support];
  const types=new Set(shown.map(p=>obj(p).type)), table=[...types].some(t=>TABLE_TYPES.has(t));
  const leafy=shown.some(p=>['leaf'].includes(obj(p).type)||F[p.pattern_id].motif_type==='foliage'||/\bleaf|leaves\b/i.test(p.name));
  const flowery=shown.some(p=>obj(p).type==='flower'||['flower','bud'].includes(F[p.pattern_id].motif_type));
  const season=SEASON[seasonOf(product.season??bundle.theme)];
  // Function props of the shown pieces, then table and season props; never a duplicate of a crochet object's type.
  const candidates=[...shown.flatMap(p=>obj(p).props),...(table?TABLE_PROPS:[]),...season.props];
  const seen=new Set(), props=[];
  for(const [text,kind,resembles] of candidates){
    if(seen.has(kind)||types.has(kind))continue;
    if((resembles==='leaf'&&leafy)||(resembles==='flower'&&flowery))continue;
    seen.add(kind);props.push(text);
  }
  const colours=[...new Set(shown.flatMap(p=>(p.yarn??[]).map(y=>y.colour).filter(Boolean)))].slice(0,6);
  const staging=p=>`${p.name} [${p.pattern_id}]: ${obj(p).hero}`;
  return {version:VISUAL_SET_VERSION,kind:'hero',product_id:product.product_id??null,title:product.name??bundle.title,theme:bundle.theme??null,season:product.season??null,
    scene_type:table?'editorial lifestyle table setting':'editorial lifestyle styled scene',
    hero_subject:{...objectRef(hero,F[hero.pattern_id],obj(hero)),staging:obj(hero).hero},
    supporting_subjects:support.map(p=>({...objectRef(p,F[p.pattern_id],obj(p)),staging:obj(p).hero})),
    environment:table?'a styled dining table set for a seasonal meal in a calm, softly lit home interior':'a calm, softly lit home interior',
    surface:table?'a warm walnut wood table':'plain natural linen over warm wood',
    lighting:`${season.light} from one side, soft realistic shadows`,
    camera:'eye-level three-quarter view from slightly above, 50 mm lens, gentle depth of field with the hero piece in sharp focus',
    composition:'asymmetrical but balanced editorial composition with layered depth (foreground, middle ground, background); the hero piece is the dominant focal point; each supporting approved piece is used naturally and stays clearly readable; generous breathing room; never a flat catalogue grid',
    palette:[...colours,...season.palette],
    props,
    must_show:shown.map(staging),
    may_show:props,
    must_not_show:forbidden({approved:shown,obj,others:[]}),
    crochet_objects:shown.map(p=>objectRef(p,F[p.pattern_id],obj(p))),
    not_pictured:P.filter(p=>!shown.includes(p)).map(p=>p.pattern_id)};
}

/** One FINISHED-ITEM PREVIEW brief per approved pattern: ONE crochet product, instructional, uncluttered, consistent style. */
export function patternPreviewBriefs({bundle,fingerprints=bundleFingerprints(bundle),product={}}){
  const P=bundle.patterns, F=fingerprints;
  return P.map((p,i)=>{
    const fp=F[p.pattern_id], o=crochetObjectOf(p,fp), facts=pieceFacts(p,fp);
    return {version:VISUAL_SET_VERSION,kind:'pattern-preview',product_id:product.product_id??null,pattern_number:i+1,pattern_id:p.pattern_id,pattern_name:p.name,object_type:o.type,
      primary_subject:`the finished ${p.name}, one piece, whole and clearly visible`,
      finished_dimensions:facts.finished_dimensions,colour_direction:facts.colour_direction,construction:facts.construction,
      view:o.view,styling_context:o.context,
      background:'a warm wood table or plain natural linen, softly out of focus, uncluttered',
      lighting:'soft natural window light from one side, gentle contact shadows',
      props:o.props.map(([t])=>t),
      must_show:[`${p.name} [${p.pattern_id}]: the whole finished piece, its shape easy to read`,'realistic crochet stitches and yarn texture'],
      must_not_show:forbidden({approved:[p],obj:x=>crochetObjectOf(x,F[x.pattern_id]),others:P.filter(x=>x!==p)}),
      crochet_objects:[objectRef(p,fp,o)],fingerprint_sha256:fingerprintSha(fp)};
  });
}

function forbidden({approved,obj,others}){
  const types=new Set(approved.map(p=>obj(p).type));
  return [...others.map(p=>`the ${p.name} (another pattern in this collection)`),
    ...Object.entries(PLURAL).filter(([t])=>!types.has(t)).map(([,n])=>n),
    'loose or extra crochet leaves, flowers or motifs','a second copy of any approved piece',
    'any crochet, knitted or yarn item not listed under APPROVED CROCHET OBJECTS',
    'text, lettering, labels, logos, watermarks, price tags or packaging','hands or people'];
}

/** Both briefs for one approved bundle (deterministic: the same patterns give the same briefs). */
export function visualBriefs({bundle,product={},plan=null}){
  const fingerprints=bundleFingerprints(bundle), ids=bundle.patterns.map(p=>p.pattern_id);
  const focalId=plan?.patterns?.find(x=>x.role==='focal'&&ids.includes(x.pattern_id))?.pattern_id??null;
  return {version:VISUAL_SET_VERSION,fingerprints:Object.fromEntries(Object.entries(fingerprints).map(([k,v])=>[k,fingerprintSha(v)])),
    hero:heroSceneBrief({bundle,fingerprints,product,focalId}),previews:patternPreviewBriefs({bundle,fingerprints,product})};
}

// ---------- integrity (the approved patterns are the source of truth) ----------
const FREE_TEXT_NON_CROCHET=['scene_type','environment','surface','lighting','camera','composition','background','styling_context','view'];
/**
 * Brief <-> pattern contradictions: [] when the brief may be used. Every crochet object is an approved pattern
 * bound to its CURRENT fingerprint; a preview shows exactly its own pattern; non-crochet fields never name a
 * crochet item; no vague wording that would let a model add products.
 */
export function briefProblems(brief,{bundle,fingerprints=bundleFingerprints(bundle)}){
  const out=[], ids=new Set(bundle.patterns.map(p=>p.pattern_id)), where=brief?.kind==='hero'?'hero':`preview ${brief?.pattern_id}`;
  const add=m=>out.push(`${where}: ${m}`);
  if(!brief||!['hero','pattern-preview'].includes(brief.kind))return [`${where}: not a crochet visual brief`];
  const objs=Array.isArray(brief.crochet_objects)?brief.crochet_objects:[];
  if(!objs.length)add('no crochet objects');
  const seen=new Set();
  for(const o of objs){
    if(!ids.has(o.pattern_id)){add(`crochet object "${o.pattern_id}" is not an approved pattern`);continue;}
    if(seen.has(o.pattern_id))add(`crochet object ${o.pattern_id} listed twice`);seen.add(o.pattern_id);
    if(o.fingerprint_sha256!==fingerprintSha(fingerprints[o.pattern_id]))add(`${o.pattern_id}: fingerprint changed since this brief was made`);
    if(o.quantity!==1)add(`${o.pattern_id}: quantity must be 1`);
  }
  if(brief.kind==='hero'){
    const shown=[brief.hero_subject,...(brief.supporting_subjects??[])].map(s=>s?.pattern_id);
    if(!seen.has(brief.hero_subject?.pattern_id))add('the hero subject is not one of its crochet objects');
    if(canon([...shown].sort())!==canon([...seen].sort()))add('hero + supporting subjects differ from the crochet objects');
    if(objs.length>MAX_HERO_PIECES)add(`more than ${MAX_HERO_PIECES} crochet pieces`);
    if((brief.must_show??[]).length!==objs.length||objs.some(o=>!(brief.must_show??[]).some(s=>s.includes(`[${o.pattern_id}]`))))add('must_show does not list exactly the approved crochet objects');
  }else{
    if(objs.length!==1||objs[0]?.pattern_id!==brief.pattern_id)add('a pattern preview must show exactly ONE crochet product: its own pattern');
    const others=bundle.patterns.filter(p=>p.pattern_id!==brief.pattern_id);
    const missing=others.filter(p=>!(brief.must_not_show??[]).some(s=>s.includes(p.name)));
    if(missing.length)add(`must_not_show does not forbid the other patterns (${missing.map(p=>p.pattern_id).join(', ')})`);
  }
  for(const k of FREE_TEXT_NON_CROCHET)if(brief[k]!==undefined&&CROCHET_WORD.test(String(brief[k])))add(`${k} names a crochet item; only APPROVED CROCHET OBJECTS may`);
  for(const [k,list] of [['props',brief.props],['may_show',brief.may_show],['palette',brief.palette]])for(const x of list??[])if(CROCHET_WORD.test(String(x)))add(`${k} "${x}" is a crochet item: props are never crochet`);
  // A prop of the same function as a crochet object would read as an extra (or a missing) crochet piece.
  const types=objs.map(o=>bundle.patterns.find(p=>p.pattern_id===o.pattern_id)).filter(Boolean).map(p=>crochetObjectOf(p,fingerprints[p.pattern_id]));
  for(const x of brief.props??[])for(const t of types)if(t.match&&t.match.test(String(x).toLowerCase()))add(`prop "${x}" duplicates the approved crochet ${t.type}`);
  for(const k of [...FREE_TEXT_NON_CROCHET,'must_show','props','may_show']){
    const vals=Array.isArray(brief[k])?brief[k]:[brief[k]];
    for(const v of vals)if(v!==undefined&&VAGUE.test(String(v)))add(`${k} uses vague wording that could invent products ("${VAGUE.exec(String(v))[0]}")`);
  }
  return out;
}

/** The set's structure: a hero + exactly one preview per approved pattern, in order, each mapped to its own pattern. */
export function visualSetProblems({briefs,assets,bundle}){
  const out=[], P=bundle.patterns, F=bundleFingerprints(bundle);
  if(!briefs?.hero)out.push('no hero brief');else out.push(...briefProblems(briefs.hero,{bundle,fingerprints:F}));
  const pv=briefs?.previews??[];
  if(pv.length!==P.length)out.push(`${pv.length} preview briefs for ${P.length} approved patterns`);
  P.forEach((p,i)=>{
    const b=pv[i];
    if(!b||b.pattern_id!==p.pattern_id){out.push(`preview ${i+1} is for ${b?.pattern_id??'nothing'}, expected ${p.pattern_id}`);return;}
    out.push(...briefProblems(b,{bundle,fingerprints:F}));
  });
  if(assets){
    const expect=[{id:HERO_ASSET,role:'hero',pattern_id:null,file:HERO_FILE},...P.map((p,i)=>({id:previewAsset(p.pattern_id),role:'pattern-preview',pattern_id:p.pattern_id,file:previewFile(i+1,p.pattern_id)}))];
    for(const e of expect){
      const a=assets.filter(x=>x.id===e.id);
      if(a.length!==1){out.push(`${e.id}: ${a.length?'listed more than once':'missing'}`);continue;}
      if(a[0].role!==e.role||(a[0].pattern_id??null)!==e.pattern_id)out.push(`${e.id}: mapped to ${a[0].role} ${a[0].pattern_id??''}, expected ${e.role} ${e.pattern_id??''}`.trim());
      if(a[0].file!==e.file)out.push(`${e.id}: file ${a[0].file}, expected ${e.file}`);
    }
    for(const a of assets)if(!expect.some(e=>e.id===a.id))out.push(`${a.id}: not part of this collection's visual set`);
  }
  return out;
}

// ---------- image files ----------
/** A source image in the fixed preview slot (cover fit, no distortion): effective print ppi and the share of the source kept. */
export function slotFit([pw,ph],slot=PREVIEW_SLOT_MM){
  const w=slot.w*72/25.4, h=slot.h*72/25.4, s=Math.max(w/pw,h/ph);
  return {ppi:Math.round(72/s),visible:+((w*h)/(pw*s*ph*s)).toFixed(3)};
}
/**
 * File QC for every asset: present, SHA-256 as recorded, a decodable PNG of the recorded size, not blank;
 * the hero large enough; each preview printable in the PDF slot at MIN_PREVIEW_PPI with a safe crop.
 * @param readBytes rel -> Buffer (throws when missing)
 */
export async function visualFileChecks(assets,{readBytes}){
  const problems=[], warnings=[], fit={};
  for(const a of assets){
    let bytes;try{bytes=await readBytes(a.file);}catch{problems.push(`${a.id}: ${a.file} is missing`);continue;}
    if(a.sha256&&hash(bytes)!==a.sha256){problems.push(`${a.id}: ${a.file} changed since it was generated`);continue;}
    let m, s;try{m=await sharp(bytes).metadata();s=await sharp(bytes).stats();}catch(e){problems.push(`${a.id}: not a decodable image (${e.message})`);continue;}
    if(m.format!=='png')problems.push(`${a.id}: not a PNG`);
    if(a.width&&(m.width!==a.width||m.height!==a.height))problems.push(`${a.id}: ${m.width}x${m.height}, recorded ${a.width}x${a.height}`);
    if(Math.max(...s.channels.slice(0,3).map(c=>c.stdev))<2)problems.push(`${a.id}: the image is blank`);
    if(a.role==='hero'){if(Math.min(m.width,m.height)<MIN_HERO_SHORT_SIDE)problems.push(`${a.id}: ${m.width}x${m.height} is too small for a hero (short side < ${MIN_HERO_SHORT_SIDE} px)`);continue;}
    const f=slotFit([m.width,m.height]);fit[a.id]=f;
    if(f.ppi<MIN_PREVIEW_PPI)problems.push(`${a.id}: ${f.ppi} ppi in the ${PREVIEW_SLOT_MM.w}x${PREVIEW_SLOT_MM.h} mm slot (minimum ${MIN_PREVIEW_PPI})`);
    else if(f.ppi<GOOD_PREVIEW_PPI)warnings.push(`${a.id}: ${f.ppi} ppi in the PDF slot (below ${GOOD_PREVIEW_PPI})`);
    if(f.visible<MIN_VISIBLE_FRACTION)problems.push(`${a.id}: the slot would keep only ${Math.round(f.visible*100)}% of the image (aspect ${m.width}x${m.height}); the subject may be cut off`);
  }
  return {problems,warnings,fit};
}

/** Order-independent digest of the approved assets (id + SHA-256). */
export const assetsDigest=assets=>canonSha([...assets].map(a=>({id:a.id,sha256:a.sha256})).sort((x,y)=>x.id.localeCompare(y.id)));

/**
 * The complete deterministic QC of a generated set (free): structure + brief integrity + files.
 * It cannot verify what an image shows (that is the owner's review) or stitch-level correctness.
 */
export async function visualSetQc({briefs,assets,bundle,readBytes}){
  const structure=visualSetProblems({briefs,assets,bundle});
  const files=await visualFileChecks(assets,{readBytes});
  const checks=[
    {name:'every crochet object maps to an approved pattern and its current fingerprint',ok:!structure.some(p=>/approved pattern|fingerprint|listed twice|quantity/.test(p))},
    {name:'one hero and exactly one preview per approved pattern, each mapped to its own pattern',ok:!structure.some(p=>/preview|missing|mapped|expected|not part/.test(p)&&!/fingerprint/.test(p))},
    {name:'props and staging never name a crochet item; no vague product wording',ok:!structure.some(p=>/names a crochet|crochet item|vague|duplicates/.test(p))},
    {name:'files present, unchanged, decodable, not blank',ok:!files.problems.some(p=>/missing|changed|decodable|PNG|blank|recorded/.test(p))},
    {name:`previews print at >= ${MIN_PREVIEW_PPI} ppi in the fixed slot with a safe crop; hero large enough`,ok:!files.problems.some(p=>/ppi|slot would keep|too small/.test(p))}];
  const problems=[...structure,...files.problems];
  return {version:VISUAL_SET_VERSION,passed:!problems.length,checks,problems,warnings:files.warnings,fit:files.fit,
    not_checked:'What each image shows is not machine-checked: the owner reviews every image for wrong or extra crochet items. No stitch-level correctness is claimed.'};
}

// ---------- Stage 2: the approved set ----------
/**
 * The owner-approved visual set for a crochet product, re-checked from disk, or null when the product has
 * none (products without a visual set build as before). Once a set exists it is mandatory: an unapproved,
 * changed, incomplete or stale set is refused with every reason.
 * @param bundle the APPROVED pattern bundle (already SHA-verified by the caller)
 * @returns null | {ok, reasons, set:{manifest:{file,sha256}, approval, hero, previews:{pattern_id: asset id}, assets:[...] , bytes: Map}}
 */
export async function approvedVisualSet(product,productDir,{bundle}){
  const v=product.crochet_visuals;
  if(!v)return null;
  const reasons=[], R=m=>reasons.push(m), a=v.approval;
  if(!a)return {ok:false,reasons:['the crochet visual set is not approved: finish it and press ✅ Approve Visual Set in Stage 1'],set:null};
  let bytes=null, m=null;
  try{bytes=await readFile(join(productDir,VISUAL_MANIFEST));}catch{R(`${VISUAL_MANIFEST} is missing`);}
  if(bytes){if(hash(bytes)!==a.manifest_sha256)R(`${VISUAL_MANIFEST} changed since the visual set was approved`);try{m=JSON.parse(bytes);}catch{R(`${VISUAL_MANIFEST} is not valid JSON`);}}
  if(m){
    if(!m.approval||m.approval.approved_at!==a.approved_at)R('the visual manifest carries no matching owner approval');
    R2(reasons,visualSetProblems({briefs:m.briefs,assets:m.assets,bundle}));
    if(assetsDigest(m.assets??[])!==a.assets_sha256)R('the approved assets differ from the visual manifest');
  }
  const files=new Map();
  if(m&&!reasons.length)for(const x of m.assets){
    try{const b=await readFile(join(productDir,x.file));if(hash(b)!==x.sha256)R(`${x.file} changed since the visual set was approved`);else files.set(x.id,b);}
    catch{R(`approved visual ${x.file} is missing`);}
  }
  if(reasons.length)return {ok:false,reasons,set:null};
  return {ok:true,reasons,set:{manifest:{file:VISUAL_MANIFEST,sha256:hash(bytes)},
    approval:{approved_at:a.approved_at,approved_by:a.by,manifest_sha256:a.manifest_sha256,assets_sha256:a.assets_sha256,patterns_sha256:m.patterns_sha256},
    hero:HERO_ASSET,previews:Object.fromEntries(bundle.patterns.map(p=>[p.pattern_id,previewAsset(p.pattern_id)])),
    assets:m.assets.map(x=>({id:x.id,file:x.file,role:x.role,pattern_id:x.pattern_id??null,sha256:x.sha256,width:x.width,height:x.height,model:x.model??null,
      fingerprint_sha256:x.fingerprint_sha256??null,source:'crochet-visual-set',kind:'illustration'})),bytes:files}};
}
const R2=(reasons,list)=>{for(const x of list)reasons.push(x);};
