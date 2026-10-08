// Stage 1 crochet candidate content (ADR-041): the model boundary.
// Two structured steps: a collection PLAN (one call) that defines every
// pattern before any is drafted, then one call per pattern. Output is
// schema-valid structured data, checked locally; a rejected output is billed,
// recorded and retried by the owner, never repaired. Two lossless
// normalisations run before the validators decide: over-long finishing,
// assembly and notes items are split at sentence/clause/word boundaries, every
// word kept (ADR-043); and a plan's exact duplicate patterns are dropped only
// when that leaves exactly the requested count (ADR-045). Code, not the model, sets
// the pattern identity, the origin (ai-assisted-draft) and verification_status
// (unverified).
import { structured } from './prompts.mjs';
import { InvalidModelOutputError } from './client.mjs';
import { planProblems } from '../orchestrator/crochet.mjs';
import { loadSchema, fieldLimits } from '../orchestrator/schema.mjs';
import { normalizeBoundedInstructionArray, splitBoundedText } from '../orchestrator/bounded-text.mjs';
import { canonicalMeaning, SPECIAL_STITCH_MEANING } from '../orchestrator/crochet-terms.mjs';

const slim=o=>JSON.stringify(o,null,2);

/**
 * The hard count rule, the LAST block of the plan request (closest to the
 * array the model writes). N is always the owner's brief, never a constant.
 */
export function planCountRule(n){
  return [`PATTERN COUNT (hard rule): Generate EXACTLY ${n} patterns.`,
    `The \`patterns\` array length MUST equal ${n}.`,
    'Do not add a bonus pattern, alternate, extra motif, appendix pattern, variation or duplicate. An arrangement made only of other patterns in the list (a bouquet, posy or wreath of them) goes in `combinations`, never in `patterns`.',
    `Before returning JSON, count the \`patterns\` items and make sure the total is exactly ${n}.`,
    // ADR-068: roles are reserved inside the count, never added to it.
    `ROLE PLAN (hard rule): decide collection_type first, then the role_plan counts must add up to exactly ${n}, and each pattern's role must match role_plan. Never add a pattern to fill a role.${n<3?` With ${n} pattern${n>1?'s':''}, collection_type cannot be "arrangement".`:''}`].join('\n');
}
/** The plan schema as the MODEL sees it for this brief: `patterns` has exactly n items (strictSchema states "Exactly n items."). */
export function planSchemaFor(schema,n){
  const p=schema.properties.patterns;
  return {...schema,properties:{...schema.properties,patterns:{...p,minItems:n,maxItems:n,
    description:`EXACTLY ${n} patterns: the array length MUST equal ${n}. Each is a genuinely different base item; never a bonus, alternate, extra motif, appendix pattern, variation or duplicate.`}}};
}
// Canonical form for the exact-duplicate check (key order does not matter).
const canon=v=>Array.isArray(v)?`[${v.map(canon).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`:JSON.stringify(v);
/**
 * The one safe count repair (ADR-045): when the plan has MORE than n patterns
 * and removing items that are EXACT copies of an earlier item (every field
 * identical) leaves exactly n, the copies are removed. Nothing is invented,
 * reworded or truncated; a unique extra item, a near-duplicate, or too few
 * patterns is left unchanged for planProblems to reject.
 */
export function dropExactDuplicatePatterns(data,n){
  const P=data?.patterns;
  if(!Array.isArray(P)||P.length<=n)return {data,changes:[]};
  const seen=new Set(), kept=[], removed=[];
  P.forEach((x,index)=>{const k=canon(x);if(seen.has(k))removed.push({index,pattern_id:x?.pattern_id??null});else{seen.add(k);kept.push(x);}});
  if(!removed.length||kept.length!==n)return {data,changes:[]};
  return {data:{...data,patterns:kept},changes:[{field:'patterns',from:P.length,to:kept.length,removed}]};
}

