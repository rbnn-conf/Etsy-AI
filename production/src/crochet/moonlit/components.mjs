// Moonlit Meadow components (PROTOTYPE). Each component lays out one design
// element into a MoonlitFlow, which extends the existing safe pagination
// engine (Flow): text is wrapped at word boundaries only, never shortened,
// and every approved field keeps its `src` tag so the existing text QC can
// prove source -> layout -> PDF. Styling comes only from theme.mjs.
import { mm } from '../../lib.mjs';
import { Flow, wrap, fitContain } from '../layout.mjs';
import { coverPlacement } from './draw.mjs';
import { widthOf } from '../design.mjs';
import { COLOURS, TYPE, GEOMETRY, PAGE_TINT } from './theme.mjs';
import { ORNAMENTS } from './ornaments.mjs';

const G=GEOMETRY;
/** Width of a (possibly letter-spaced) line, as drawn. */
export const textWidth=(fonts,text,role)=>widthOf(fonts[role.font],text,role.size)+(role.tracking??0)*[...text].length;

// ---------- MoonlitPage ----------
/** The pagination engine with Moonlit margins and page furniture on every page it opens. */
export class MoonlitFlow extends Flow{
  constructor({paper,fonts,running=null,theme}){
    super({paper,fonts,running});
    this.theme=theme;
    this.left=mm(G.margin.side);this.right=this.W-mm(G.margin.side);this.top=this.H-mm(G.margin.top);this.bottom=mm(G.margin.bottom);
    this.width=this.right-this.left;
  }
  newPage(kind,meta={}){
    const page=super.newPage(kind,meta);
    const tint=PAGE_TINT[kind];
    if(tint)this.op({t:'rect',x:0,y:0,w:this.W,h:this.H,color:tint});
    if(kind!=='cover'&&kind!=='back')MoonlitHeader(this,{brand:!meta.continued});   // framed pages carry their own emblem
    return page;
  }
  /** Text in a type role from theme.TYPE. */
  say(str,role,opts={}){return this.text(str,{font:role.font,style:role,...opts});}
  /** A single letter-spaced line (kickers, card titles). Never wraps: a label wider than its box is a layout error. */
  label(str,role,{x=this.left,width=this.width,align='left',color='rose',y=null,chrome=false,src=null}={}){
    const w=textWidth(this.fonts,str,role);
    if(w>width+0.5)throw new Error(`label "${str}" is wider than its column`);
    if(y===null){this.ensure(role.leading);this.y-=role.leading;}
    const by=y??this.y+(role.leading-role.size)*0.35;
    const lx=align==='center'?x+(width-w)/2:align==='right'?x+width-w:x;
    return this.op({t:'text',x:lx,y:by,text:str,font:role.font,size:role.size,tracking:role.tracking??0,color,width:w,maxWidth:width,box:{x,w:width},src,line:0,...(chrome?{chrome:true}:{})});
  }
  ornament(name,{x,y,size,flipX=false,flipY=false}){
    if(!ORNAMENTS[name])return null;
    return this.op({t:'ornament',name,x,y,size,flipX,flipY,h:size*ORNAMENTS[name].box[1]/ORNAMENTS[name].box[0]});
  }
}

// ---------- MoonlitHeader / MoonlitFooter ----------
/** Page-top emblem: crescent moon between two sprigs, with the brand line on opening pages. */
export function MoonlitHeader(f,{brand=true}={}){
  const cx=f.W/2, top=f.H-mm(G.headerY)+mm(4.2), moon=mm(5), sprig=mm(17);
  f.ornament('moon',{x:cx-moon/2,y:top,size:moon});
  f.ornament('sprig',{x:cx-moon/2-mm(2.5)-sprig,y:top-mm(0.6),size:sprig,flipX:true});
  f.ornament('sprig',{x:cx+moon/2+mm(2.5),y:top-mm(0.6),size:sprig});
  if(brand)f.label(f.theme.brand.toUpperCase(),{...TYPE.running,tracking:0.7},{align:'center',color:'taupe',y:f.H-mm(G.headerY)-mm(5.2),chrome:true});
}
/** Running footer on every folio page: gold rule broken by a small moon, running title left, folio right. */
export function MoonlitFooter(f,{start=1}={}){
  f.pages.forEach((p,i)=>{
    if(!p.folio)return;
    const y=mm(G.footerY), ry=y+mm(4.4), cx=f.W/2, gap=mm(3.2);
    p.ops.push({t:'line',x1:f.left,y1:ry,x2:cx-gap,y2:ry,color:'gold',thickness:0.4},{t:'line',x1:cx+gap,y1:ry,x2:f.right,y2:ry,color:'gold',thickness:0.4});
    const m=mm(2.6);p.ops.push({t:'ornament',name:'moon',x:cx-m/2,y:ry+m/2,size:m,h:m});
    const run=String(f.running?.left??'').toUpperCase(), r=TYPE.running;
    if(run){const w=textWidth(f.fonts,run,r);p.ops.push({t:'text',x:f.left,y,text:run,font:r.font,size:r.size,tracking:r.tracking,color:'taupe',width:w,maxWidth:f.width*0.75,box:{x:f.left,w:f.width*0.75},src:null,chrome:true});}
    const n=String(i+start), fo=TYPE.folio, w=textWidth(f.fonts,n,fo);
    p.ops.push({t:'text',x:f.right-w,y,text:n,font:fo.font,size:fo.size,color:'ink',width:w,maxWidth:f.width,box:{x:f.left,w:f.width},src:null,chrome:true});
  });
}

