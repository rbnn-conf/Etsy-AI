// Stage 2 adapter: greeting card.
//
// The customer-facing structure is a list of CARD VARIANTS. Each variant is
// a folded card: a front, an optional inside (right) and inside-left, and a
// back that is either an approved asset or a deterministic minimal back
// (a quiet LUMIUMX wordmark). One approved asset may serve several variants
// (e.g. a shared inside). Variants come from the owner's production plan
// when there is one; otherwise from the specification's page roles (one
// variant per front page).
//
// Artwork is used exactly as approved: panels have the artwork's own aspect
// ratio and every image is placed whole (no crop, no stretch). Derived PDFs
// embed the originals; the originals are also delivered byte-for-byte.
//
// Per variant: A4 and US Letter folded card (2 landscape sheets: outside =
// back | front, inside = inside-left | inside; panels centred so the sheets
// line up double-sided, flip on the short edge) and 4 x 6 in card panels
// (exactly 2:3, the Stage 1 ratio). Plus the original artwork and a guide.
import { readFile } from 'node:fs/promises';
import { sharp, newPdf, savePdf, rgb, StandardFonts, mm, fontkit } from '../lib.mjs';
import { HandoffError } from '../errors.mjs';

export const SHEETS=Object.freeze({'A4':{w:297,h:210},'US-Letter':{w:279.4,h:215.9}});
export const PANEL_4X6={w:101.6,h:152.4};
export const MARGIN_MM=12;          // room for home-printer margins and the trim/fold marks
// Brand canon (design/brand): quiet LUMIUMX wordmark, Spectral, primary ink #1F1F1F (never black).
export const BACK_WORDMARK='LUMIUMX';
const WORDMARK_FONT=new URL('../../../marketing/assets/fonts/Spectral-SemiBold.ttf',import.meta.url);
const INK=rgb(0x1f/255,0x1f/255,0x1f/255);