/** The collection plan: exactly brief.pattern_count distinct, combinable base patterns (planProblems decides). */
export async function generatePatternPlan(ai,{product,concept,brief,direction}){
  const n=brief.pattern_count;
  const user=[`Owner's product request: ${JSON.stringify(product.request.text)}`,
    `Approved concept:\n${slim({name:product.name,product_type:product.product_type,target_customer:product.target_customer,season:product.season,
      concept:concept?{proposed_name:concept.proposed_name,short_description:concept.short_description,target_customer:concept.target_customer}:null})}`,
    direction?`Approved look (for names and mood only): ${slim({mood:direction.mood,palette:direction.palette})}`:'',
    `Crochet terminology: ${brief.terminology}.`,
    brief.guidance?`Owner's collection guidance (creative guidance, not a list you must follow item by item):\n${brief.guidance}`:'',
    planCountRule(n)].filter(Boolean).join('\n\n');
  const r=await structured(ai,{step:'crochet-plan',prompt:'crochet-plan',user,schemaName:'crochet-plan',
    modelSchema:full=>planSchemaFor(full,n),normalize:d=>dropExactDuplicatePatterns(d,n)});
  const e=planProblems(r.data,brief);
  if(e.length){
    // Every problem (not only the first few); the rejected plan travels with the error so the workflow can keep it for diagnosis.
    const err=new InvalidModelOutputError(`crochet plan: model output rejected: ${e.join('; ')}`);
    err.draft={data:r.data,model:r.model,problems:e};
    throw err;
  }
  return r;
}

// Free-text instruction arrays re-chunked before validation (ADR-043). Never steps[].text: a step is bound to its label and stitch count.
export const BOUNDED_INSTRUCTION_ARRAYS=Object.freeze(['finishing','assembly','notes']);
// One unambiguous US hook code ("G-6", "H/8", "7", "B-1"): the only safe canonical form of an over-long US size.
// Case-sensitive: hook letters are capitals, so "a 4 mm hook" never reads as a code.
const HOOK_CODE=/\b([A-N])\s*[-/]?\s*(\d{1,2}(?:\.\d)?)\b|\b[Ss]ize\s+(\d{1,2}(?:\.\d)?)\b/g;

/**
 * Deterministic, lossless repairs of predictable over-long fields (ADR-043, ADR-048), run between parsing and
 * schema validation, which still decides. Every limit is read from the schema. Nothing is truncated or invented:
 *   A split    finishing / assembly / notes items at sentence, clause, then word boundaries (every word kept).
 *   B canon    abbreviations[].meaning: the model's full wording moves VERBATIM into `notes` ("<abbr>: <text>");
 *              the table keeps the fixed standard meaning (sc = single crochet) or "special stitch (full method
 *              in Notes)". Only when notes stay within their item limit.
 *              category: the PLANNED category (the owner-approved plan's own value).
 *              hook_size.us: the single US hook code it contains (the mm size is a separate field).
 *              stitches_used[]: a written-out stitch name that is one of the pattern's own abbreviation meanings
 *              becomes that abbreviation.
 *   B position instructions[].heading -> "Section N"; steps[].label -> "Step N" (presentation only, ADR-049).
 * Every other bounded field is prompt-constrained only: an over-long value is rejected (paid), never rewritten.
 * @param ctx {entry, terminology}  the planned pattern (for category) and the brief's terminology
 */
