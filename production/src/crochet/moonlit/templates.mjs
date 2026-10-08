// Moonlit Meadow templates (PROTOTYPE): cover, pattern index, pattern pages,
// materials & tools. Composition only; every style decision is a component or
// a theme token. Crochet text is the approved source, placed verbatim with its
// `src` tag; other sentences are fixed and generic, or computed counts.
import { mm } from '../../lib.mjs';
import { glossaryKey, isTested } from '../bundle.mjs';
import { WEIGHT_NAMES, LEVEL_NAMES, hookOf, glossaryOf, US_UK } from '../templates.mjs';
import { TYPE } from './theme.mjs';
import { MoonlitSection, TitleBlock, ImageFrame, InfoCard, AbbreviationTable, InstructionSection, InstructionRow,
  NumberedList, TipsCard, PatternIndexRow, MaterialsCard, BulletList, Paragraph } from './components.mjs';

/** A slot with an image (approved asset id or file), else null. */
const has=slot=>slot&&(slot.asset||slot.file)?slot:null;

const pad=n=>String(n).padStart(2,'0');
const cap=s=>String(s).charAt(0).toUpperCase()+String(s).slice(1);
const plural=(n,one,many=`${one}s`)=>`${n} ${n===1?one:many}`;
export const metaLine=p=>`${cap(p.category)} • ${LEVEL_NAMES[p.difficulty]}`;

// ---------- cover ----------
/**
 * The bundle title is split, never reworded: when it starts with the theme's
 * brand, that part is the wordmark (letter-spaced capitals) and the rest the
 * subtitle; both lines keep the `title` source tag.
 */
export function coverTitle(title,brand){
  if(String(title).toLowerCase().startsWith(brand.toLowerCase()+' '))
    return {wordmark:title.slice(0,brand.length),subtitle:title.slice(brand.length).trim(),fromTitle:true};
  return {wordmark:brand,subtitle:title,fromTitle:false};
}
export function cover(f,ctx){
  const {bundle,slots,theme}=ctx, W=f.W, H=f.H, inset=mm(9);
  f.newPage('cover',{folio:false});
  // Double hairline frame and botanical corners.
  f.op({t:'rect',x:inset,y:inset,w:W-2*inset,h:H-2*inset,border:'gold',borderWidth:0.7});
  f.op({t:'rect',x:inset+mm(1.6),y:inset+mm(1.6),w:W-2*inset-mm(3.2),h:H-2*inset-mm(3.2),border:'gold',borderWidth:0.3});
  const c=mm(30), ci=inset+mm(3.2);
  f.ornament('corner',{x:ci,y:H-ci,size:c});
  f.ornament('corner',{x:W-ci-c,y:H-ci,size:c,flipX:true});
  f.ornament('corner',{x:ci,y:ci+c,size:c,flipY:true});
  f.ornament('corner',{x:W-ci-c,y:ci+c,size:c,flipX:true,flipY:true});
  // Moon emblem between sprigs.
  const moon=mm(11), sprig=mm(28), my=H-mm(22);
  f.ornament('moon',{x:W/2-moon/2,y:my,size:moon});
  f.ornament('sprig',{x:W/2-moon/2-mm(3)-sprig,y:my-moon/2+mm(2.6),size:sprig,flipX:true});
  f.ornament('sprig',{x:W/2+moon/2+mm(3),y:my-moon/2+mm(2.6),size:sprig});
  // Wordmark + subtitle (the bundle title, split).
  const t=coverTitle(bundle.title,theme.brand), src={field:'title',...(t.fromTitle?{transform:'uppercase'}:{})};
  f.y=H-mm(38);
  f.label(t.wordmark.toUpperCase(),TYPE.coverBrand,{align:'center',color:'ink',src:t.fromTitle?src:null});
  f.space(2);
  f.say(t.subtitle,TYPE.coverSub,{align:'center',color:'taupe',src:{field:'title'}});
  // Divider: hairline · dot · hairline.
  f.space(9);
  const dy=f.y, dw=mm(16);
  f.op({t:'line',x1:W/2-mm(3)-dw,y1:dy,x2:W/2-mm(3),y2:dy,color:'gold',thickness:0.5});
  f.op({t:'line',x1:W/2+mm(3),y1:dy,x2:W/2+mm(3)+dw,y2:dy,color:'gold',thickness:0.5});
  f.ornament('dot',{x:W/2-mm(1),y:dy+mm(1),size:mm(2)});
  // Hero: the supplied bundle image, through an arch window. No text is ever placed on it.
  const heroTop=dy-mm(9), heroBottom=mm(52), heroH=heroTop-heroBottom, heroW=Math.min(mm(150),heroH*0.92);
  ImageFrame(f,slots.bundleHeroImage,{x:(W-heroW)/2,top:heroTop,w:heroW,h:heroH,shape:'arch',caption:false});
  // Facts and maker line.
  f.y=mm(43);
  f.label(theme.coverLine({count:bundle.patterns.length,terms:bundle.terminology}).toUpperCase(),{...TYPE.kicker,size:9,leading:12,tracking:0.8},{align:'center',color:'ink'});
  f.space(2.5);
  f.say(theme.coverNote,TYPE.meta,{align:'center',color:'taupe',style:{...TYPE.meta,size:11,leading:14}});
  f.label(theme.maker,{...TYPE.running,tracking:0.65},{align:'center',color:'gold',y:inset+mm(5.5)});
}