// ---------- titles and sections ----------
/** Kicker, display title and italic subtitle at the top of a page or pattern. */
export function TitleBlock(f,{kicker,title,titleSrc=null,meta=null,width=f.width,align='left'}){
  if(kicker)f.label(kicker.toUpperCase(),TYPE.kicker,{width,align});
  f.space(3);
  f.say(title,TYPE.patternName,{width,src:titleSrc,align});
  if(meta){f.space(1);f.say(meta,TYPE.meta,{width,color:'taupe',align});}
}
/** Section label with a hairline running to the margin; kept with `keep` pt of what follows. */
export function MoonlitSection(f,title,{keep=60}={}){
  f.space(14);
  f.ensure(TYPE.kicker.leading+keep);
  const op=f.label(title.toUpperCase(),TYPE.kicker);
  const ly=op.y+TYPE.kicker.size*0.32;
  f.op({t:'line',x1:op.x+op.width+mm(3),y1:ly,x2:f.right,y2:ly,color:'line',thickness:0.6});
  f.space(6);
}

// ---------- ImageFrame ----------
/**
 * An optional image slot: {asset? (approved asset id), file?, px:[w,h], crop?, fit?, caption?}.
 * fit 'cover' (default) fills the frame around the crop's centre and is clipped
 * to the frame (arch or rounded rectangle); fit 'contain' shows the whole image
 * (diagrams). The image keeps its aspect ratio; the file is never altered.
 * The op's x/y/w/h are the VISIBLE frame; `drawn` is the full placed image.
 * Returns null, drawing nothing, when the slot is empty: callers use the space.
 */
export function ImageFrame(f,slot,{x,top,w,h,shape='arch',caption=true}){
  if(!slot?.file&&!slot?.asset)return null;
  const frame={x,y:top-h,w,h};
  const drawn=slot.fit==='contain'?fitContain(slot.px,frame):coverPlacement(slot.px,frame,slot.crop);
  f.op({t:'image',asset:slot.asset??null,file:slot.file??null,px:slot.px,crop:slot.crop??null,...frame,frame,drawn,clipped:slot.fit!=='contain',
    shape,radius:mm(G.cardRadius),outline:'gold',where:slot.where??'image slot',source:slot});
  let bottom=frame.y;
  if(caption&&slot.caption){
    const r=TYPE.small, lines=wrap(slot.caption,f.fonts.italic,r.size,w);
    lines.forEach((l,i)=>{const lw=widthOf(f.fonts.italic,l,r.size);
      f.op({t:'text',x:x+(w-lw)/2,y:frame.y-mm(4)-i*r.leading,text:l,font:'italic',size:r.size,color:'taupe',width:lw,maxWidth:w,box:{x,w},src:null,line:i});});
    bottom=frame.y-mm(4)-lines.length*r.leading;
  }
  return {frame,bottom};
}

// ---------- InfoCard (AT A GLANCE) ----------
/**
 * A card of icon + label + value rows. Values are verbatim (with their `src`);
 * the card is drawn only when it fits one page, otherwise rows flow without it.
 */
