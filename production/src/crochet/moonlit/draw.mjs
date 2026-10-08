// Draw Moonlit pages into a pdf-lib document. Text is always real PDF text
// (selectable, extractable by QC). Images are drawn whole and only CLIPPED to
// their frame: the approved file is never cropped, edited or re-encoded here.
import { lib } from '../../lib.mjs';
import { COLOURS } from './theme.mjs';
import { ORNAMENTS } from './ornaments.mjs';

// pdf-lib comes from Product #004's install, like every other production library.
const { pushGraphicsState, popGraphicsState, moveTo, lineTo, appendBezierCurve, closePath, clip, endPath,
  concatTransformationMatrix, setCharacterSpacing }=lib('pdf-lib');
const K=0.5523;   // bezier circle constant
/** Rounded-rectangle path operators (PDF coordinates, y up). */
function roundRectOps(x,y,w,h,r){
  r=Math.max(0,Math.min(r,w/2,h/2));
  return [moveTo(x+r,y),lineTo(x+w-r,y),appendBezierCurve(x+w-r+r*K,y,x+w,y+r-r*K,x+w,y+r),lineTo(x+w,y+h-r),
    appendBezierCurve(x+w,y+h-r+r*K,x+w-r+r*K,y+h,x+w-r,y+h),lineTo(x+r,y+h),appendBezierCurve(x+r-r*K,y+h,x,y+h-r+r*K,x,y+h-r),
    lineTo(x,y+r),appendBezierCurve(x,y+r-r*K,x+r-r*K,y,x+r,y),closePath()];
}
/** Arch window: straight sides, semicircular top. */
function archOps(x,y,w,h){
  const R=w/2, top=y+h-R;
  return [moveTo(x,y),lineTo(x+w,y),lineTo(x+w,top),appendBezierCurve(x+w,top+R*K,x+R+R*K,y+h,x+R,y+h),
    appendBezierCurve(x+R-R*K,y+h,x,top+R*K,x,top),closePath()];
}
export const shapeOps=(shape,{x,y,w,h},radius=0)=>shape==='arch'?archOps(x,y,w,h):roundRectOps(x,y,w,h,radius);
/** SVG path for a shape in local coordinates (y down), for outlines drawn with drawSvgPath. */
export function shapeSvg(shape,w,h,radius=0){
  if(shape==='arch'){const R=w/2;return `M0 ${h} L${w} ${h} L${w} ${R} A${R} ${R} 0 0 0 0 ${R} Z`;}
  const r=Math.max(0,Math.min(radius,w/2,h/2));
  return `M${r} 0 L${w-r} 0 A${r} ${r} 0 0 1 ${w} ${r} L${w} ${h-r} A${r} ${r} 0 0 1 ${w-r} ${h} L${r} ${h} A${r} ${r} 0 0 1 0 ${h-r} L0 ${r} A${r} ${r} 0 0 1 ${r} 0 Z`;
}

/**
 * The full image scaled to COVER the frame around the crop region's centre
 * (crop: fractions of the source, used only to choose what the frame shows).
 */
export function coverPlacement(px,frame,crop){
  crop??={x:0,y:0,w:1,h:1};   // no crop (undefined or null): the whole image
  const [pw,ph]=px, cw=crop.w*pw, ch=crop.h*ph;
  const s=Math.max(frame.w/cw,frame.h/ch), cx=(crop.x+crop.w/2)*pw, cy=(crop.y+crop.h/2)*ph;
  return {x:frame.x+frame.w/2-cx*s,y:frame.y+frame.h/2-(ph-cy)*s,w:pw*s,h:ph*s};
}

const colour=k=>k==null?undefined:typeof k==='string'?COLOURS[k]:k;
function drawOrnament(page,o,assets){
  const a=ORNAMENTS[o.name];
  if(!a||assets?.disabled)return;   // unavailable assets are simply not drawn
  const s=o.size/a.box[0], h=a.box[1]*s;
  page.pushOperators(pushGraphicsState());
  // Mirror around the ornament's own box (corners and left-hand sprigs).
  if(o.flipX||o.flipY)page.pushOperators(concatTransformationMatrix(o.flipX?-1:1,0,0,o.flipY?-1:1,o.flipX?2*o.x+o.size:0,o.flipY?2*o.y-h:0));
  for(const p of a.parts)page.drawSvgPath(p.d,{x:o.x,y:o.y,scale:s,color:colour(p.fill),borderColor:colour(p.stroke),
    borderWidth:p.stroke?(p.width??1)*s:0,opacity:p.opacity,borderLineCap:1});
  page.pushOperators(popGraphicsState());
}

/** Draw every laid-out page. `images` maps a slot file path to an embedded pdf-lib image. */
export function drawMoonlit(pdf,flow,{fonts,images,assets}){
  for(const p of flow.pages){
    const page=pdf.addPage([flow.W,flow.H]);
    for(const o of p.ops){
      if(o.t==='text'){
        if(o.tracking)page.pushOperators(setCharacterSpacing(o.tracking));
        page.drawText(o.text,{x:o.x,y:o.y,size:o.size,font:fonts[o.font],color:colour(o.color)});
        if(o.tracking)page.pushOperators(setCharacterSpacing(0));
      }else if(o.t==='rect'){
        if(o.radius)page.drawSvgPath(shapeSvg('rect',o.w,o.h,o.radius),{x:o.x,y:o.y+o.h,color:colour(o.color),borderColor:colour(o.border),borderWidth:o.border?o.borderWidth??0.6:0});
        else page.drawRectangle({x:o.x,y:o.y,width:o.w,height:o.h,color:colour(o.color),...(o.border?{borderColor:colour(o.border),borderWidth:o.borderWidth??0.6}:{})});
      }else if(o.t==='line')page.drawLine({start:{x:o.x1,y:o.y1},end:{x:o.x2,y:o.y2},color:colour(o.color),thickness:o.thickness,...(o.dash?{dashArray:o.dash,lineCap:1}:{})});
      else if(o.t==='circle')page.drawCircle({x:o.x,y:o.y,size:o.r,color:colour(o.color),...(o.border?{borderColor:colour(o.border),borderWidth:o.borderWidth??0.6}:{})});
      else if(o.t==='ornament')drawOrnament(page,o,assets);
      else if(o.t==='image'){
        const img=images.get(o.asset??o.file);
        if(!img)throw new Error(`image ${o.asset??o.file} was laid out but not embedded`);
        const f=o.frame, at=o.drawn??coverPlacement(o.px,f,o.crop);
        if(o.clipped!==false)page.pushOperators(pushGraphicsState(),...shapeOps(o.shape,f,o.radius),clip(),endPath());
        page.drawImage(img,{x:at.x,y:at.y,width:at.w,height:at.h});
        if(o.clipped!==false)page.pushOperators(popGraphicsState());
        if(o.outline)page.drawSvgPath(shapeSvg(o.shape,f.w,f.h,o.radius),{x:f.x,y:f.y+f.h,borderColor:colour(o.outline),borderWidth:0.6});
      }
    }
  }
}
