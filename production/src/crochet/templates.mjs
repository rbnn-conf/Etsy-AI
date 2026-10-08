// Crochet pattern document templates (ADR-041). Each template lays one kind
// of page into a Flow. Every sentence is either the approved source text
// (placed verbatim, tagged with `src` for QC) or a fixed, generic sentence
// that is true of every bundle (how to print, how to read a pattern). Nothing
// here writes, completes or interprets a crochet instruction, and nothing
// claims testing. Generic: flowers, animals or décor all use the same pages.
import { mm } from '../lib.mjs';
import { COLOURS, TYPE } from './design.mjs';
import { fitContain } from './layout.mjs';
import { glossaryKey, isTested } from './bundle.mjs';

// Craft Yarn Council weight names.
export const WEIGHT_NAMES=Object.freeze({'0-lace':'0 Lace','1-super-fine':'1 Super Fine','2-fine':'2 Fine','3-light':'3 Light','4-medium':'4 Medium',
  '5-bulky':'5 Bulky','6-super-bulky':'6 Super Bulky','7-jumbo':'7 Jumbo'});
export const LEVEL_NAMES=Object.freeze({beginner:'Beginner',easy:'Easy',intermediate:'Intermediate',experienced:'Experienced'});
// Standard US <-> UK stitch names (reference only; the patterns keep their declared terminology).
export const US_UK=Object.freeze([['sl st: slip stitch','sl st / ss: slip stitch'],['sc: single crochet','dc: double crochet'],['hdc: half double crochet','htr: half treble crochet'],
  ['dc: double crochet','tr: treble crochet'],['tr: treble crochet','dtr: double treble crochet']]);
const pad=n=>String(n).padStart(2,'0');
const cap=s=>String(s).charAt(0).toUpperCase()+String(s).slice(1);
// Hook sizes: one shared rule (hook.mjs), also used by text QC and the Telegram review.
export { hookText, hookOf } from './hook.mjs';
import { hookOf } from './hook.mjs';
const plural=(n,one,many=`${one}s`)=>`${n} ${n===1?one:many}`;
// A small marker op (list number, step label, abbreviation) for the first line of a block.
const mark=(text,{x,w,font='bold',color=COLOURS.rose,src=null},ctx)=>({t:'text',x,text,font,size:TYPE.body.size,color,width:ctx.width(text,font,TYPE.body.size),maxWidth:w,box:{x,w},src,line:0});

function label(flow,text){flow.text(text.toUpperCase(),{font:'bold',style:TYPE.label,color:COLOURS.rose});}
function h2(flow,text,{src=null,keep=40}={}){flow.space(10);flow.text(text,{font:'display',style:TYPE.h2,src,keep});flow.space(3);}
function h3(flow,text,{src=null,keep=30}={}){flow.space(6);flow.text(text,{font:'bold',style:TYPE.h3,src,keep});flow.space(1);}
const title=(flow,kicker,text,src=null)=>{label(flow,kicker);flow.space(2);flow.text(text,{font:'display',style:TYPE.display,src});};
const note=(flow,text)=>{flow.space(4);flow.text(text,{style:TYPE.small,color:COLOURS.soft});};

/** Numbered or bulleted list; items are verbatim source lines when `src` is given. */
function list(flow,ctx,items,{numbered=false,src=null,indent=mm(7)}={}){
  items.forEach((t,i)=>{
    const made=flow.text(t,{x:flow.left+indent,width:flow.width-indent,src:src?src(i):null,keep:0});
    flow.marker(made[0],mark(numbered?`${i+1}.`:'•',{x:flow.left,w:indent},ctx));
    flow.space(2);
  });
}
/** Label + value rows inside a tinted panel (drawn only when the whole panel fits one page). */
function panel(flow,ctx,rows,{width=flow.width,labelW=mm(30),pad:p=mm(4)}={}){
  const valueW=width-labelW-2*p, gap=3;
  const h=rows.reduce((s,r)=>s+flow.measure(r.value,{width:valueW})+gap,0)+2*p-gap;
  if(flow.ensure(h))flow.rect(flow.left,flow.y-h,width,h,COLOURS.blush);
  flow.y-=p;
  for(const r of rows){
    const made=flow.text(r.value,{x:flow.left+p+labelW,width:valueW,src:r.src??null});
    if(r.label)flow.marker(made[0],mark(r.label,{x:flow.left+p,w:labelW-mm(2),color:COLOURS.soft},ctx));
    flow.space(gap);
  }
  flow.y+=gap;flow.space(p);
}

