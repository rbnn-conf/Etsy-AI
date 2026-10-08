// Deterministic text layout for crochet pattern documents (ADR-041).
//
// A Flow lays text top to bottom, wraps at word boundaries only, and starts a
// new page when the next line would cross the bottom margin. Every drawing is
// recorded as an operation, so QC can check what was placed (every source
// text exactly once, nothing outside the page, nothing wider than its column)
// before and after rendering. Text is never shortened, hyphenated, replaced
// or scaled down to fit: a word wider than its column is a layout error.
import { HandoffError } from '../errors.mjs';
import { mm } from '../lib.mjs';
import { COLOURS, TYPE, GEOMETRY, widthOf } from './design.mjs';

export class LayoutError extends HandoffError{constructor(m){super(m);this.name='LayoutError';}}

/** Words to lines within `width` pt. Hard line breaks in the source are kept. */
export function wrap(text,font,size,width,where='text'){
  const out=[];
  for(const para of String(text).split('\n')){
    const words=para.split(/\s+/).filter(Boolean);
    if(!words.length){out.push('');continue;}
    let line='';
    for(const w of words){
      if(widthOf(font,w,size)>width)throw new LayoutError(`${where}: "${w.slice(0,40)}" is wider than its column (${(width/mm(1)).toFixed(0)} mm) at ${size} pt; the text is never shortened to fit.`);
      const next=line?`${line} ${w}`:w;
      if(widthOf(font,next,size)<=width)line=next;else{out.push(line);line=w;}
    }
    out.push(line);
  }
  return out;
}

export class Flow{
  /**
   * @param paper {w,h} mm; fonts from loadFonts(); running {left, right} footer text
   */
  constructor({paper,fonts,running=null}){
    Object.assign(this,{paper,fonts,running});
    this.W=mm(paper.w);this.H=mm(paper.h);
    const g=GEOMETRY.margin;
    this.left=mm(g.side);this.right=this.W-mm(g.side);this.top=this.H-mm(g.top);this.bottom=mm(g.bottom);
    this.width=this.right-this.left;
    this.pages=[];this.page=null;this.y=0;
    // Continuation header for the current template (e.g. "Rose (continued)"), set by the template.
    this.cont=null;
  }
  /** Start a page. `kind` names the template (cover, index, pattern, …); `meta` is recorded for QC. */
  newPage(kind,meta={}){
    this.page={kind,meta,ops:[],folio:meta.folio!==false};
    this.pages.push(this.page);this.y=this.top;
    return this.page;
  }
  get room(){return this.y-this.bottom;}
  /** Continue on a new page of the same kind when `h` pt do not fit. */
  ensure(h){
    if(h>this.top-this.bottom)return false;   // taller than a page: caller splits
    if(this.room<h){
      const {kind,meta}=this.page, header=this.cont;
      this.newPage(kind,{...meta,continued:true});
      if(header){this.cont=null;header(this);this.cont=header;}
    }
    return true;
  }
  op(o){this.page.ops.push(o);return o;}
  /** Place a marker (list number, step label) on the first line of a block, on the page where that line landed. */
  marker(first,o){this.pages.find(p=>p.ops.includes(first)).ops.push({...o,y:first.y});}
  space(h){this.y-=h;if(this.y<this.bottom)this.y=this.bottom;}
  rule({color=COLOURS.line,thickness=0.6,x=this.left,w=this.width,gap=6}={}){
    this.ensure(gap*2);
    this.y-=gap;this.op({t:'line',x1:x,y1:this.y,x2:x+w,y2:this.y,color,thickness});this.y-=gap;
  }
  /**
   * Wrapped text. `src` ties the lines to a source field ({pattern_id, field})
   * so QC can prove the source text was placed whole and unchanged.
   * `keep`: pt of following content that must stay on the same page (headings).
   */
  text(str,{font='body',style=TYPE.body,color=COLOURS.ink,x=this.left,width=this.width,src=null,keep=0,align='left',where}={}){
    const f=this.fonts[font], lines=wrap(str,f,style.size,width,where??(src?`${src.pattern_id??'document'} ${src.field}`:'text'));
    if(keep)this.ensure(style.leading*Math.min(lines.length,2)+keep);
    const made=[];
    for(const [i,line] of lines.entries()){
      this.ensure(style.leading);
      this.y-=style.leading;
      const w=widthOf(f,line,style.size);
      const lx=align==='center'?x+(width-w)/2:align==='right'?x+width-w:x;
      made.push(this.op({t:'text',x:lx,y:this.y+(style.leading-style.size)*0.35,text:line,font,size:style.size,color,width:w,maxWidth:width,box:{x,w:width},src,line:i}));
    }
    return made;
  }
  /** One line at a fixed baseline, outside the flow (page furniture such as a back-page brand line). */
  textAt(str,{y,font='body',style=TYPE.body,color=COLOURS.ink,align='center'}){
    const w=widthOf(this.fonts[font],str,style.size);
    if(w>this.width)throw new LayoutError(`"${str.slice(0,40)}" is wider than the page column.`);
    const x=align==='center'?this.left+(this.width-w)/2:align==='right'?this.right-w:this.left;
    return this.op({t:'text',x,y,text:str,font,size:style.size,color,width:w,maxWidth:this.width,box:{x:this.left,w:this.width},src:null,line:0});
  }
  /** Height the text would take (no drawing). */
  measure(str,{font='body',style=TYPE.body,width=this.width}={}){
    return wrap(str,this.fonts[font],style.size,width).length*style.leading;
  }
  /** A step is a pair of wrapped columns sharing rows, never an unwrapped marker.
   * Keep a step (including its count) together where it fits; oversized steps
   * continue at line boundaries under the usual continuation header.
   */
  instruction(step,{src,labelWidth=mm(26),gap=mm(2)}={}){
    const indent=step.label?labelWidth+gap:0, width=this.width-indent;
    const body=wrap(step.text,this.fonts.body,TYPE.body.size,width);
    const labels=step.label?wrap(step.label,this.fonts.bold,TYPE.body.size,labelWidth):[];
    const rows=Math.max(body.length,labels.length);
    const count=step.stitch_count?`Stitch count: ${step.stitch_count}`:null;
    this.ensure(rows*TYPE.body.leading+(count?this.measure(count,{width,style:TYPE.small}):0));
    for(let i=0;i<rows;i++){
      this.ensure(TYPE.body.leading);
      const y=this.y;
      if(i<labels.length){const ops=this.text(labels[i],{font:'bold',color:COLOURS.rose,width:labelWidth,src:src?.('label')});ops[0].line=i;}
      this.y=y;
      if(i<body.length){const ops=this.text(body[i],{x:this.left+indent,width,src:src?.('text')});ops[0].line=i;}
      this.y=y-TYPE.body.leading;
    }
    if(count)this.text(count,{x:this.left+indent,width,style:TYPE.small,color:COLOURS.soft});
    this.space(3);
  }
  rect(x,y,w,h,color,{border=null}={}){return this.op({t:'rect',x,y,w,h,color,border});}
  image(asset,box,{where,source}){return this.op({t:'image',asset,...box,where,source});}
}