export function InfoCard(f,{title,rows,x=f.left,width=f.width,labelW=mm(30)}){
  const pad=mm(G.cardPad), icon=mm(3.6), valueW=width-2*pad-labelW, gap=5, body=TYPE.body;
  const titleH=TYPE.cardTitle.leading+mm(3.5);
  const h=pad+titleH+rows.reduce((s,r)=>s+wrap(r.value,f.fonts[body.font],body.size,valueW).length*body.leading+gap,0)-gap+pad;
  const whole=f.ensure(h);
  const top=f.y;
  if(whole)f.op({t:'rect',x,y:top-h,w:width,h,color:'cream',radius:mm(G.cardRadius)});
  f.y=top-pad;
  const t=f.label(title.toUpperCase(),TYPE.cardTitle,{x:x+pad,width:width-2*pad});
  f.op({t:'line',x1:x+pad,y1:t.y-mm(2.2),x2:x+width-pad,y2:t.y-mm(2.2),color:'line',thickness:0.5});
  f.y-=mm(3.5);
  rows.forEach((r,i)=>{
    const made=f.say(r.value,body,{x:x+pad+labelW,width:valueW,src:r.src??null});
    const first=made[0], pg=f.pages.find(p=>p.ops.includes(first));
    if(r.icon&&ORNAMENTS[r.icon])pg.ops.push({t:'ornament',name:r.icon,x:x+pad,y:first.y+icon*0.78,size:icon,h:icon});
    if(r.label){const role=TYPE.cardTitle, lw=textWidth(f.fonts,r.label.toUpperCase(),role), lx=x+pad+icon+mm(2.2);
      pg.ops.push({t:'text',x:lx,y:first.y,text:r.label.toUpperCase(),font:role.font,size:role.size,tracking:role.tracking,color:'taupe',width:lw,maxWidth:labelW-icon-mm(3),box:{x:lx,w:labelW-icon-mm(3)},src:null,line:0});}
    if(i<rows.length-1)f.space(gap);
  });
  f.y=Math.min(f.y,top-h);f.space(0);
  return {top,bottom:top-h};
}

// ---------- AbbreviationTable ----------
/** Abbreviations exactly as the source gives them, two columns (row-major) when the page is wide enough. */
export function AbbreviationTable(f,entries,{columns=2}={}){
  const r=TYPE.small, strong=TYPE.smallStrong, colGap=mm(8);
  const cols=f.width>=mm(150)?columns:1, colW=(f.width-colGap*(cols-1))/cols;
  const abbrW=Math.min(Math.max(...entries.map(e=>widthOf(f.fonts.bold,e.abbr,strong.size)))+mm(3),colW*0.4);
  for(let i=0;i<entries.length;i+=cols){
    const row=entries.slice(i,i+cols);
    const h=Math.max(...row.map(e=>Math.max(wrap(e.abbr,f.fonts.bold,strong.size,abbrW-mm(2)).length,wrap(e.meaning,f.fonts.body,r.size,colW-abbrW).length)))*r.leading;
    f.ensure(h+mm(2.2));
    const top=f.y;
    row.forEach((e,c)=>{
      const x=f.left+c*(colW+colGap);
      f.y=top;f.say(e.abbr,strong,{x,width:abbrW-mm(2),color:'ink'});   // ink, not rose: the accent stays scarce
      f.y=top;f.say(e.meaning,r,{x:x+abbrW,width:colW-abbrW,color:'ink'});
    });
    f.y=top-h-mm(1.1);
    for(let c=0;c<row.length;c++){const x=f.left+c*(colW+colGap);f.op({t:'line',x1:x,y1:f.y,x2:x+colW,y2:f.y,color:'line',thickness:0.5,dash:[0.6,1.8]});}
    f.space(mm(1.1));
  }
}

// ---------- InstructionSection / InstructionRow ----------
/** A soft blush bar carrying the section heading (verbatim source), kept with its first row. */
export function InstructionSection(f,heading,{src,keep=TYPE.body.leading*2}){
  const role=TYPE.section, padX=mm(10.5), lines=wrap(heading,f.fonts[role.font],role.size,f.width-padX-mm(4));
  const barH=Math.max(mm(G.sectionBar),lines.length*role.leading+mm(2.6));
  f.space(10);
  f.ensure(barH+mm(3)+keep);
  const top=f.y;
  f.op({t:'rect',x:f.left,y:top-barH,w:f.width,h:barH,color:'blush',radius:mm(1.6)});
  // A leaf sprig, never a star: in crochet * marks a repeat.
  f.ornament('leaf',{x:f.left+mm(2.4),y:top-barH/2+mm(1.1),size:mm(5.6)});
  f.y=top-(barH-lines.length*role.leading)/2-0.8;
  f.say(heading,role,{x:f.left+padX,width:f.width-padX-mm(4),src});
  f.y=top-barH-mm(3);
}

