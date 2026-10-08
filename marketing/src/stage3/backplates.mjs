// Stage 3 QC: are the lifestyle backplates (AI environment photographs) different from each other?
// A 9x8 difference hash (64 bits) of each backplate; Hamming distance between every pair.
// Effectively identical (≤ 4 bits) fails; very similar (≤ 12 bits) warns. Deterministic.
import { sharp } from '../../../production/src/lib.mjs';

export const DUPLICATE_BITS=4, SIMILAR_BITS=12;
export async function dhash(bytes){
  const {data}=await sharp(bytes).resize(9,8,{fit:'fill'}).greyscale().raw().toBuffer({resolveWithObject:true});
  const bits=[];for(let y=0;y<8;y++)for(let x=0;x<8;x++)bits.push(data[y*9+x]>data[y*9+x+1]?1:0);
  return bits;
}
const dist=(a,b)=>a.reduce((n,v,i)=>n+(v!==b[i]?1:0),0);
/** @param scenes [{id, bytes}] → {checks, warnings} */
export async function backplateDifferentiation(scenes){
  const hs=await Promise.all(scenes.map(async s=>({id:s.id,h:await dhash(s.bytes)}))), pairs=[];
  for(let i=0;i<hs.length;i++)for(let j=i+1;j<hs.length;j++)pairs.push({a:hs[i].id,b:hs[j].id,bits:dist(hs[i].h,hs[j].h)});
  const dup=pairs.filter(p=>p.bits<=DUPLICATE_BITS), similar=pairs.filter(p=>p.bits>DUPLICATE_BITS&&p.bits<=SIMILAR_BITS);
  return {checks:[{name:'lifestyle backplates differ from each other',ok:!dup.length,
      detail:dup.length?`effectively identical: ${dup.map(p=>`${p.a} / ${p.b}`).join(', ')}`:pairs.map(p=>`${p.a} / ${p.b}: ${p.bits}/64 bits`).join('; ')||'fewer than two backplates'}],
    warnings:similar.map(p=>`Lifestyle backplates ${p.a} and ${p.b} look very similar (${p.bits}/64 bits).`)};
}