/** Largest box of the source aspect inside `frame`, centred. */
export function fitContain([pw,ph],frame){
  const s=Math.min(frame.w/pw,frame.h/ph), w=pw*s, h=ph*s;
  return {x:frame.x+(frame.w-w)/2,y:frame.y+(frame.h-h)/2,w,h};
}

/** Running footer (and folio) on every page that wants one. Page numbers are 1-based over the document. */
export function addFolios(flow,{start=1}={}){
  const f=flow.fonts.body, s=TYPE.folio.size;
  flow.pages.forEach((p,i)=>{
    if(!p.folio)return;
    const y=mm(GEOMETRY.footerY), n=String(i+start);
    p.ops.push({t:'line',x1:flow.left,y1:y+mm(4.2),x2:flow.right,y2:y+mm(4.2),color:COLOURS.line,thickness:0.5});
    if(flow.running?.left){const w=widthOf(f,flow.running.left,s);p.ops.push({t:'text',x:flow.left,y,text:flow.running.left,font:'body',size:s,color:COLOURS.soft,width:w,maxWidth:flow.width*0.7,box:{x:flow.left,w:flow.width*0.7},src:null,chrome:true});}
    const w=widthOf(f,n,s);
    p.ops.push({t:'text',x:flow.right-w,y,text:n,font:'body',size:s,color:COLOURS.soft,width:w,maxWidth:flow.width,box:{x:flow.left,w:flow.width},src:null,chrome:true});
  });
}

/** Draw laid-out pages into a pdf-lib document. `images` maps asset id -> embedded image. */
export function drawPages(pdf,flow,{fonts,images}){
  for(const p of flow.pages){
    const page=pdf.addPage([flow.W,flow.H]);
    for(const o of p.ops){
      if(o.t==='text')page.drawText(o.text,{x:o.x,y:o.y,size:o.size,font:fonts[o.font],color:o.color});
      else if(o.t==='rect')page.drawRectangle({x:o.x,y:o.y,width:o.w,height:o.h,color:o.color??undefined,...(o.border?{borderColor:o.border,borderWidth:0.6}:{})});
      else if(o.t==='line')page.drawLine({start:{x:o.x1,y:o.y1},end:{x:o.x2,y:o.y2},color:o.color,thickness:o.thickness});
      else if(o.t==='circle')page.drawCircle({x:o.x,y:o.y,size:o.r,color:o.color});
      else if(o.t==='image')page.drawImage(images.get(o.asset),{x:o.x,y:o.y,width:o.w,height:o.h});
    }
  }
}