/**
 * One step: the label (Rnd/Row/…) in a badge, the approved step text beside
 * it, the stitch count under it. Label and text share row heights; a step
 * moves whole to the next page when it fits there; an oversized step continues
 * at complete line boundaries. Same guarantees as Flow.instruction.
 */
export function InstructionRow(f,step,{src}){
  const body=TYPE.body, badge=TYPE.badge, labelW=mm(G.labelCol), gap=mm(G.labelGap), padX=mm(1.8);
  const indent=labelW+gap, width=Math.min(f.width-indent,mm(G.measure));
  const lines=wrap(step.text,f.fonts[body.font],body.size,width);
  const labels=step.label?wrap(step.label,f.fonts[badge.font],badge.size,labelW-2*padX):[];
  const rows=Math.max(lines.length,labels.length);
  const count=step.stitch_count!=null&&step.stitch_count!==''?`Stitch count: ${step.stitch_count}`:null;
  f.ensure(rows*body.leading+(count?TYPE.small.leading+2:0));
  const placed=[];
  for(let i=0;i<rows;i++){
    f.ensure(body.leading);
    const y=f.y;
    // The label sits on the same baseline as the instruction line of its row.
    if(i<labels.length){const op=f.say(labels[i],badge,{x:f.left+padX,width:labelW-2*padX,color:'rose',src:src?.('label')})[0];op.line=i;op.y=y-body.leading+(body.leading-body.size)*0.35;placed.push(op);}
    f.y=y;
    if(i<lines.length){const op=f.say(lines[i],body,{x:f.left+indent,width,src:src?.('text')})[0];op.line=i;}
    f.y=y-body.leading;
  }
  // Badge behind the label lines on each page they landed on.
  for(const pg of f.pages){
    const mine=placed.filter(o=>pg.ops.includes(o));
    if(!mine.length)continue;
    const w=Math.max(...mine.map(o=>o.width))+2*padX, topY=mine[0].y+badge.size*0.86, botY=mine.at(-1).y-badge.size*0.34;
    const rect={t:'rect',x:f.left,y:botY,w,h:topY-botY,color:'blush',border:'blushDeep',borderWidth:0.5,radius:mine.length===1?(topY-botY)/2:mm(2)};
    pg.ops.splice(pg.ops.indexOf(mine[0]),0,rect);
  }
  if(count){f.space(1);f.say(count,TYPE.small,{x:f.left+indent,width,color:'taupe'});}
  f.space(7);
}

// ---------- numbered lists (assembly, finishing) ----------
export function NumberedList(f,items,{src}){
  const ind=mm(9), r=TYPE.body, n=TYPE.numeral, width=Math.min(f.width-ind,mm(G.measure));
  items.forEach((t,i)=>{
    f.ensure(wrap(t,f.fonts[r.font],r.size,width).length*r.leading);   // an item stays whole where it fits
    const made=f.say(t,r,{x:f.left+ind,width,src:src?src(i):null});
    const first=made[0], pg=f.pages.find(p=>p.ops.includes(first)), s=String(i+1), w=textWidth(f.fonts,s,n);
    pg.ops.push({t:'text',x:f.left+mm(1),y:first.y,text:s,font:n.font,size:n.size,color:'rose',width:w,maxWidth:ind-mm(2),box:{x:f.left,w:ind-mm(1)},src:null,line:0});
    f.space(5);
  });
}