// ---------- cover ----------
export function cover(flow,ctx){
  const {bundle,slots}=ctx;
  flow.newPage('cover',{folio:false});
  const field=flow.H*0.58;
  flow.rect(0,flow.H-field,flow.W,field,COLOURS.cream);
  flow.y=flow.H-mm(12);
  flow.text('LUMIUMX',{font:'bold',style:TYPE.label,color:COLOURS.rose,align:'center'});
  const frame={x:flow.left+mm(14),y:flow.H-field+mm(10),w:flow.width-mm(28),h:field-mm(30)};
  flow.image(slots.hero.asset,fitContain(slots.hero.px,frame),{where:'cover hero artwork',source:slots.hero});
  flow.y=flow.H-field-mm(10);
  flow.text(bundle.title,{font:'display',style:TYPE.coverTitle,align:'center',src:{field:'title'}});
  flow.space(4);
  flow.text(bundle.theme,{font:'italic',style:TYPE.h2,color:COLOURS.soft,align:'center',src:{field:'theme'}});
  flow.space(12);
  flow.text(`${plural(bundle.patterns.length,'crochet pattern')}  ·  ${bundle.skill_level.map(l=>LEVEL_NAMES[l]).join(', ')}  ·  ${bundle.terminology} crochet terms`,
    {font:'bold',style:TYPE.small,align:'center'});
  flow.space(4);
  flow.text('Digital pattern collection to print at home',{style:TYPE.small,color:COLOURS.soft,align:'center'});
}

// ---------- welcome / how to use ----------
export function welcome(flow,ctx){
  const {bundle,slots}=ctx;
  flow.newPage('welcome');
  title(flow,'Welcome','How to use this collection');
  flow.space(8);
  // The approved collection overview illustration, when there is one (never a photograph).
  if(slots.overview){const h=mm(62), box=fitContain(slots.overview.px,{x:flow.left,y:flow.y-h,w:flow.width,h});
    flow.image(slots.overview.asset,box,{where:'welcome collection overview artwork',source:slots.overview});flow.y-=h+mm(6);}
  flow.text(`This collection contains ${plural(bundle.patterns.length,'crochet pattern')}. Each pattern lists its materials, hook size, stitches and abbreviations, then its instructions in order.`);
  h2(flow,'Before you start');
  list(flow,ctx,['Choose a pattern from the pattern index.','Gather the yarn, hook and other materials listed on its page.',
    'Read the abbreviations. Every abbreviation a pattern uses is explained on its page and in the abbreviations reference.',
    'Work each round or row in the order written. Stitch counts are shown where the pattern gives them.',
    'Finish with the assembly and finishing steps.'],{numbered:true});
  h2(flow,'Crochet terms');
  flow.text(`All patterns in this collection use ${bundle.terminology} crochet terms. The abbreviations reference includes a table of US and UK stitch names.`);
  h2(flow,'Skill levels');
  for(const l of bundle.skill_level){const n=bundle.patterns.filter(p=>p.difficulty===l).length;if(n)flow.text(`${LEVEL_NAMES[l]}: ${plural(n,'pattern')}`);}
  note(flow,'Finished sizes depend on your yarn, hook and tension, so they are given as a guide.');
  if(bundle.notes?.length){h2(flow,'Notes');list(flow,ctx,bundle.notes,{src:i=>({field:`notes[${i}]`})});}
}

