// Stage 1 crochet pattern content (ADR-041): pure helpers over product.json.
//
// Creative approval (the look) and pattern approval (the instructions) are
// separate gates:
//
//   CREATIVE_APPROVED (style approved) -> brief (pattern count + terms)
//     -> PATTERNS_GENERATING (AI-assisted drafts, or an owner-supplied source)
//     -> validator (production/src/crochet/bundle.mjs) -> AWAITING_PATTERN_APPROVAL
//     -> APPROVE PATTERNS (bound to the source SHA-256) -> CREATIVE_APPROVED -> /produce
//
// Model-drafted patterns are ai-assisted-draft and verification_status
// "unverified". Nothing here marks a pattern tested or repairs one: a pattern
// the validator rejects goes back to generation or revision.
// No I/O here: the workflow reads and writes files.
import { formatOf } from './book-state.mjs';
import { CROCHET_FORMAT, CROCHET_SCHEMA_VERSION, PATTERN_SOURCE, AI_ORIGIN, validateCrochetBundle, SKILL_LEVELS, isTested,
  usedAbbreviations, abbreviationKeys, glossaryKey } from '../../../production/src/index.mjs';
import { canonicalMeaning } from './crochet-terms.mjs';

export { PATTERN_SOURCE };
export const PATTERN_PLAN='crochet/plan.json';
export const draftFile=id=>`crochet/drafts/${id}.json`;
export const MAX_PATTERNS=60;
/** The pattern roles the plan schema (crochet-plan.schema.json patterns[].role and role_plan) and planProblems share (a test keeps them equal). */
export const PLAN_ROLES=Object.freeze(['focal','secondary','filler','accent','foliage','structural']);
export const COLLECTION_TYPES=Object.freeze(['arrangement','coordinated-set','independent']);

export const needsPatterns=p=>formatOf(p)===CROCHET_FORMAT;
export const patternsApproved=p=>!!p?.crochet?.approval;
/** Style approved; the pattern content still has to be drafted/supplied, validated or approved. */
export const awaitingPatterns=p=>needsPatterns(p)&&!patternsApproved(p)&&p.status==='CREATIVE_APPROVED';
/** In the pattern phase, or FAILED during it. */
// An approved source may be re-validated (after an edit) from the approved state, or after a production failure (ADR-052).
export const canReopenPatterns=p=>needsPatterns(p)&&patternsApproved(p)&&(p.status==='CREATIVE_APPROVED'||(p.status==='FAILED'&&p.last_error?.step==='production'));
export const inPatterns=p=>['PATTERNS_GENERATING','AWAITING_PATTERN_APPROVAL'].includes(p.status)||(p.status==='FAILED'&&p.last_error?.step==='patterns');
export const emptyCrochet=()=>({version:1,brief:null,plan:null,source:null,patterns:[],validation:null,generation:null,pending:null,revision_notes:[],approval:null});

/**
 * The owner's brief: "33", "33 US", "12 patterns, UK terms". US unless UK is
 * asked for explicitly (ADR-041). Returns null when there is no usable count.
 */
export function parseBrief(text){
  const m=/\b(\d{1,3})\b/.exec(String(text)), n=Number(m?.[1]);
  if(!Number.isInteger(n)||n<1||n>MAX_PATTERNS)return null;
  // Anything after the first line (or after ":" / ";" on it) is the owner's collection guidance.
  const s=String(text), first=s.split('\n')[0], cut=/[:;]/.exec(first);
  const guidance=(s.includes('\n')?s.slice(s.indexOf('\n')+1):cut?first.slice(cut.index+1):'').trim().slice(0,1500)||null;
  const head=cut?first.slice(0,cut.index):first;
  return {pattern_count:n,terminology:/\b(uk|british)\b/i.test(head)?'UK':'US',guidance};
}

/**
 * The pattern count and terms the owner's ORIGINAL request states ("33 crochet flower & bouquet
 * patterns, US terms"), or null. Used only to warn when a brief differs from the request; the brief decides.
 */