export function normalizePatternDraft(data,schema,ctx={}){
  if(!data||typeof data!=='object')return {data,changes:[]};
  const P=schema.properties, changes=[];
  let out=data;
  // category -> the planned category.
  const catMax=P.category.maxLength;
  if(typeof out.category==='string'&&out.category.length>catMax&&typeof ctx.entry?.category==='string'&&ctx.entry.category.length>=1&&ctx.entry.category.length<=catMax){
    changes.push({field:'category',length:out.category.length,to:'planned category'});out={...out,category:ctx.entry.category};
  }
  // hook_size.us -> the one hook code it contains.
  const usMax=P.hook_size.properties.us.maxLength, us=out.hook_size?.us;
  if(typeof us==='string'&&us.length>usMax){
    const codes=[...new Set([...us.matchAll(HOOK_CODE)].map(m=>m[3]??`${m[1].toUpperCase()}-${m[2]}`))];
    if(codes.length===1&&codes[0].length<=usMax){changes.push({field:'hook_size.us',length:us.length,to:codes[0]});out={...out,hook_size:{...out.hook_size,us:codes[0]}};}
  }
  // abbreviations[].meaning -> standard meaning or special-stitch pointer; the full wording kept verbatim in notes.
  const mMax=P.abbreviations.items.properties.meaning.maxLength, nMax=P.notes.items.maxLength, nItems=P.notes.maxItems;
  if(Array.isArray(out.abbreviations)&&out.abbreviations.some(a=>typeof a?.meaning==='string'&&a.meaning.length>mMax)){
    let abbreviations=[...out.abbreviations], notes=[...(Array.isArray(out.notes)?out.notes:[])];
    abbreviations.forEach((a,i)=>{
      if(typeof a?.meaning!=='string'||a.meaning.length<=mMax)return;
      const moved=splitBoundedText(`${a.abbr}: ${a.meaning}`,nMax);
      if(notes.length+moved.length>nItems)return;   // no room: left for the validator (never truncated)
      const canonical=canonicalMeaning(a.abbr,ctx.terminology);
      abbreviations[i]={...a,meaning:canonical&&canonical.length<=mMax?canonical:SPECIAL_STITCH_MEANING};
      notes=[...notes,...moved];
      changes.push({field:`abbreviations[${i}].meaning`,length:a.meaning.length,to:canonical?'standard meaning':'special stitch',moved_to_notes:moved.length});
    });
    out={...out,abbreviations,notes};
  }
  // stitches_used[] -> the pattern's own abbreviation for a written-out stitch name.
  const sMax=P.stitches_used.items.maxLength;
  if(Array.isArray(out.stitches_used)&&out.stitches_used.some(s=>typeof s==='string'&&s.length>sMax)){
    const byMeaning=new Map((out.abbreviations??[]).filter(a=>a?.abbr&&a.abbr.length<=sMax).map(a=>[String(a.meaning).trim().toLowerCase(),a.abbr]));
    out={...out,stitches_used:out.stitches_used.map((s,i)=>{
      const abbr=typeof s==='string'&&s.length>sMax?byMeaning.get(s.trim().toLowerCase()):null;
      if(abbr)changes.push({field:`stitches_used[${i}]`,length:s.length,to:abbr});
      return abbr??s;
    })};
  }
  // Presentation metadata (ADR-049): an over-long section heading or step label becomes a positional name
  // ("Section 2", "Step 3", 1-based within its section). The crochet instruction lives in steps[].text, which is
  // never touched; the original wording is kept in the change log.
  const hMax=P.instructions.items.properties.heading.maxLength, lMax=P.instructions.items.properties.steps.items.properties.label.maxLength;
  const tooLong=(v,max)=>typeof v==='string'&&v.length>max;
  if(Array.isArray(out.instructions)&&out.instructions.some(s=>tooLong(s?.heading,hMax)||(Array.isArray(s?.steps)&&s.steps.some(st=>tooLong(st?.label,lMax))))){
    out={...out,instructions:out.instructions.map((s,i)=>{
      if(!s||typeof s!=='object')return s;
      let sec=s;
      if(tooLong(s.heading,hMax)){const to=`Section ${i+1}`;changes.push({field:`instructions[${i}].heading`,length:s.heading.length,from:s.heading,to});sec={...sec,heading:to};}
      if(Array.isArray(s.steps)&&s.steps.some(st=>tooLong(st?.label,lMax))){
        sec={...sec,steps:s.steps.map((st,j)=>{
          if(!tooLong(st?.label,lMax))return st;
          const to=`Step ${j+1}`;changes.push({field:`instructions[${i}].steps[${j}].label`,length:st.label.length,from:st.label,to});
          return {...st,label:to};
        })};
      }
      return sec;
    })};
  }
  // Instruction arrays: lossless split (after notes may have grown above).
  for(const k of BOUNDED_INSTRUCTION_ARRAYS){
    const n=normalizeBoundedInstructionArray(out[k],{maxLength:P[k].items.maxLength});
    if(n.changes.length){out={...out,[k]:n.items};changes.push(...n.changes.map(c=>({field:k,...c})));}
  }
  return {data:out,changes};
}