// ---------- pattern index ----------
export function index(f,ctx,{standalone=false}={}){
  const {bundle,pageOf}=ctx;
  f.newPage('index');
  f.y-=mm(4);
  TitleBlock(f,{kicker:'Contents',title:'Pattern Index',
    meta:standalone?'Page numbers refer to the complete collection PDF.':`${plural(bundle.patterns.length,'pattern')}, in the order they appear in this collection.`});
  f.space(12);
  f.cont=g=>{g.say('Pattern Index · continued',TYPE.meta,{color:'taupe'});g.space(8);};
  bundle.patterns.forEach((p,i)=>PatternIndexRow(f,{n:i+1,name:p.name,nameSrc:{pattern_id:p.pattern_id,field:'name',context:'index'},meta:metaLine(p),page:pageOf?.get(p.pattern_id),patternId:p.pattern_id}));
  f.cont=null;
}

// ---------- one pattern ----------
export function pattern(f,ctx,p,n){
  const {bundle,slots}=ctx, src=field=>({pattern_id:p.pattern_id,field}), s=slots.patterns?.[p.pattern_id]??{};
  const first=f.newPage('pattern',{pattern_id:p.pattern_id});
  f.y-=mm(3);
  const top=f.y, heroW=mm(56), heroH=mm(70), hero=has(s.patternHeroImage);
  const colW=f.width-(hero?heroW+mm(8):0);
  const placed=hero?ImageFrame(f,hero,{x:f.right-heroW,top,w:heroW,h:heroH,shape:'arch'}):null;
  TitleBlock(f,{kicker:`Pattern ${pad(n)}`,title:p.name,titleSrc:src('name'),meta:metaLine(p),width:colW});
  if(p.intro)f.say(p.intro,TYPE.body,{width:colW,src:src('intro')});
  f.space(10);
  InfoCard(f,{title:'At a glance',width:colW,rows:[
    ...p.yarn.map((y,i)=>({icon:i?null:'yarn',label:i?'':'Yarn',value:[y.description,y.colour&&!y.description.toLowerCase().includes(y.colour.toLowerCase())?`colour: ${y.colour}`:null,y.amount].filter(Boolean).join(', '),src:{...src(`yarn[${i}].description`),context:'materials'}})),
    {icon:'yarn',label:'Yarn weight',value:`${WEIGHT_NAMES[p.yarn_weight]} (Craft Yarn Council)`},
    {icon:'hook',label:'Hook',value:hookOf(p),src:{...src('hook_size'),context:'materials'}},
    {icon:'scissors',label:'Also needed',value:p.additional_materials.join(', '),src:{...src('additional_materials'),context:'materials'}},
    {icon:'flower',label:'Finished size',value:p.finished_size,src:src('finished_size')},
    {icon:'ruler',label:'Gauge',value:p.gauge,src:src('gauge')}]});
  if(placed&&f.page===first)f.y=Math.min(f.y,placed.bottom-mm(4));   // clear the hero before full-width sections
  // The continuation header names its pattern (a running head, not source content: QC comparisons skip `context`).
  f.cont=g=>{g.say(`${p.name} · continued`,TYPE.meta,{color:'taupe',src:{pattern_id:p.pattern_id,field:'name',context:'continued'}});g.space(6);};
  const meaning=k=>Object.entries(p.abbreviations).find(([a])=>glossaryKey(a)===glossaryKey(k))?.[1]
    ??Object.entries(bundle.abbreviations??{}).find(([a])=>glossaryKey(a)===glossaryKey(k))?.[1];
  const extra=Object.keys(p.abbreviations).filter(k=>!p.stitches_used.some(x=>glossaryKey(x)===glossaryKey(k)));
  MoonlitSection(f,'Stitches and abbreviations');
  AbbreviationTable(f,[...p.stitches_used,...extra].map(abbr=>({abbr,meaning:meaning(abbr)??''})));
  MoonlitSection(f,'Instructions',{keep:mm(30)});
  p.instructions.forEach((sec,i)=>{
    InstructionSection(f,sec.heading,{src:src(`instructions[${i}].heading`)});
    sec.steps.forEach((st,j)=>InstructionRow(f,st,{src:field=>src(`instructions[${i}].steps[${j}].${field}`)}));
  });
  if(p.assembly?.length){MoonlitSection(f,'Assembly');NumberedList(f,p.assembly,{src:i=>src(`assembly[${i}]`)});}
  MoonlitSection(f,'Finishing');NumberedList(f,p.finishing,{src:i=>src(`finishing[${i}]`)});
  // Optional end panels: Finished flower (approved image only) beside Notes & tips (approved notes only).
  // Diagrams: owner-mapped approved artwork with the owner's caption, shown whole (never cropped).
  for(const d of slots.diagrams?.[p.pattern_id]??[]){
    const h=mm(80);MoonlitSection(f,'Diagram',{keep:h+mm(10)});
    const t=f.y, placed=ImageFrame(f,{...d,fit:'contain'},{x:f.left,top:t,w:f.width,h,shape:'rect'});
    f.y=placed?placed.bottom-mm(2):t;
  }
  const fin=has(s.finishedResultImage), finSlot=fin&&{...fin,caption:fin.caption??'Finished flower (illustration)'};
  if(fin){
    const imgW=mm(52), h=mm(64);
    f.space(12);f.ensure(h+mm(12));
    const t=f.y, placed=ImageFrame(f,finSlot,{x:f.left,top:t,w:imgW,h,shape:'rect'});
    f.y=t+12;   // TipsCard opens with 12 pt of space: its top aligns with the image
    if(p.notes?.length)TipsCard(f,p.notes,{src:i=>src(`notes[${i}]`),x:f.left+imgW+mm(7),width:f.width-imgW-mm(7)});
    f.y=Math.min(f.y,placed.bottom-mm(4));
  }else TipsCard(f,p.notes,{src:i=>src(`notes[${i}]`)});
  if(isTested(p)){f.space(8);f.say(`Tested by ${p.testing.tested_by} on ${p.testing.tested_on}: ${p.testing.evidence}`,TYPE.small,{color:'taupe'});}
  f.cont=null;
}
// ---------- materials & tools ----------
/** Every value is computed from the approved patterns; nothing is merged, renamed or invented. */
export function materialsRows(bundle){
  const P=bundle.patterns;
  const weights=Object.keys(WEIGHT_NAMES).map(w=>({text:`${WEIGHT_NAMES[w]}`,count:plural(P.filter(p=>p.yarn_weight===w).length,'pattern')}))
    .filter(r=>!r.count.startsWith('0 '));
  const hooks=new Map();
  for(const p of P){const k=hookOf(p);hooks.set(k,{mm:p.requires_hook===false?Infinity:p.hook_size.mm,names:[...(hooks.get(k)?.names??[]),p.name]});}
  const hookRows=[...hooks.entries()].sort(([,a],[,b])=>a.mm-b.mm).map(([k,{names}])=>({text:k,count:plural(names.length,'pattern'),sub:names.length<=4?names.join(', '):null}));
  const other=new Map();
  for(const p of P)for(const m of p.additional_materials){const k=m.trim().toLowerCase();other.set(k,{text:other.get(k)?.text??m,n:(other.get(k)?.n??0)+1});}
  const otherRows=[...other.values()].map(({text,n})=>({text,count:String(n)}));
  const byPattern=P.map((p,i)=>({text:`${pad(i+1)}  ${p.name}`,sub:`${WEIGHT_NAMES[p.yarn_weight]} yarn; ${hookOf(p)}`}));
  return {weights,hookRows,otherRows,byPattern};
}
export function materials(f,ctx){
  const {bundle,slots}=ctx, R=materialsRows(bundle);
  f.newPage('materials');
  f.y-=mm(4);
  const img=slots.materialsLifestyleImage?.file?slots.materialsLifestyleImage:null, imgW=mm(50), top=f.y;
  const colW=f.width-(img?imgW+mm(8):0);
  const placed=img?ImageFrame(f,img,{x:f.right-imgW,top,w:imgW,h:mm(62),shape:'arch'}):null;
  TitleBlock(f,{kicker:'Reference',title:'Materials & Tools',meta:'Everything the patterns in this collection ask for, in one place.',width:colW});
  f.space(4);
  f.say('Each pattern page lists exactly what that pattern needs.',TYPE.small,{color:'taupe',width:colW});
  if(placed)f.y=Math.min(f.y,placed.bottom-mm(4));
  f.space(12);
  // Yarn weights and hooks side by side, the same height.
  const gap=mm(6), half=(f.width-gap)/2;
  const h=Math.max(MaterialsCard(f,{title:'Yarn weights',icon:'yarn',note:'Craft Yarn Council weights',rows:R.weights,width:half,measure:true}),
    MaterialsCard(f,{title:'Crochet hooks',icon:'hook',rows:R.hookRows,width:half,measure:true}));
  f.ensure(h);
  const t=f.y;
  f.op({t:'rect',x:f.left,y:t-h,w:half,h,color:'cream',radius:mm(2.5)});
  f.op({t:'rect',x:f.left+half+gap,y:t-h,w:half,h,color:'cream',radius:mm(2.5)});
  MaterialsCard(f,{title:'Yarn weights',icon:'yarn',note:'Craft Yarn Council weights',rows:R.weights,width:half,top:t,x:f.left,background:false});
  MaterialsCard(f,{title:'Crochet hooks',icon:'hook',rows:R.hookRows,width:half,top:t,x:f.left+half+gap,background:false});
  f.y=t-h;f.space(mm(6));
  f.cont=g=>{g.say('Materials & Tools · continued',TYPE.meta,{color:'taupe'});g.space(8);};
  MaterialsCard(f,{title:'Other materials',icon:'scissors',note:'As each pattern lists them; the number is how many patterns use it.',rows:R.otherRows,columns:2});
  f.space(mm(6));
  MaterialsCard(f,{title:'Pattern by pattern',icon:'flower',rows:R.byPattern,columns:2});
  f.cont=null;
}

