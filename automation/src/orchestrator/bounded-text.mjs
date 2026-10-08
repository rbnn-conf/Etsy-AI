// Lossless re-chunking of over-long instruction items (ADR-043). A model can
// write one finishing paragraph longer than the schema allows (strict mode
// strips maxLength; the limit is only a description to the model). Such an
// item is split into several shorter items: at sentence boundaries first,
// then at clause boundaries (; : ,), then between words. Every word is kept,
// in order; nothing is rewritten, summarised or cut mid-word. Items already
// within the limit are returned unchanged (same string). A single word longer
// than the limit cannot be split safely and is left as it is, so the schema
// validator still rejects it: validation stays the final authority.

const words=t=>t.split(/\s+/).filter(Boolean);
// "e.g." or "approx." ends no sentence: such a piece is rejoined to the next.
const ABBR=/\b(e\.g|i\.e|approx|etc|incl|cf|vs|no)\.$/i;
const sentencesOf=t=>t.split(/(?<=[.!?]["')\]]?)\s+(?=\S)/).reduce((a,s)=>{if(a.length&&ABBR.test(a.at(-1)))a[a.length-1]+=` ${s}`;else a.push(s);return a;},[]);
const clausesOf=t=>t.split(/(?<=[;:,])\s+(?=\S)/);

// Greedy packing of pieces (each <= max, or a lone unsplittable word) into chunks <= max, joined by one space.
function pack(pieces,max){
  const out=[];let cur='';
  for(const p of pieces){
    const x=cur?`${cur} ${p}`:p;
    if(x.length<=max)cur=x;else{if(cur)out.push(cur);cur=p;}
  }
  if(cur)out.push(cur);
  return out;
}
// Break one piece into parts <= max at the finest needed level: clauses, then words.
function fine(piece,max,level=0){
  if(piece.length<=max)return [piece];
  const parts=level===0?clausesOf(piece):words(piece);
  if(parts.length<2)return level===0?fine(piece,max,1):[piece];
  return parts.flatMap(p=>level===0?fine(p,max,1):[p]);
}

/** One text as one or more chunks, each <= maxLength where possible. A text within the limit is returned as [text]. */
export function splitBoundedText(text,maxLength){
  if(typeof text!=='string'||text.length<=maxLength)return [text];
  const t=text.trim().replace(/\s+/g,' ');
  return pack(sentencesOf(t).flatMap(s=>fine(s,maxLength)),maxLength);
}

/**
 * An array of instruction strings with every over-long item split into
 * consecutive items. Returns {items, changes}: `changes` lists each split
 * ({index, length, parts}) for the log; [] (and the same array) when nothing
 * needed splitting. Non-string items are left for the validator.
 */
export function normalizeBoundedInstructionArray(items,{maxLength}){
  if(!Array.isArray(items)||!items.some(x=>typeof x==='string'&&x.length>maxLength))return {items,changes:[]};
  const changes=[], out=[];
  items.forEach((x,index)=>{
    const parts=splitBoundedText(x,maxLength);
    if(parts.length>1||parts[0]!==x)changes.push({index,length:x.length,parts:parts.length});
    out.push(...parts);
  });
  return {items:out,changes};
}

/** Same words in the same order (whitespace aside): the losslessness invariant, for tests and assertions. */
export const sameWords=(a,b)=>words([].concat(a).join(' ')).join(' ')===words([].concat(b).join(' ')).join(' ');