// ---------- pattern index ----------
export function index(flow,ctx,{standalone=false}={}){
  const {bundle,slots,pageOf}=ctx;
  flow.newPage('index');
  title(flow,'Contents','Pattern index');
  note(flow,standalone?'Page numbers refer to the complete collection PDF.':`${plural(bundle.patterns.length,'pattern')}, in the order they appear in this collection.`);
  flow.space(8);
  const thumb=mm(12), rowH=thumb+mm(3), pageW=mm(14);
  bundle.patterns.forEach((p,i)=>{
    if(flow.room<rowH){flow.newPage('index',{continued:true});flow.space(4);}
    const top=flow.y, art=slots.patterns[p.pattern_id], cy=top-rowH/2;
    if(i%2===0)flow.rect(flow.left-mm(2),top-rowH,flow.width+mm(4),rowH,COLOURS.cream);
    if(art)flow.image(art.asset,fitContain(art.px,{x:flow.left,y:cy-thumb/2,w:thumb,h:thumb}),{where:`index thumbnail ${p.pattern_id}`,source:art});
    else{
      flow.op({t:'circle',x:flow.left+thumb/2,y:cy,r:mm(4.2),color:COLOURS.blush});
      const n=pad(i+1),w=ctx.width(n,'bold',TYPE.small.size);
      flow.op({t:'text',x:flow.left+thumb/2-w/2,y:cy-TYPE.small.size*0.35,text:n,font:'bold',size:TYPE.small.size,color:COLOURS.rose,width:w,maxWidth:thumb,box:{x:flow.left,w:thumb},src:null});
    }
    const tx=flow.left+thumb+mm(4), tw=flow.width-thumb-mm(4)-pageW;
    flow.y=cy+(TYPE.body.leading+TYPE.small.leading)/2;
    const made=flow.text(p.name,{font:'bold',x:tx,width:tw,src:{pattern_id:p.pattern_id,field:'name',context:'index'}});
    flow.text(`${cap(p.category)} · ${LEVEL_NAMES[p.difficulty]}`,{style:TYPE.small,color:COLOURS.soft,x:tx,width:tw});
    const s=String(pageOf?.get(p.pattern_id)??''), w=ctx.width(s,'bold',TYPE.body.size);
    flow.op({t:'text',x:flow.right-w,y:made[0].y,text:s,font:'bold',size:TYPE.body.size,color:COLOURS.rose,width:w,maxWidth:pageW,box:{x:flow.right-pageW,w:pageW},src:null,index_page_of:p.pattern_id});
    flow.y=top-rowH;
  });
}

// ---------- materials & tools reference ----------
export function materials(flow,ctx){
  const {bundle}=ctx, P=bundle.patterns;
  flow.newPage('materials');
  title(flow,'Reference','Materials and tools');
  note(flow,'Everything the patterns in this collection ask for, in one place. Each pattern page lists exactly what that pattern needs.');
  h2(flow,'Yarn weights');
  for(const w of Object.keys(WEIGHT_NAMES)){const n=P.filter(p=>p.yarn_weight===w).length;if(n)flow.text(`${WEIGHT_NAMES[w]} (Craft Yarn Council): ${plural(n,'pattern')}`);}
  h2(flow,'Crochet hooks');
  const hooks=new Map();
  for(const p of P){const k=hookOf(p);hooks.set(k,{mm:p.requires_hook===false?Infinity:p.hook_size.mm,names:[...(hooks.get(k)?.names??[]),p.name]});}
  for(const [k,{names}] of [...hooks.entries()].sort(([,a],[,b])=>a.mm-b.mm))flow.text(`${k}: ${names.length>4?plural(names.length,'pattern'):names.join(', ')}`);
  h2(flow,'Other materials');
  const other=new Map();
  for(const p of P)for(const m of p.additional_materials){const k=m.trim().toLowerCase();other.set(k,{text:other.get(k)?.text??m,n:(other.get(k)?.n??0)+1});}
  for(const {text,n} of other.values())flow.text(`${text} (${plural(n,'pattern')})`);
  h2(flow,'Pattern by pattern');
  P.forEach((p,i)=>flow.text(`${pad(i+1)}  ${p.name}: ${WEIGHT_NAMES[p.yarn_weight]} yarn; ${hookOf(p)}`,{style:TYPE.small}));
}

// ---------- abbreviations reference ----------
/** Every abbreviation in the collection; a key with different meanings keeps each, with its patterns. */
export function glossaryOf(bundle){
  const g=new Map();
  const add=(k,m,who)=>{const key=glossaryKey(k), e=g.get(key)??{abbr:k,meanings:new Map()};e.meanings.set(m,[...(e.meanings.get(m)??[]),who]);g.set(key,e);};
  for(const [k,m] of Object.entries(bundle.abbreviations??{}))add(k,m,null);
  for(const p of bundle.patterns)for(const [k,m] of Object.entries(p.abbreviations))add(k,m,p.name);
  return [...g.values()].sort((a,b)=>glossaryKey(a.abbr).localeCompare(glossaryKey(b.abbr)));
}
export function abbreviations(flow,ctx){
  const {bundle}=ctx, col=mm(26);
  flow.newPage('abbreviations');
  title(flow,'Reference','Abbreviations');
  note(flow,`All patterns use ${bundle.terminology} crochet terms.`);
  flow.space(8);
  for(const e of glossaryOf(bundle)){
    const m=[...e.meanings.entries()];
    const value=m.length===1?m[0][0]:m.map(([x,who])=>`${x} (${who.filter(Boolean).join(', ')||'collection'})`).join('; ');
    const made=flow.text(value,{x:flow.left+col,width:flow.width-col});
    flow.marker(made[0],mark(e.abbr,{x:flow.left,w:col-mm(2)},ctx));
    flow.space(2);
  }
  h2(flow,'US and UK stitch names',{keep:TYPE.body.leading*6});
  note(flow,`The same stitch has a different name in US and UK patterns. This collection uses ${bundle.terminology} terms.`);
  flow.space(4);
  const half=flow.width/2;
  for(const [us,uk] of [['US term','UK term'],...US_UK]){
    const bold=us==='US term', made=flow.text(us,{width:half-mm(2),font:bold?'bold':'body'});
    flow.marker(made[0],{...mark(uk,{x:flow.left+half,w:half},ctx),font:bold?'bold':'body',color:COLOURS.ink,width:ctx.width(uk,bold?'bold':'body',TYPE.body.size)});
  }
}