// ---------- welcome / how to use ----------
// The fixed sentences are the classic template's, word for word (generic, true of every bundle).
export function welcome(f,ctx){
  const {bundle,slots}=ctx;
  f.newPage('welcome');
  f.y-=mm(4);
  // The collection overview sits beside the title and introduction, shown whole (no fragments at its edges).
  const ov=has(slots.overviewImage), top=f.y, imgW=mm(76), imgH=mm(78), colW=f.width-(ov?imgW+mm(8):0), first=f.page;
  const placed=ov?ImageFrame(f,ov,{x:f.right-imgW,top,w:imgW,h:imgH,shape:'rect',caption:false}):null;
  TitleBlock(f,{kicker:'Welcome',title:'How to use this collection',width:colW});
  f.space(10);
  f.say(`This collection contains ${plural(bundle.patterns.length,'crochet pattern')}. Each pattern lists its materials, hook size, stitches and abbreviations, then its instructions in order.`,TYPE.body,{width:colW});
  if(placed&&f.page===first)f.y=Math.min(f.y,placed.bottom-mm(2));
  MoonlitSection(f,'Before you start');
  NumberedList(f,['Choose a pattern from the pattern index.','Gather the yarn, hook and other materials listed on its page.',
    'Read the abbreviations. Every abbreviation a pattern uses is explained on its page and in the abbreviations reference.',
    'Work each round or row in the order written. Stitch counts are shown where the pattern gives them.',
    'Finish with the assembly and finishing steps.'],{src:null});
  MoonlitSection(f,'Crochet terms');
  Paragraph(f,`All patterns in this collection use ${bundle.terminology} crochet terms. The abbreviations reference includes a table of US and UK stitch names.`);
  MoonlitSection(f,'Skill levels');
  for(const l of bundle.skill_level){const n=bundle.patterns.filter(p=>p.difficulty===l).length;if(n)Paragraph(f,`${LEVEL_NAMES[l]}: ${plural(n,'pattern')}`);}
  f.space(6);
  Paragraph(f,'Finished sizes depend on your yarn, hook and tension, so they are given as a guide.',{role:TYPE.small,color:'taupe'});
  if(bundle.notes?.length){MoonlitSection(f,'Notes');BulletList(f,bundle.notes,{src:i=>({field:`notes[${i}]`})});}
}