/** Every bound of the pattern schema as one request block, read from the schema (ADR-048): the model never has to infer a limit. */
export function patternLimitsBlock(schema){
  const L=fieldLimits(schema);
  return ['LENGTH AND COUNT LIMITS (hard maximums from the schema; anything longer or more is rejected):',
    ...L.filter(l=>l.kind==='length').map(l=>`- ${l.path}: at most ${l.max} characters${l.arrayItem?' each':''}`),
    ...L.filter(l=>l.kind==='items').map(l=>`- ${l.path}: ${l.min?`${l.min} to `:'at most '}${l.max} items`),
    'If more is needed in a list field, add another item; in a step, add another step; never exceed a limit.'].join('\n');
}

/** The model-facing pattern schema for one planned pattern: its difficulty is the planned one (strict mode enforces the enum). */
export function patternSchemaFor(schema,entry){
  return entry?.difficulty?{...schema,properties:{...schema.properties,difficulty:{...schema.properties.difficulty,enum:[entry.difficulty]}}}:schema;
}

/** One candidate pattern, as structured data. `revision` is the owner's instruction for a redraft. */
export async function generatePattern(ai,{entry,plan,brief,revision=null,previousErrors=[]}){
  const planned={name:entry.name,category:entry.category,role:entry.role,difficulty:entry.difficulty,summary:entry.summary,approx_size:entry.approx_size,
    suggested_yarn_weight:entry.yarn_weight,suggested_hook_mm:entry.hook_mm,construction:entry.construction,main_stitches:entry.main_stitches,assembly_required:entry.assembly_required};
  const schema=await loadSchema('crochet-pattern');
  const user=[`Collection theme: ${plan.theme}. Audience: ${plan.audience.join(', ')}.`,
    `Crochet terminology: ${brief.terminology} (use it consistently).`,
    `Pattern to draft:\n${slim(Object.fromEntries(Object.entries(planned).filter(([,v])=>v!==undefined)))}`,
    entry.assembly_required?'This pattern is made in more than one piece: `assembly` must say exactly how the pieces are joined.':'',
    `Other patterns in the collection (do not duplicate them): ${plan.patterns.filter(p=>p.pattern_id!==entry.pattern_id).map(p=>p.name).join(', ')||'none'}`,
    previousErrors.length?`The previous draft of this pattern failed validation. Fix exactly these problems:\n${previousErrors.map(x=>`- ${x}`).join('\n')}`:'',
    revision?`Owner's revision instruction (apply it):\n${revision}`:'',
    patternLimitsBlock(schema)].filter(Boolean).join('\n\n');
  const r=await structured(ai,{step:'crochet-pattern',prompt:'crochet-pattern',user,schemaName:'crochet-pattern',
    modelSchema:full=>patternSchemaFor(full,entry),normalize:d=>normalizePatternDraft(d,schema,{entry,terminology:brief.terminology})});
  if(r.data.difficulty!==entry.difficulty)throw new InvalidModelOutputError(`crochet pattern ${entry.pattern_id}: difficulty ${r.data.difficulty}, planned ${entry.difficulty}`);
  return r;
}