// ---------- one pattern ----------
export function pattern(flow,ctx,p,n){
  const {bundle,slots}=ctx, art=slots.patterns[p.pattern_id], src=field=>({pattern_id:p.pattern_id,field});
  flow.newPage('pattern',{pattern_id:p.pattern_id});
  const artW=art?mm(52):0, colW=flow.width-(art?artW+mm(6):0), top=flow.y;
  if(art)flow.image(art.asset,fitContain(art.px,{x:flow.right-artW,y:top-artW,w:artW,h:artW}),{where:`pattern ${p.pattern_id} artwork`,source:art});
  label(flow,`Pattern ${pad(n)}`);flow.space(2);
  flow.text(p.name,{font:'display',style:TYPE.display,width:colW,src:src('name')});
  flow.space(3);
  flow.text(`${cap(p.category)} · ${LEVEL_NAMES[p.difficulty]}`,{font:'italic',style:TYPE.h3,color:COLOURS.soft,width:colW});
  flow.space(8);
  panel(flow,ctx,[
    ...p.yarn.map((y,i)=>({label:i?'':'Yarn',value:[y.description,y.colour&&!y.description.toLowerCase().includes(y.colour.toLowerCase())?`colour: ${y.colour}`:null,y.amount].filter(Boolean).join(', '),src:{...src(`yarn[${i}].description`),context:'materials'}})),
    {label:'Yarn weight',value:`${WEIGHT_NAMES[p.yarn_weight]} (Craft Yarn Council)`},
    {label:'Hook',value:hookOf(p),src:{...src('hook_size'),context:'materials'}},
    {label:'Also needed',value:p.additional_materials.join(', '),src:{...src('additional_materials'),context:'materials'}},
    {label:'Finished size',value:p.finished_size,src:src('finished_size')},
    {label:'Gauge',value:p.gauge,src:src('gauge')}],{width:colW});
  if(art&&flow.y>top-artW-mm(4))flow.y=top-artW-mm(4);
  // Continuation pages repeat the pattern name.
  flow.cont=f=>{f.text(`${p.name} (continued)`,{font:'italic',style:TYPE.small,color:COLOURS.soft});f.space(4);};
  const meaning=k=>Object.entries(p.abbreviations).find(([a])=>glossaryKey(a)===glossaryKey(k))?.[1]
    ??Object.entries(bundle.abbreviations??{}).find(([a])=>glossaryKey(a)===glossaryKey(k))?.[1];
  h2(flow,'Stitches and abbreviations');
  const extra=Object.keys(p.abbreviations).filter(k=>!p.stitches_used.some(s=>glossaryKey(s)===glossaryKey(k)));
  flow.text([...p.stitches_used,...extra].map(s=>`${s}: ${meaning(s)}`).join('   ·   '),{style:TYPE.small});
  h2(flow,'Instructions');
  p.instructions.forEach((s,i)=>{
    h3(flow,s.heading,{src:src(`instructions[${i}].heading`)});
    s.steps.forEach((st,j)=>{
      flow.instruction(st,{src:field=>src(`instructions[${i}].steps[${j}].${field}`)});
    });
  });
  if(p.assembly?.length){h2(flow,'Assembly');list(flow,ctx,p.assembly,{numbered:true,src:i=>src(`assembly[${i}]`)});}
  h2(flow,'Finishing');list(flow,ctx,p.finishing,{numbered:true,src:i=>src(`finishing[${i}]`)});
  for(const d of slots.diagrams[p.pattern_id]??[]){
    const h=mm(80);
    h2(flow,'Diagram',{keep:h+mm(4)});
    const box=fitContain(d.px,{x:flow.left,y:flow.y-h,w:flow.width,h});
    flow.image(d.asset,box,{where:`pattern ${p.pattern_id} diagram`,source:d});flow.y-=h+mm(3);
    if(d.caption)flow.text(d.caption,{style:TYPE.small,color:COLOURS.soft});
  }
  if(p.notes?.length){h2(flow,'Notes');list(flow,ctx,p.notes,{src:i=>src(`notes[${i}]`)});}
  if(isTested(p)){flow.space(6);flow.text(`Tested by ${p.testing.tested_by} on ${p.testing.tested_on}: ${p.testing.evidence}`,{style:TYPE.small,color:COLOURS.soft});}
  flow.cont=null;
}