// ---------- abbreviations reference ----------
export function abbreviations(f,ctx){
  const {bundle}=ctx;
  f.newPage('abbreviations');
  f.y-=mm(4);
  TitleBlock(f,{kicker:'Reference',title:'Abbreviations',meta:`All patterns use ${bundle.terminology} crochet terms.`});
  f.space(12);
  f.cont=g=>{g.say('Abbreviations · continued',TYPE.meta,{color:'taupe'});g.space(8);};
  AbbreviationTable(f,glossaryOf(bundle).map(e=>{const m=[...e.meanings.entries()];
    return {abbr:e.abbr,meaning:m.length===1?m[0][0]:m.map(([x,who])=>`${x} (${who.filter(Boolean).join(', ')||'collection'})`).join('; ')};}));
  MoonlitSection(f,'US and UK stitch names',{keep:TYPE.body.leading*7});
  Paragraph(f,`The same stitch has a different name in US and UK patterns. This collection uses ${bundle.terminology} terms.`,{role:TYPE.small,color:'taupe'});
  f.space(6);
  const half=f.width/2;
  for(const [us,uk] of [['US term','UK term'],...US_UK]){
    const head=us==='US term', role=head?TYPE.smallStrong:TYPE.body;
    f.ensure(role.leading+mm(2));
    const t=f.y;f.say(us,role,{width:half-mm(3),color:head?'rose':'ink'});
    f.y=t;f.say(uk,role,{x:f.left+half,width:half-mm(3),color:head?'rose':'ink'});
    f.y-=mm(1.4);f.op({t:'line',x1:f.left,y1:f.y,x2:f.right,y2:f.y,color:'line',thickness:0.5,...(head?{}:{dash:[0.6,1.8]})});f.space(mm(1.4));
  }
  f.cont=null;
}