// ---------- TipsCard ----------
/** Notes from the approved source only, in a card; omitted when there are none. Never invents advice. */
export function TipsCard(f,notes,{src,title='Notes & tips',x=f.left,width=f.width}){
  if(!notes?.length)return null;
  const pad=mm(G.cardPad), ind=mm(5), r=TYPE.body, textW=Math.min(width-2*pad-ind,mm(G.measure)), gap=4;
  const h=pad+TYPE.cardTitle.leading+mm(3.5)+notes.reduce((s,t)=>s+wrap(t,f.fonts[r.font],r.size,textW).length*r.leading+gap,0)-gap+pad;
  f.space(12);
  const whole=f.ensure(h);
  const top=f.y;
  if(whole)f.op({t:'rect',x,y:top-h,w:width,h,color:'ivory',border:'line',borderWidth:0.6,radius:mm(G.cardRadius)});
  f.y=top-pad;
  const t=f.label(title.toUpperCase(),TYPE.cardTitle,{x:x+pad+mm(8.5),width:width-2*pad-mm(8.5)});
  f.ornament('leaf',{x:x+pad,y:t.y+mm(2.3),size:mm(6.5)});
  f.y-=mm(3.5);
  notes.forEach((n,i)=>{
    const made=f.say(n,r,{x:x+pad+ind,width:textW,src:src(i)}), first=made[0];
    f.pages.find(p=>p.ops.includes(first)).ops.push({t:'circle',x:x+pad+mm(1.4),y:first.y+r.size*0.32,r:mm(0.7),color:'gold'});
    if(i<notes.length-1)f.space(gap);
  });
  f.y=Math.min(f.y,top-h);
  return {top,bottom:top-h};
}

// ---------- PatternIndexRow ----------
/** Numbered badge, name, type • difficulty, dotted leader, page number. One fixed-height row. */
export function PatternIndexRow(f,{n,name,nameSrc,meta,page,patternId=null}){
  const rowH=mm(12.2), badge=mm(7.8), pageW=mm(12), nameR=TYPE.section, metaR=TYPE.small;
  f.ensure(rowH);
  const top=f.y, cy=top-rowH/2, tx=f.left+badge+mm(5), tw=f.width-badge-mm(5)-pageW-mm(4);
  f.op({t:'circle',x:f.left+badge/2,y:cy,r:badge/2,color:'white',border:'blushDeep',borderWidth:0.7});
  const num=String(n).padStart(2,'0'), nr=TYPE.numeral, nw=textWidth(f.fonts,num,nr);
  f.op({t:'text',x:f.left+badge/2-nw/2,y:cy-nr.size*0.33,text:num,font:nr.font,size:nr.size,color:'rose',width:nw,maxWidth:badge,box:{x:f.left,w:badge},src:null,line:0});
  f.y=cy+(nameR.leading+metaR.leading)/2+mm(0.4);
  const made=f.say(name,nameR,{x:tx,width:tw,src:nameSrc});
  f.say(meta,metaR,{x:tx,width:tw,color:'taupe'});
  const last=made.at(-1), nameEnd=last.x+last.width+mm(2.5), s=String(page??''), pr=TYPE.numeral, pw=textWidth(f.fonts,s,pr);
  if(s&&f.right-pw-mm(2.5)>nameEnd+mm(4))f.op({t:'line',x1:nameEnd,y1:last.y+1.2,x2:f.right-pw-mm(2.5),y2:last.y+1.2,color:'taupe',thickness:0.6,dash:[0.5,2.6]});
  if(s)f.op({t:'text',x:f.right-pw,y:last.y,text:s,font:pr.font,size:pr.size,color:'ink',width:pw,maxWidth:pageW,box:{x:f.right-pageW,w:pageW},src:null,line:0,...(patternId?{index_page_of:patternId}:{})});
  f.y=top-rowH;
  f.op({t:'line',x1:tx,y1:f.y,x2:f.right,y2:f.y,color:'line',thickness:0.4});
}

// ---------- MaterialsCard ----------
/**
 * A titled card with an icon, an optional note and rows of {text, count?, sub?},
 * in one or two columns. Values are computed from the approved patterns by the
 * caller. A card that does not fit the space left continues on the next page
 * at a row boundary ("· continued"), so no page is left half empty.
 * `measure`: return the height only. `top`: draw at a fixed top (side by side; caller ensured the room).
 */