// ---------- combination guide (optional) ----------
export function combinations(flow,ctx){
  const {bundle,pageOf}=ctx, c=bundle.combinations, byId=new Map(bundle.patterns.map(p=>[p.pattern_id,p]));
  flow.newPage('combinations');
  title(flow,'Ideas',c.title,{field:'combinations.title'});
  if(c.intro){flow.space(4);flow.text(c.intro,{src:{field:'combinations.intro'}});}
  c.items.forEach((it,i)=>{
    h2(flow,it.name,{src:{field:`combinations.items[${i}].name`}});
    flow.text(it.patterns.map(x=>`${x.quantity} × ${byId.get(x.pattern_id).name}${pageOf?.get(x.pattern_id)?` (page ${pageOf.get(x.pattern_id)})`:''}`).join('   ·   '));
    if(it.notes?.length){flow.space(3);list(flow,ctx,it.notes,{src:j=>({field:`combinations.items[${i}].notes[${j}]`})});}
  });
}

// ---------- back page ----------
export function back(flow,ctx){
  const {bundle,slots}=ctx, art=slots.motif??slots.hero;
  flow.newPage('back',{folio:false});
  const field=flow.H*0.34, size=mm(46);
  flow.rect(0,0,flow.W,field,COLOURS.cream);
  flow.y=flow.H*0.64;
  flow.text('Thank you',{font:'display',style:TYPE.display,align:'center'});
  flow.space(6);
  flow.text(`for choosing ${bundle.title}.`,{font:'italic',style:TYPE.h3,color:COLOURS.soft,align:'center'});
  flow.space(14);
  flow.text('This collection is for your personal use. Please do not share, resell or redistribute the digital files.',
    {style:TYPE.small,color:COLOURS.soft,align:'center',x:flow.left+mm(20),width:flow.width-mm(40)});
  flow.image(art.asset,fitContain(art.px,{x:(flow.W-size)/2,y:field/2-size/2+mm(6),w:size,h:size}),{where:'back page artwork',source:art});
  flow.textAt('LUMIUMX',{y:mm(16),font:'bold',style:TYPE.label,color:COLOURS.rose});
}

// ---------- START-HERE printing & crochet guide ----------
export function guide(flow,ctx){
  const {bundle,files}=ctx;
  flow.newPage('guide');
  title(flow,'LumiumX','Your printing and crochet guide');
  flow.space(4);
  flow.text(bundle.title,{font:'italic',style:TYPE.h3,color:COLOURS.soft});
  h2(flow,`${plural(bundle.patterns.length,'crochet pattern')} included`);
  flow.text(`Written in ${bundle.terminology} crochet terms. This is a digital product: no physical item is shipped.`);
  h2(flow,"What's in your download");
  list(flow,ctx,['A4 and US-Letter folders: the complete collection as one PDF, plus the pattern index, the materials and tools reference and the abbreviations reference.',
    `A4-Individual-Patterns and US-Letter-Individual-Patterns folders: each pattern as its own PDF (${files.individual} per paper size), so you can print only the one you are making.`]);
  h2(flow,'Which file to print');
  flow.text('Print the files that match your paper: A4 or US Letter. Print one pattern at a time from an individual patterns folder, or the whole collection.');
  h2(flow,'Print settings');
  list(flow,ctx,['Open the PDF in a PDF reader and print at 100% / Actual size.','The pages are mostly text on white, so black and white or draft quality works well and saves ink.',
    'Double-sided printing is fine for the complete collection.']);
  h2(flow,'Reading the patterns');
  flow.text('Check the materials and hook size first, then read the abbreviations. Work the instructions in order; stitch counts are given where the pattern states them. Sizes depend on your yarn, hook and tension.');
  h2(flow,'Personal use');
  flow.text('Print as many copies as you need for your own use. Please do not share, resell or redistribute the digital files.');
}