// ---------- combination guide (optional) ----------
export function combinations(f,ctx){
  const {bundle,pageOf}=ctx, c=bundle.combinations, byId=new Map(bundle.patterns.map(p=>[p.pattern_id,p]));
  f.newPage('combinations');
  f.y-=mm(4);
  TitleBlock(f,{kicker:'Ideas',title:c.title,titleSrc:{field:'combinations.title'}});
  if(c.intro){f.space(8);Paragraph(f,c.intro,{src:{field:'combinations.intro'}});}
  f.cont=g=>{g.say(`${c.title} · continued`,TYPE.meta,{color:'taupe'});g.space(8);};
  c.items.forEach((it,i)=>{
    InstructionSection(f,it.name,{src:{field:`combinations.items[${i}].name`}});
    Paragraph(f,it.patterns.map(x=>`${x.quantity} × ${byId.get(x.pattern_id).name}${pageOf?.get(x.pattern_id)?` (page ${pageOf.get(x.pattern_id)})`:''}`).join('   ·   '));
    if(it.notes?.length){f.space(4);BulletList(f,it.notes,{src:j=>({field:`combinations.items[${i}].notes[${j}]`})});}
  });
  f.cont=null;
}

// ---------- back page ----------
export function back(f,ctx){
  const {bundle,slots,theme}=ctx, W=f.W, H=f.H, inset=mm(9);
  f.newPage('back',{folio:false});
  f.op({t:'rect',x:inset,y:inset,w:W-2*inset,h:H-2*inset,border:'gold',borderWidth:0.7});
  // Moon emblem between sprigs (as on the cover), then the message and the artwork as one centred group.
  const moon=mm(10), sprig=mm(24), my=H*0.76;
  f.ornament('moon',{x:W/2-moon/2,y:my,size:moon});
  f.ornament('sprig',{x:W/2-moon/2-mm(3)-sprig,y:my-moon/2+mm(2.2),size:sprig,flipX:true});
  f.ornament('sprig',{x:W/2+moon/2+mm(3),y:my-moon/2+mm(2.2),size:sprig});
  f.y=my-moon-mm(6);
  f.say('Thank you',TYPE.pageTitle,{align:'center'});
  f.space(4);
  f.say(`for choosing ${bundle.title}.`,TYPE.meta,{align:'center',color:'taupe'});
  f.space(12);
  f.say('This collection is for your personal use. Please do not share, resell or redistribute the digital files.',TYPE.small,{align:'center',color:'taupe',x:f.left+mm(24),width:f.width-mm(48)});
  const art=has(slots.backImage);
  if(art){const w=mm(78), h=Math.min(mm(96),f.y-mm(14)-mm(40));ImageFrame(f,art,{x:(W-w)/2,top:f.y-mm(14),w,h,shape:'arch',caption:false});}
  f.label(theme.maker,{...TYPE.running,tracking:0.65},{align:'center',color:'gold',y:inset+mm(5.5)});
}

