// Stage 3 QC: does an AI coloured example still show THE SAME page? Deterministic, no model, no network.
// The dark-line structure of the approved source page is compared with the dark lines of the coloured result
// (lines the colouring added are "local darkness"; flat colour fills are not). Both images are normalised to the
// source's aspect ratio, so a crop, shift, mirror or different page cannot hide.
//   recall    = share of the source's lines that are still there (removed objects, a changed crop/composition)
//   precision = share of the example's lines that were in the source (added objects, redrawn lines)
// A real approved example scores ≈ 0.99 on both; a shifted, mirrored, cropped or different page scores < 0.7.
// Severe drift blocks the campaign; mild drift is only a warning. Never triggers a regeneration.
import { sharp } from '../../../production/src/lib.mjs';

export const FIDELITY_SEVERE=0.75;   // min(recall, precision) below this: not recognisably the same page (hard fail)
export const FIDELITY_MILD=0.92;     // below this (but not severe): visible drift, warn the owner
const W=384, TOL=2;

async function plane(bytes,h,blur=0){let s=sharp(bytes).resize(W,h,{fit:'fill'}).greyscale();if(blur)s=s.blur(blur);return (await s.raw().toBuffer({resolveWithObject:true})).data;}
function dilate(m,w,h,r){const o=new Uint8Array(m.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(!m[y*w+x])continue;
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<w&&ny<h)o[ny*w+nx]=1;}}
  return o;}

/** @returns {{recall,precision,min,severity:'ok'|'mild'|'severe'}} */
export async function exampleFidelity(sourceBytes,exampleBytes){
  const m=await sharp(sourceBytes).metadata(), h=Math.max(1,Math.round(W*m.height/m.width));
  const [S,Sb,E,Eb]=await Promise.all([plane(sourceBytes,h),plane(sourceBytes,h,5),plane(exampleBytes,h),plane(exampleBytes,h,5)]);
  const ms=new Uint8Array(S.length), me=new Uint8Array(S.length);
  for(let i=0;i<ms.length;i++){ms[i]=(S[i]<120||S[i]<Sb[i]-35)?1:0;me[i]=(E[i]<Eb[i]-28)?1:0;}
  const ds=dilate(ms,W,h,TOL), de=dilate(me,W,h,TOL);
  let a=0,hit=0,c=0,ok=0;
  for(let i=0;i<ms.length;i++){if(ms[i]){a++;if(de[i])hit++;}if(me[i]){c++;if(ds[i])ok++;}}
  const recall=a?hit/a:1, precision=c?ok/c:0, min=Math.min(recall,precision);   // a line-free result is a total loss of the lines
  return {recall:+recall.toFixed(3),precision:+precision.toFixed(3),min:+min.toFixed(3),severity:min<FIDELITY_SEVERE?'severe':min<FIDELITY_MILD?'mild':'ok'};
}

/** QC rows for [{id, ...exampleFidelity()}]: one blocking check (severe drift) and warnings (mild drift). */
export function fidelityChecks(results){
  const severe=results.filter(r=>r.severity==='severe'), mild=results.filter(r=>r.severity==='mild');
  const f=r=>`${r.id} (lines kept ${(r.recall*100).toFixed(0)}%, lines added ${((1-r.precision)*100).toFixed(0)}%)`;
  return {checks:[{name:'coloured example is still the same page',ok:!severe.length,
      detail:severe.length?`severe drift from the approved line art: ${severe.map(f).join(', ')}. Not regenerated automatically.`
        :results.map(r=>`${r.id} ${(r.min*100).toFixed(0)}% of the line structure preserved`).join(', ')||'no coloured examples'}],
    warnings:mild.map(r=>`The coloured example ${f(r)} drifted a little from the approved page; check it before approving.`)};
}
