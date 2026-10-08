// Reconcile approved fields -> layout lines -> actual PDF text at those positions.
// Page furniture and adjacent labels are separate text, not part of a step.
import { hookOf } from './hook.mjs';
export const normalText=s=>String(s??'').normalize('NFKC').replace(/\s+/g,' ').trim();
const get=(obj,path)=>path.split(/[.[\]]+/).filter(Boolean).reduce((x,k)=>x?.[k],obj);

/** Conservative font extents protect instruction rows from neighbouring text
 * (including continuation headers and footers), not just the physical page edge.
 */
export function instructionBoundsProblems(flow){
  const problems=[];
  const box=o=>{const f=flow.fonts[o.font].face;return {left:o.x,right:o.x+o.width,
    bottom:o.y+f.descent*o.size/f.unitsPerEm,top:o.y+f.ascent*o.size/f.unitsPerEm};};
  for(const [i,pg] of flow.pages.entries()){
    const texts=pg.ops.filter(o=>o.t==='text'&&normalText(o.text));
    for(const o of texts.filter(o=>/^instructions\[\d+\]\.steps/.test(o.src?.field??''))){
      const a=box(o), where=`p${i+1} ${o.src.pattern_id} ${o.src.field}`;
      // Baselines reserve a full leading; descenders can extend slightly below
      // the baseline margin, still well above the footer separator.
      if(a.left<flow.left-0.5||a.right>flow.right+0.5||a.bottom<flow.bottom-2||a.top>flow.top+0.5||o.width>o.maxWidth+0.5)problems.push(`${where}: instruction overflow`);
      for(const q of texts){if(q===o)continue;const b=box(q);
        if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>0.5&&Math.min(a.top,b.top)-Math.max(a.bottom,b.bottom)>0.5)
          problems.push(`${where}: overlaps ${q.chrome?'footer':q.src?.field??JSON.stringify(q.text.slice(0,35))}`);
      }
    }
  }
  return problems;
}

export function sourceTextProblems(flow,pattern){
  const fields=new Map(), materials=new Map(), problems=[];
  for(const pg of flow.pages)for(const o of pg.ops){
    if(o.t!=='text'||o.src?.pattern_id!==pattern.pattern_id)continue;
    if(o.src.context==='materials'){const list=materials.get(o.src.field)??[];list.push(o.text);materials.set(o.src.field,list);continue;}
    if(o.src.context)continue;
    const list=fields.get(o.src.field)??[];list.push(o);fields.set(o.src.field,list);
  }
  const expected=pattern.instructions.flatMap((s,i)=>[`instructions[${i}].heading`,...s.steps.flatMap((st,j)=>
    [`instructions[${i}].steps[${j}].text`,...(st.label?[`instructions[${i}].steps[${j}].label`]:[])])]);
  for(const field of ['assembly','finishing'])expected.push(...(pattern[field]??[]).map((_,i)=>`${field}[${i}]`));
  for(const field of expected)if(!fields.has(field))problems.push(`${field}: text missing from layout`);
  const steps=expected.filter(f=>/\.steps\[\d+\]\.text$/.test(f));
  if([...fields.keys()].filter(f=>/\.steps\[\d+\]\.text$/.test(f)).join('|')!==steps.join('|'))problems.push('instruction steps missing or out of source order');
  for(const [field,ops] of fields){
    if(normalText(ops.map(o=>o.text).join(' '))!==normalText(get(pattern,field)))problems.push(`${field}: layout text differs from approved source`);
    if(ops.some((o,i)=>o.line!==i))problems.push(`${field}: layout lines duplicated or out of order`);
  }
  // Composed materials rows must still include every authoritative source value.
  // Checking their positioned PDF lines below then proves they reached the file.
  if(pattern.yarn){
    const must=pattern.yarn.map((y,i)=>[`yarn[${i}].description`,y.description]);
    must.push(...pattern.additional_materials.map(t=>['additional_materials',t]));
    const hook=hookOf(pattern);
    must.push(['hook_size',hook]);
    for(const [field,text] of must)if(!normalText((materials.get(field)??[]).join(' ')).includes(normalText(text)))problems.push(`${field}: approved material/hook text missing from layout`);
  }
  return problems;
}

/** Match each non-furniture line to extracted glyph text on its actual page and baseline.
 * Never fall back to a substring anywhere else in the document: repeated text,
 * missing lines, changed words and content moved to the wrong page must fail.
 */
export function renderedTextProblems(flow,pages){
  const problems=[];
  for(const [i,pg] of flow.pages.entries()){
    const items=pages.find(p=>p.page===i+1)?.textItems;
    if(!items){problems.push(`p${i+1}: extraction mismatch (positioned PDF text unavailable)`);continue;}
    for(const o of pg.ops.filter(o=>o.t==='text'&&!o.chrome&&normalText(o.text))){
      const at=items.filter(t=>Math.abs(t.y-o.y)<0.5&&t.x>=o.x-0.5&&t.x<o.x+o.width+0.5);
      const actual=normalText(at.sort((a,b)=>a.x-b.x).map(t=>t.text).join(''));
      // pdf.js may emit distinct text runs without a synthetic space between them.
      const spaced=normalText(at.map(t=>t.text).join(' '));
      const where=`p${i+1} ${o.src?.pattern_id??''} ${o.src?.field??JSON.stringify(o.text.slice(0,50))} line ${(o.line??0)+1}`;
      if(actual!==normalText(o.text)&&spaced!==normalText(o.text))problems.push(`${where}: ${at.length?'extraction mismatch':'text missing at expected position'}; expected ${JSON.stringify(o.text)}, extracted ${JSON.stringify(actual)}`);
    }
  }
  return problems;
}