// ---------- START-HERE printing & crochet guide ----------
export function guide(f,ctx){
  const {bundle,files}=ctx;
  f.newPage('guide');
  f.y-=mm(4);
  TitleBlock(f,{kicker:'LumiumX',title:'Your printing and crochet guide',meta:bundle.title});
  MoonlitSection(f,`${plural(bundle.patterns.length,'crochet pattern')} included`);
  Paragraph(f,`Written in ${bundle.terminology} crochet terms. This is a digital product: no physical item is shipped.`);
  MoonlitSection(f,"What's in your download");
  BulletList(f,['A4 and US-Letter folders: the complete collection as one PDF, plus the pattern index, the materials and tools reference and the abbreviations reference.',
    `A4-Individual-Patterns and US-Letter-Individual-Patterns folders: each pattern as its own PDF (${files.individual} per paper size), so you can print only the one you are making.`]);
  MoonlitSection(f,'Which file to print');
  Paragraph(f,'Print the files that match your paper: A4 or US Letter. Print one pattern at a time from an individual patterns folder, or the whole collection.');
  MoonlitSection(f,'Print settings');
  BulletList(f,['Open the PDF in a PDF reader and print at 100% / Actual size.','The pages are mostly text on white, so black and white or draft quality works well and saves ink.',
    'Double-sided printing is fine for the complete collection.']);
  MoonlitSection(f,'Reading the patterns');
  Paragraph(f,'Check the materials and hook size first, then read the abbreviations. Work the instructions in order; stitch counts are given where the pattern states them. Sizes depend on your yarn, hook and tension.');
  MoonlitSection(f,'Personal use');
  Paragraph(f,'Print as many copies as you need for your own use. Please do not share, resell or redistribute the digital files.');
}