export function MaterialsCard(f,opts){
  const {rows,top=null,measure=false}=opts, height=list=>cardHeight(f,opts,list);
  if(measure)return height(rows);
  if(top!==null)return drawCard(f,opts,rows,top);
  let rest=rows, out=null, cont=false;
  while(rest.length){
    let n=rest.length;
    while(n>0&&height(rest.slice(0,n))>f.room)n--;
    if(n<Math.min(3,rest.length)){f.ensure(Math.min(height(rest),f.top-f.bottom));n=rest.length;while(n>1&&height(rest.slice(0,n))>f.room)n--;}
    out=drawCard(f,{...opts,title:cont?`${opts.title} · continued`:opts.title,note:cont?null:opts.note},rest.slice(0,n),f.y);
    rest=rest.slice(n);cont=true;
    if(rest.length)f.space(mm(6));
  }
  return out;
}
const cardGeom=(f,{width=f.width,columns=1})=>{const pad=mm(G.cardPad), colGap=mm(7);return {pad,colGap,colW:(width-2*pad-colGap*(columns-1))/columns};};
function rowHeight(f,row,colW){
  const r=TYPE.body, sub=TYPE.small, cw=row.count?textWidth(f.fonts,row.count,TYPE.small)+mm(3):0;
  return wrap(row.text,f.fonts[r.font],r.size,colW-cw).length*r.leading+(row.sub?wrap(row.sub,f.fonts[sub.font],sub.size,colW).length*sub.leading:0)+3;
}
const columnsOf=(rows,columns)=>{const per=Math.ceil(rows.length/columns);return [...Array(columns)].map((_,c)=>rows.slice(c*per,(c+1)*per));};
function cardHeight(f,opts,rows){
  const {pad,colW}=cardGeom(f,opts), {columns=1,width=f.width,note=null}=opts;
  const noteH=note?wrap(note,f.fonts.italic,TYPE.small.size,width-2*pad).length*TYPE.small.leading+mm(1.5):0;
  return pad+TYPE.cardTitle.leading+mm(4)+noteH+Math.max(...columnsOf(rows,columns).map(c=>c.reduce((s,row)=>s+rowHeight(f,row,colW),0)))+pad-3;
}
function drawCard(f,opts,rows,t0){
  const {title,icon,note=null,x=f.left,width=f.width,columns=1,background=true}=opts, {pad,colGap,colW}=cardGeom(f,opts), h=cardHeight(f,opts,rows), cnt=TYPE.small;
  if(background)f.op({t:'rect',x,y:t0-h,w:width,h,color:'cream',radius:mm(G.cardRadius)});
  f.y=t0-pad;
  const iconS=mm(4.4);
  const t=f.label(title.toUpperCase(),TYPE.cardTitle,{x:x+pad+iconS+mm(2.4),width:width-2*pad-iconS-mm(2.4)});
  f.ornament(icon,{x:x+pad,y:t.y+iconS*0.82,size:iconS});
  f.op({t:'line',x1:x+pad,y1:t.y-mm(2.4),x2:x+width-pad,y2:t.y-mm(2.4),color:'line',thickness:0.5});
  f.y-=mm(4)-mm(0.5);
  if(note){f.say(note,{...TYPE.small,font:'italic'},{x:x+pad,width:width-2*pad,color:'taupe'});f.space(mm(1.5));}
  const start=f.y;
  columnsOf(rows,columns).forEach((list,c)=>{
    f.y=start;const cx=x+pad+c*(colW+colGap);
    for(const row of list){
      const cw=row.count?textWidth(f.fonts,row.count,cnt)+mm(3):0;
      const made=f.say(row.text,TYPE.body,{x:cx,width:colW-cw});
      if(row.count){const last=made.at(-1), w=textWidth(f.fonts,row.count,cnt);
        f.op({t:'text',x:cx+colW-w,y:last.y,text:row.count,font:cnt.font,size:cnt.size,color:'taupe',width:w,maxWidth:cw,box:{x:cx+colW-cw,w:cw},src:null,line:0});}
      if(row.sub)f.say(row.sub,TYPE.small,{x:cx,width:colW,color:'taupe'});
      f.space(3);
    }
  });
  f.y=t0-h;
  return {top:t0,bottom:t0-h};
}

// ---------- BulletList ----------
/** Bulleted lines (gold dots), verbatim source when `src` is given; each item kept whole where it fits. */
export function BulletList(f,items,{src=null}={}){
  const ind=mm(6), r=TYPE.body, width=Math.min(f.width-ind,mm(G.measure));
  items.forEach((t,i)=>{
    f.ensure(wrap(t,f.fonts[r.font],r.size,width).length*r.leading);
    const first=f.say(t,r,{x:f.left+ind,width,src:src?src(i):null})[0];
    f.pages.find(p=>p.ops.includes(first)).ops.push({t:'circle',x:f.left+mm(1.6),y:first.y+r.size*0.32,r:mm(0.7),color:'gold'});
    f.space(4);
  });
}
/** A plain reading paragraph at the reading measure. */
export const Paragraph=(f,text,{src=null,role=TYPE.body,color='ink'}={})=>f.say(text,role,{width:Math.min(f.width,mm(G.measure)),src,color});