export function requestedBrief(text){
  const s=String(text??''), n=/\b(\d{1,3})\s+(?:[\w&'’-]+\s+){0,4}?patterns?\b/i.exec(s), t=/\b(US|UK)\s+(?:crochet\s+)?terms?\b/i.exec(s);
  const count=n&&Number(n[1])>=1&&Number(n[1])<=MAX_PATTERNS?Number(n[1]):null, terminology=t?t[1].toUpperCase():null;
  return count||terminology?{pattern_count:count,terminology}:null;
}
/** How a brief differs from the original request: [] when it matches (or the request states nothing). */
export function briefMismatch(brief,requested){
  if(!brief||!requested)return [];
  const out=[];
  if(requested.pattern_count&&brief.pattern_count!==requested.pattern_count)out.push(`${brief.pattern_count} patterns (your request said ${requested.pattern_count})`);
  if(requested.terminology&&brief.terminology!==requested.terminology)out.push(`${brief.terminology} terms (your request said ${requested.terminology})`);
  return out;
}

// Size, colour and "style" words that do not make a different base pattern ("Small Rosebud" = "Rosebud").
const MODIFIERS=new Set(['small','large','mini','big','tiny','little','medium','simple','classic','basic','easy','pink','red','white','yellow','blue','purple','orange',
  'lilac','cream','pastel','two','tone','colour','color','colourful','colorful','version','variation','alternative','alt']);
const baseName=n=>String(n).toLowerCase().replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(w=>w&&!MODIFIERS.has(w)).map(w=>w.length>3&&w.endsWith('s')&&!w.endsWith('ss')?w.slice(0,-1):w).join(' ');

/**
 * Collection-plan checks beyond the schema (ADR-041): exact count, unique ids
 * and names, no near-duplicates (the same base after size/colour words), a
 * combinable collection that can form complete arrangements, and a sensible
 * difficulty balance. Returns problems; [] when the plan may be drafted.
 */
export function planProblems(plan,brief){
  const P=plan.patterns, e=[];
  if(P.length!==brief.pattern_count)e.push(`${P.length} patterns planned; the owner asked for ${brief.pattern_count}`);
  const dup=(f,label)=>{const seen=new Map();for(const p of P){const k=f(p);if(!k)continue;if(seen.has(k))e.push(`${label}: "${seen.get(k)}" and "${p.name}"`);else seen.set(k,p.name);}};
  dup(p=>p.pattern_id,'duplicate pattern_id');
  dup(p=>p.name.trim().toLowerCase(),'duplicate name');
  const bases=new Map();for(const p of P){const b=baseName(p.name);bases.set(b,[...new Set([...(bases.get(b)??[]),p.name.trim()])]);}
  for(const [b,names] of bases)if(b&&names.length>1)e.push(`near-duplicate (a size or colour variation is not a base pattern): ${names.join(', ')}`);
  const ids=new Set(P.map(p=>p.pattern_id)), items=plan.combinations?.items??[];
  for(const c of items)for(const x of c.patterns)if(!ids.has(x.pattern_id))e.push(`combination "${c.name}" names unknown pattern ${x.pattern_id}`);
  // ADR-068: the role allocation is made before the patterns and must account for every slot, within the requested count.
  if(plan.role_plan){
    const planned=PLAN_ROLES.reduce((s,r)=>s+(plan.role_plan[r]??0),0);
    if(planned!==brief.pattern_count)e.push(`role_plan allocates ${planned} pattern slots; the owner asked for ${brief.pattern_count}`);
    const actual=Object.fromEntries(PLAN_ROLES.map(r=>[r,P.filter(p=>p.role===r).length]));
    const off=PLAN_ROLES.filter(r=>(plan.role_plan[r]??0)!==actual[r]).map(r=>`${r} ${actual[r]} (planned ${plan.role_plan[r]??0})`);
    if(off.length)e.push(`pattern roles do not match role_plan: ${off.join(', ')}`);
  }
  // Arrangement rules apply to a declared arrangement; a plan without collection_type (made before ADR-068) is an
  // arrangement whenever it lists combinations, exactly as before.
  const type=plan.collection_type??(items.length?'arrangement':'independent');
  if(type==='arrangement'){
    if(P.length<3)e.push(`an arrangement needs at least 3 patterns (focal, filler or accent, foliage or structural); ${P.length} were asked for: plan a coordinated-set or independent patterns instead`);
    const role=r=>P.some(p=>r.includes(p.role));
    if(!role(['focal']))e.push('no focal piece: a combinable collection needs at least one focal pattern');
    if(!role(['filler','accent']))e.push('no filler or accent pieces to complete an arrangement');
    if(!role(['foliage','structural']))e.push('no foliage or structural pieces (leaves, stems) to complete an arrangement');
    const roleOf=id=>P.find(p=>p.pattern_id===id)?.role;
    if(!items.some(c=>c.patterns.some(x=>roleOf(x.pattern_id)==='focal')&&c.patterns.some(x=>['foliage','structural'].includes(roleOf(x.pattern_id)))))
      e.push('no combination joins a focal piece with foliage or stems: none forms a complete arrangement');
  }
  if(type==='independent'&&items.length)e.push(`an independent collection lists ${items.length} combination(s): use coordinated-set when the pieces are used together, or leave combinations empty`);
  if(P.length>=6){
    const counts=new Map();for(const p of P)counts.set(p.difficulty,(counts.get(p.difficulty)??0)+1);
    const top=Math.max(...counts.values());
    if(counts.size<2)e.push(`every pattern is ${P[0].difficulty}: plan a range of difficulties`);
    else if(top/P.length>0.75)e.push(`difficulty is unbalanced: ${top} of ${P.length} patterns share one level`);
    const easy=P.filter(p=>['beginner','easy'].includes(p.difficulty)).length;
    if(plan.audience.some(a=>/beginner/i.test(a))&&easy/P.length<0.25)e.push(`only ${easy} of ${P.length} patterns are beginner or easy, for an audience that includes beginners`);
  }
  return e;
}

/** A model pattern (automation/schemas/crochet-pattern.schema.json) as a source pattern. Never adds testing. */
export function fromModelPattern(entry,m){
  const p={pattern_id:entry.pattern_id,name:entry.name,category:m.category,difficulty:m.difficulty,finished_size:m.finished_size,
    yarn:m.yarn.map(y=>({description:y.description,colour:y.colour,amount:y.amount})),yarn_weight:m.yarn_weight,
    ...(m.requires_hook?{hook_size:{mm:m.hook_size.mm,us:m.hook_size.us}}:{requires_hook:false}),
    additional_materials:m.additional_materials,stitches_used:m.stitches_used,
    abbreviations:Object.fromEntries(m.abbreviations.map(a=>[a.abbr,a.meaning])),gauge:m.gauge,
    instructions:m.instructions.map(s=>({heading:s.heading,steps:s.steps.map(st=>({label:st.label,text:st.text,stitch_count:st.stitch_count}))})),
    ...(m.assembly.length?{assembly:m.assembly}:{}),
    // The plan's assembly decision (true or false) goes to the validator, which enforces it (ADR-051); never filled in by code.
    ...(typeof entry.assembly_required==='boolean'?{assembly_required:entry.assembly_required}:{}),finishing:m.finishing,...(m.notes.length?{notes:m.notes}:{}),
    origin:AI_ORIGIN,verification_status:'unverified'};
  return p;
}

/**
 * A STANDARD abbreviation an AI draft uses in its instructions but forgot to list ("dec") gets its fixed meaning in
 * this terminology (ADR-050). Never a pattern-defined stitch: an unknown or special abbreviation is left undefined
 * for the validator to reject. A draft with nothing missing is returned unchanged (same object).
 * @returns {pattern, added:[{abbr, meaning}]}
 */
export function completeCanonicalAbbreviations(pattern,terminology){
  const glossary=pattern?.abbreviations;
  if(!glossary||typeof glossary!=='object'||Array.isArray(glossary))return {pattern,added:[]};
  const texts=[];
  for(const s of Array.isArray(pattern.instructions)?pattern.instructions:[])for(const st of Array.isArray(s?.steps)?s.steps:[])texts.push(st?.text);
  for(const k of ['assembly','finishing'])if(Array.isArray(pattern[k]))texts.push(...pattern[k]);
  const keys=new Set(Object.keys(glossary).map(glossaryKey)), added=[];
  for(const w of usedAbbreviations(texts.filter(t=>typeof t==='string'),[...keys])){
    const defs=abbreviationKeys(w), abbr=defs[0];
    if(!abbr||defs.some(k=>keys.has(k)))continue;
    const meaning=canonicalMeaning(abbr,terminology);
    if(meaning){added.push({abbr,meaning});keys.add(abbr);}
  }
  return added.length?{pattern:{...pattern,abbreviations:{...glossary,...Object.fromEntries(added.map(a=>[a.abbr,a.meaning]))}},added}:{pattern,added};
}

/**
 * The candidate source from the plan and the drafts in plan order. Bundle
 * facts come from the approved product and the owner's brief; the count is
 * the brief's, never the number of drafts that happen to exist.
 */
export function assembleBundle({product,brief,plan,drafts,model}){
  const levels=SKILL_LEVELS.filter(l=>drafts.some(d=>d.difficulty===l));
  return {schema_version:CROCHET_SCHEMA_VERSION,format:CROCHET_FORMAT,title:product.name,theme:plan.theme,audience:plan.audience,
    skill_level:levels.length?levels:[plan.patterns[0]?.difficulty??'beginner'],delivery:['digital','printable'],style:plan.style,
    pattern_count:brief.pattern_count,terminology:brief.terminology,
    provenance:{author:`LumiumX, AI-assisted draft (${model})`,origin:AI_ORIGIN,notes:'Candidate instructions drafted with AI assistance for owner review. Unverified: not test-crocheted.'},
    ...(plan.combinations?.items?.length?{combinations:plan.combinations}:{}),
    patterns:drafts.map(d=>completeCanonicalAbbreviations(d,brief.terminology).pattern)};
}

/** Validation of a candidate source, with each error assigned to its pattern. */
export function validateCandidate(bundle){
  const v=validateCrochetBundle(bundle), byPattern=new Map();
  for(const e of v.errors){
    const i=Number(/^\$\.patterns\[(\d+)\]/.exec(e)?.[1]), id=Number.isInteger(i)?bundle.patterns?.[i]?.pattern_id:null;
    if(id)byPattern.set(id,[...(byPattern.get(id)??[]),e]);
  }
  return {...v,byPattern,bundleErrors:v.errors.filter(e=>!/^\$\.patterns\[\d+\]/.test(e))};
}

/** Origin and verification counts recorded with the approval (approval is never verification). */
export function verificationOf(bundle){
  const tested=bundle.patterns.filter(isTested).length;
  return {unverified:bundle.patterns.length-tested,tested};
}