const roleOf=t=>{t=String(t).toLowerCase();return /front|cover/.test(t)?'front':/inside[-_ ]?left/.test(t)?'inside-left':/inside/.test(t)?'inside':/back/.test(t)?'back':null;};
const slug=t=>String(t).normalize('NFKD').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const LETTERS='ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ---------- manifest: which approved asset plays which role ----------
const PLAN_KEYS=new Set(['id','name','front_source','inside_source','inside_left_source','back_type','back_source']);
function fromPlan(h,plan){
  if(plan.schema_version!==1)throw new HandoffError('production-plan.json: schema_version must be 1.');
  if(!Array.isArray(plan.card_variants)||!plan.card_variants.length)throw new HandoffError('production-plan.json: card_variants must be a non-empty list.');
  const ids=new Set(h.assets.map(a=>a.id)), list=[...ids].join(', ');
  const src=(v,key,required)=>{
    const id=v[key];
    if(id===undefined||id===null){if(required)throw new HandoffError(`production-plan.json variant ${v.id}: ${key} is required.`);return null;}
    if(!ids.has(id))throw new HandoffError(`production-plan.json variant ${v.id}: ${key} "${id}" is not an approved asset (${list}).`);
    return {asset:id};
  };
  return plan.card_variants.map(v=>{
    const extra=Object.keys(v).filter(k=>!PLAN_KEYS.has(k));
    if(extra.length)throw new HandoffError(`production-plan.json variant ${v.id}: unknown field ${extra.join(', ')}.`);
    if(!/^[A-Z]$/.test(v.id??''))throw new HandoffError('production-plan.json: each variant id must be one capital letter.');
    if(typeof v.name!=='string'||!/^[A-Za-z0-9][A-Za-z0-9 '’&-]{0,39}$/.test(v.name))throw new HandoffError(`production-plan.json variant ${v.id}: name must be 1-40 plain characters.`);
    if(!['minimal','approved'].includes(v.back_type))throw new HandoffError(`production-plan.json variant ${v.id}: back_type must be "minimal" or "approved".`);
    return {id:v.id,name:v.name,source:'production-plan',front:src(v,'front_source',true),inside:src(v,'inside_source',false),inside_left:src(v,'inside_left_source',false),
      back:v.back_type==='approved'?{type:'approved',...src(v,'back_source',true)}:{type:'minimal'}};
  });
}
function fromSpecification(h){
  const byRole={};
  for(const pg of h.pages){
    const role=roleOf(pg.page_type);
    if(!role)throw new HandoffError(`Greeting card page ${pg.page_number}: page_type "${pg.page_type}" is not front, inside or back.`);
    (byRole[role]??=[]).push(pg);
  }
  for(const role of ['inside','inside-left','back'])if((byRole[role]?.length??0)>1)
    throw new HandoffError(`Greeting card has ${byRole[role].length} ${role} pages; add a production-plan.json to say which card uses which.`);
  if(!byRole.front)throw new HandoffError('Greeting card has no front page.');
  const one=role=>byRole[role]?{asset:byRole[role][0].asset}:null;
  return byRole.front.map((pg,i)=>({id:LETTERS[i],name:byRole.front.length>1?pg.title:h.product_name,source:'specification',
    front:{asset:pg.asset},inside:one('inside'),inside_left:one('inside-left'),back:one('back')?{type:'approved',...one('back')}:{type:'minimal'}}));
}
/** Adapter manifest merged into the handoff: { card_variants }. */
export function manifest(h,plan){
  const card_variants=plan?fromPlan(h,plan):fromSpecification(h);
  const ids=card_variants.map(v=>v.id), names=card_variants.map(v=>slug(v.name).toLowerCase()), fronts=card_variants.map(v=>v.front.asset);
  if(new Set(ids).size!==ids.length)throw new HandoffError('Card variant ids must be unique.');
  if(new Set(names).size!==names.length)throw new HandoffError('Card variant names must be unique.');
  if(new Set(fronts).size!==fronts.length)throw new HandoffError('Two card variants use the same front.');
  const aspects=new Set(card_variants.flatMap(v=>[v.front,v.inside,v.inside_left,v.back.asset&&v.back]).filter(Boolean)
    .map(x=>h.assets.find(a=>a.id===x.asset)).map(a=>(a.width/a.height).toFixed(4)));
  if(aspects.size>1)throw new HandoffError('Card panels need artwork with one aspect ratio.');
  return {card_variants};
}
/** Things the owner must look at: deterministic, from the specification and the plan. */
export function reviewNotes(h,{card_variants}){
  const notes=[], asset=id=>h.assets.find(a=>a.id===id), pageOf=id=>h.pages.find(p=>p.page_number===asset(id).page_number);
  const used=new Map();
  for(const v of card_variants)for(const [role,x] of [['front',v.front],['inside',v.inside],['inside-left',v.inside_left],['back',v.back.asset?v.back:null]])
    if(x)(used.get(x.asset)??used.set(x.asset,[]).get(x.asset)).push({v,role});
  for(const [id,uses] of used){
    const pg=pageOf(id), specRole=roleOf(pg.page_type), roles=[...new Set(uses.map(u=>u.role))];
    if(roles.some(r=>r!==specRole))notes.push(`Page ${pg.page_number} (${id}) is specified as the ${specRole} but is used as ${uses.map(u=>`the ${u.role} of ${u.v.id} — ${u.v.name}`).join(' and ')} (production plan).`);
    if(roles.includes('back')&&/no (printed )?text|no greeting/i.test(pg.production_notes??''))
      notes.push(`Page ${pg.page_number} (back, ${id}): the specification asks for no printed text. Lettering in the approved image cannot be checked automatically; confirm it before approving.`);
    if(pg.approved_text.length)notes.push(`Page ${pg.page_number} (${roles.join('/')}, ${id}): check the baked-in text reads exactly ${pg.approved_text.map(t=>`"${t}"`).join(', ')}.`);
  }
  if(card_variants.some(v=>v.back.type==='minimal'))notes.push(`Minimal back (${card_variants.filter(v=>v.back.type==='minimal').map(v=>v.id).join(', ')}): a small ${BACK_WORDMARK} wordmark only.`);
  if(card_variants.some(v=>!v.inside))notes.push('A card without an inside page is left blank inside.');
  return notes;
}

// ---------- layout ----------
/** Folded-card panels on a landscape sheet: largest artwork-ratio panel pair inside the margins. */
export function foldedLayout(sheet,aspect){
  const H=Math.min(sheet.h-2*MARGIN_MM,(sheet.w-2*MARGIN_MM)/2/aspect), W=H*aspect;
  const x0=(sheet.w-2*W)/2, y0=(sheet.h-H)/2;
  return {sheet,card:{w:W,h:H},left:{x:x0,y:y0,w:W,h:H},right:{x:x0+W,y:y0,w:W,h:H}};
}
/** Whole-image placement inside a box; never crops or distorts. */
export function contain(box,img){
  const s=Math.min(box.w/img.width,box.h/img.height), w=img.width*s, h=img.height*s;
  return {x:box.x+(box.w-w)/2,y:box.y+(box.h-h)/2,w,h};
}
export const packageName=h=>`LumiumX-${slug(h.product_name)||h.slug}`;
const inches=v=>(v/25.4).toFixed(2);

/**
 * Production plan: each output with its sources and a deterministic build
 * function. `imageEncoding` is 'png' (lossless) or a JPEG quality for the
 * copies embedded in PDFs; originals are always delivered losslessly.
 */
export function plan(h,{imageEncoding='png'}={}){
  const variants=h.card_variants, multi=variants.length>1, name=packageName(h);
  const asset=id=>h.assets.find(a=>a.id===id);
  const front0=asset(variants[0].front.asset), aspect=front0.width/front0.height;
  const date=new Date(h.approved.creative_approved_at??0);
  const layouts=Object.fromEntries(Object.entries(SHEETS).map(([k,s])=>[k,foldedLayout(s,aspect)]));
  const stem=v=>multi?`${name}-${slug(v.name)}`:`${name}-Folded-Card`;
  const sourcesOf=v=>[...new Set([v.front,v.inside,v.inside_left,v.back.asset?v.back:null].filter(Boolean).map(x=>x.asset))];
  const insides=[...new Set(variants.map(v=>v.inside?.asset).filter(Boolean))];

  async function embedder(pdf,artwork){
    const cache=new Map();
    return async id=>{
      if(!cache.has(id)){
        const bytes=artwork.get(id);
        cache.set(id,imageEncoding==='png'?await pdf.embedPng(bytes)
          :await pdf.embedJpg(await sharp(bytes).jpeg({quality:imageEncoding,chromaSubsampling:'4:4:4',mozjpeg:true}).toBuffer()));
      }
      return cache.get(id);
    };
  }
  const place=async(page,box,id,img,placements,where,role)=>{
    const a=asset(id), p=contain(box,a);
    page.drawImage(await img(id),{x:mm(p.x),y:mm(p.y),width:mm(p.w),height:mm(p.h)});
    placements.push({where,role,asset:id,box_mm:[box.w,box.h].map(v=>+v.toFixed(2)),placed_mm:[p.w,p.h].map(v=>+v.toFixed(2)),
      source_px:[a.width,a.height],source_aspect:+(a.width/a.height).toFixed(5),placed_aspect:+(p.w/p.h).toFixed(5),effective_ppi:Math.round(a.width/(p.w/25.4))});
  };
  // Deterministic minimal back: a small letter-spaced wordmark, bottom centre. Nothing else.
  const fonts=new WeakMap();
  async function minimalBack(pdf,page,box,placements,where){
    if(!fonts.has(pdf)){pdf.registerFontkit(fontkit);fonts.set(pdf,await pdf.embedFont(await readFile(WORDMARK_FONT),{subset:true,customName:'LumiumX-Spectral-SemiBold'}));}
    const font=fonts.get(pdf);
    const size=6.5, track=1.6, widths=[...BACK_WORDMARK].map(c=>font.widthOfTextAtSize(c,size));
    const total=widths.reduce((s,w)=>s+w,0)+track*(BACK_WORDMARK.length-1);
    let x=mm(box.x+box.w/2)-total/2;const y=mm(box.y+Math.max(8,box.h*0.075));
    for(const [i,c] of [...BACK_WORDMARK].entries()){page.drawText(c,{x,y,size,font,color:INK,opacity:0.6});x+=widths[i]+track;}
    placements.push({where,role:'back',minimal:BACK_WORDMARK});
  }
  const back=async(pdf,page,box,v,img,placements,where)=>v.back.type==='approved'
    ?place(page,box,v.back.asset,img,placements,where,'back'):minimalBack(pdf,page,box,placements,where);
  const marks=(page,L)=>{
    const ink=rgb(.35,.35,.35), t=0.4, o=2, len=6, x0=L.left.x, x1=L.right.x+L.right.w, y0=L.left.y, y1=L.left.y+L.left.h, xf=L.right.x;
    const line=(a,b,dash)=>page.drawLine({start:{x:mm(a[0]),y:mm(a[1])},end:{x:mm(b[0]),y:mm(b[1])},thickness:t,color:ink,...(dash?{dashArray:[2,2]}:{})});
    for(const [x,sx] of [[x0,-1],[x1,1]])for(const [y,sy] of [[y0,-1],[y1,1]]){line([x+sx*o,y],[x+sx*(o+len),y]);line([x,y+sy*o],[x,y+sy*(o+len)]);}
    line([xf,y1+o],[xf,y1+o+len],true);line([xf,y0-o],[xf,y0-o-len],true);
  };

  async function foldedCard(v,key,artwork){
    const L=layouts[key], pdf=await newPdf({title:`${h.product_name} - ${multi?`${v.id} ${v.name} - `:''}Folded Card - ${key}`,date}), img=await embedder(pdf,artwork), placements=[];
    const size=[mm(L.sheet.w),mm(L.sheet.h)];
    const outside=pdf.addPage(size);
    await back(pdf,outside,L.left,v,img,placements,'sheet 1 left (back)');
    await place(outside,L.right,v.front.asset,img,placements,'sheet 1 right (front)','front');
    marks(outside,L);
    const inside=pdf.addPage(size);
    if(v.inside_left)await place(inside,L.left,v.inside_left.asset,img,placements,'sheet 2 left (inside left)','inside-left');
    if(v.inside)await place(inside,L.right,v.inside.asset,img,placements,'sheet 2 right (inside right)','inside');
    return {bytes:await savePdf(pdf),placements};
  }
  async function panels(v,artwork){
    const pdf=await newPdf({title:`${h.product_name} - ${multi?`${v.id} ${v.name} - `:''}Card Panels 4x6in`,date}), img=await embedder(pdf,artwork), placements=[];
    const box={x:0,y:0,...PANEL_4X6}, page=()=>pdf.addPage([mm(PANEL_4X6.w),mm(PANEL_4X6.h)]);
    await place(page(),box,v.front.asset,img,placements,'panel front','front');
    if(v.inside_left)await place(page(),box,v.inside_left.asset,img,placements,'panel inside left','inside-left');
    if(v.inside)await place(page(),box,v.inside.asset,img,placements,'panel inside','inside');
    const p=page();await back(pdf,p,box,v,img,placements,'panel back');
    return {bytes:await savePdf(pdf),placements};
  }
  // Original artwork: every asset a variant uses, once, named by its role(s).
  const artworkName=id=>{
    const labels=new Set();
    for(const v of variants){
      if(v.front.asset===id)labels.add(multi?`Front-${v.id}-${slug(v.name)}`:'Front');
      if(v.inside?.asset===id)labels.add(insides.length>1?`Inside-${v.id}`:'Inside');
      if(v.inside_left?.asset===id)labels.add(multi?`Inside-Left-${v.id}`:'Inside-Left');
      if(v.back.asset===id)labels.add(multi?`Back-${v.id}`:'Back');
    }
    return `${name}-${[...labels].join('-')}.png`;
  };
  const used=[...new Set(variants.flatMap(sourcesOf))];
  const outputs=[
    {rel:'START-HERE-Printing-Guide.pdf',kind:'guide',variant:'Guide',sources:[],expect:{pages:1,size_mm:[210,297]},
      build:async()=>({bytes:await guide(h,{layouts,variants,name,date}),placements:[]})},
    ...variants.flatMap(v=>Object.keys(SHEETS).map(key=>({rel:`${key}/${stem(v)}-${key}.pdf`,kind:'pdf',variant:key,card_variant:v.id,sources:sourcesOf(v),
      expect:{pages:2,size_mm:[SHEETS[key].w,SHEETS[key].h],orientation:'landscape'},build:a=>foldedCard(v,key,a)}))),
    ...variants.map(v=>{const pages=2+(v.inside?1:0)+(v.inside_left?1:0);
      return {rel:`Card-Panels-4x6in/${multi?stem(v):name}-Card-Panels-4x6in.pdf`,kind:'pdf',variant:'Card-Panels-4x6in',card_variant:v.id,sources:sourcesOf(v),
        // A minimal back page is intentionally almost empty (wordmark only): exempt from the blank-page check, verified by qcChecks instead.
        expect:{pages,size_mm:[PANEL_4X6.w,PANEL_4X6.h],orientation:'portrait',...(v.back.type==='minimal'?{minimal_pages:[pages]}:{})},build:a=>panels(v,a)};}),
    ...used.map(id=>({rel:`Card-Artwork/${artworkName(id)}`,kind:'original',variant:'Card-Artwork',sources:[id],expect:{identical_to:id},
      build:async a=>({bytes:a.get(id),placements:[]})}))
  ];
  // Owner previews: true renders of the A4 PDFs. Each variant's outside, then each distinct inside once.
  const a4=v=>`A4/${stem(v)}-A4.pdf`;
  const previews=[...variants.map(v=>({rel:a4(v),page:1,label:multi?`${v.id} — ${v.name}: outside`:'Outside (print first)'})),
    ...insides.map(id=>{const users=variants.filter(v=>v.inside?.asset===id);
      return {rel:a4(users[0]),page:2,label:multi?(users.length>1?`Inside — shared by ${users.map(u=>u.id).join(' and ')}`:`${users[0].id} — inside`):'Inside (print on the back)'};})];
  return {packageName:name,date,outputs,layouts,previews,variants:['A4','US-Letter','Card-Panels-4x6in','Card-Artwork','Guide'],
    card_variants:variants.map(v=>({id:v.id,name:v.name,front:v.front.asset,inside:v.inside?.asset??null,inside_left:v.inside_left?.asset??null,
      back:v.back.type==='approved'?`approved ${v.back.asset}`:'minimal',stem:stem(v)}))};
}

/** Adapter QC: every variant is complete and uses exactly its assigned assets; minimal backs carry only the wordmark; the guide names the designs. */
export function qcChecks({handoff,record,rendered}){
  const checks=[], add=(name,ok,detail='')=>checks.push({name,ok:!!ok,detail});
  const outputs=Object.entries(record.outputs), variants=handoff.card_variants;
  const missing=[], wrong=[], backs=[];
  for(const v of variants){
    const mine=outputs.filter(([,o])=>o.card_variant===v.id);
    for(const want of ['A4','US-Letter','Card-Panels-4x6in'])if(!mine.some(([,o])=>o.variant===want))missing.push(`${v.id} ${want}`);
    for(const [rel,o] of mine){
      const by=role=>o.placements.filter(p=>p.role===role);
      if(by('front').map(p=>p.asset).join()!==v.front.asset)wrong.push(`${rel}: front`);
      if((by('inside').map(p=>p.asset).join()||null)!==(v.inside?.asset??null))wrong.push(`${rel}: inside`);
      if((by('inside-left').map(p=>p.asset).join()||null)!==(v.inside_left?.asset??null))wrong.push(`${rel}: inside left`);
      const b=by('back');
      if(v.back.type==='approved'?b.map(p=>p.asset).join()!==v.back.asset:!(b.length===1&&b[0].minimal===BACK_WORDMARK))wrong.push(`${rel}: back`);
      if(v.back.type==='minimal'&&o.kind==='pdf'){
        // The only text on a customer's card page is the back wordmark (artwork lettering is pixels, not text).
        const outsidePage=o.variant==='Card-Panels-4x6in'?rendered.get(rel)?.at(-1):rendered.get(rel)?.[0];
        const text=(outsidePage?.text??'').replace(/\s+/g,'');
        if(text!==BACK_WORDMARK)backs.push(`${rel}: "${text}"`);
      }
    }
  }
  add('card variants complete',!missing.length,missing.length?`missing: ${missing.join(', ')}`:variants.map(v=>`${v.id} ${v.name}`).join('; '));
  add('each variant uses its assigned front, inside and back',!wrong.length,wrong.join(', '));
  add('minimal back correct (wordmark only, no URL or promotion)',!backs.length,backs.length?backs.join('; '):`${variants.filter(v=>v.back.type==='minimal').length} minimal back(s)`);
  const shared=[...new Set(variants.map(v=>v.inside?.asset).filter(Boolean))];
  add('inside artwork referenced correctly',variants.every(v=>!v.inside||shared.includes(v.inside.asset)),
    shared.map(id=>`${id} used by ${variants.filter(v=>v.inside?.asset===id).map(v=>v.id).join(', ')}`).join('; '));
  const guide=(rendered.get('START-HERE-Printing-Guide.pdf')??[]).map(p=>p.text).join(' ').replace(/\s+/g,' ');
  const claim=`${variants.length} card design${variants.length>1?'s':''}`;
  const unnamed=variants.filter(v=>!guide.includes(v.name));
  add('printing guide describes the card designs',guide.includes(claim)&&!unnamed.length,unnamed.length?`not named: ${unnamed.map(v=>v.name).join(', ')}`:`"${claim}"`);
  return checks;
}

/** One-page A4 guide. States only what the files contain; no resolution claims. */
async function guide(h,{layouts,variants,name,date}){
  const pdf=await newPdf({title:`LumiumX Printing Guide - ${h.product_name}`,date});
  const page=pdf.addPage([mm(210),mm(297)]);
  const regular=await pdf.embedFont(StandardFonts.Helvetica), bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink=rgb(.13,.15,.2), accent=rgb(.55,.42,.18);
  let y=790;
  const line=(text,size=10,font=regular,gap=15)=>{page.drawText(text,{x:48,y,size,font,color:ink});y-=gap;};
  page.drawRectangle({x:48,y:806,width:499,height:3,color:accent});
  line('LUMIUMX',12,bold,34);line('Your printing guide',24,bold,28);line(h.product_name,13,regular,30);
  const section=(title,lines)=>{line(title,12,bold,19);for(const t of lines)line(t);y-=10;};
  const n=variants.length, multi=n>1, sharedInside=multi&&new Set(variants.map(v=>v.inside?.asset)).size===1&&variants[0].inside;
  const card=k=>`${Math.round(layouts[k].card.w)} x ${Math.round(layouts[k].card.h)} mm (${inches(layouts[k].card.w)} x ${inches(layouts[k].card.h)} in)`;
  section(`${n} card design${multi?'s':''} included`,[
    ...variants.map(v=>`${multi?`${v.id} - `:''}${v.name}`),
    ...(sharedInside?[`${n>2?'All':'Both'} designs share the same inside message.`]:[]),
    'This is a digital product. No physical item is shipped.']);
  section("What's in your download",[
    `- A4 folder: ${multi?'one folded card PDF per design':'the folded card PDF'} for A4 paper.`,
    '  Page 1 is the outside (front and back), page 2 is the inside.',
    `- US-Letter folder: the same for US Letter paper.`,
    `- Card-Panels-4x6in folder: each card panel on its own 4 x 6 in page,`,
    '  for photo printing or a print shop.',
    '- Card-Artwork folder: the original artwork images (PNG).']);
  section('Which file to print',[
    `Print the ${multi?'PDF for the design you want, in':'Folded Card PDF that matches'} your paper size.`,
    `Finished card: A4 version ${card('A4')}; US Letter version ${card('US-Letter')}.`]);
  section('Paper',['Use smooth card stock that your printer supports, for example 200-300 gsm',
    '(about 70-110 lb cover). Matte photo card also works. Test on plain paper first.']);
  section('Print settings',[
    'Open the PDF in a PDF reader. Print at 100% / Actual size, landscape.',
    'Turn off "fit to page", borderless printing and automatic scaling.',
    'Two-sided printer: print both pages double-sided and choose "flip on short edge".',
    'One-sided printer: print page 1, put the printed sheet back in the paper tray,',
    'then print page 2 on the back. Your plain-paper test shows which way round it goes.']);
  section('Trim and fold',[
    'Cut along the corner marks, following the edge of the artwork.',
    'Score lightly, then fold along the dashed centre marks so the front faces out.',
    'The A4 card fits a C5 envelope; the US Letter card fits an A9 (5.75 x 8.75 in) envelope.']);
  section('Colours and personal use',['Colours can vary with your printer, paper and settings.',
    'Print as many copies as you need for your own personal use.',
    'Please do not resell, share or redistribute the digital files.']);
  line('Wishing you a lovely season of cards and greetings.',11,bold);
  return savePdf(pdf);
}

export const greetingCard=Object.freeze({format:'greeting-card',version:2,design:'standard',designName:'Standard',manifest,reviewNotes,plan,qcChecks});
