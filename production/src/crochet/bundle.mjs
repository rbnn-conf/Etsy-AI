// Crochet pattern bundle: the approved SOURCE CONTENT contract (ADR-040).
//
// Crochet instructions are functional instructions. Stage 2 formats approved
// source content deterministically; it never writes, completes, repairs or
// "fills" a pattern. This module only VALIDATES the owner-approved source
// file (products/<id>/crochet/patterns.json). Anything missing, invalid or
// incomplete is an error, named by path, and production stops.
//
// A pattern is never described as tested unless its `testing` record carries
// explicit evidence (who, when, what).
//
// Pure: no I/O, no network, no model. Shape documented in
// production/schemas/crochet-pattern-bundle.schema.json (kept in sync by test).
import { HandoffError } from '../errors.mjs';

export const CROCHET_FORMAT='crochet-pattern-bundle';
export const CROCHET_SCHEMA_VERSION=1;
// Where Stage 1 will keep the owner-approved pattern source (Prompt 2 wires the approval).
export const PATTERN_SOURCE='crochet/patterns.json';
export const TERMINOLOGIES=Object.freeze(['US','UK']);
// Craft Yarn Council skill levels and standard yarn weights.
export const SKILL_LEVELS=Object.freeze(['beginner','easy','intermediate','experienced']);
export const YARN_WEIGHTS=Object.freeze(['0-lace','1-super-fine','2-fine','3-light','4-medium','5-bulky','6-super-bulky','7-jumbo']);
export const DELIVERY=Object.freeze(['digital','printable']);
// ai-assisted-draft (ADR-041): model-drafted candidate instructions. A DRAFT until the
// owner approves it, and never "tested" or "verified" without separate evidence.
export const PROVENANCE_ORIGINS=Object.freeze(['owner-authored','commissioned','licensed','ai-assisted-draft']);
export const AI_ORIGIN='ai-assisted-draft';
export const TESTING_STATUSES=Object.freeze(['not-tested','tested']);
// verification_status: 'unverified' unless a testing record with evidence says 'tested'.
// Owner approval for production is a separate record (product.json crochet.approval), never a verification.
export const VERIFICATION_STATUSES=Object.freeze(['unverified','tested']);
export const HOOK_MM=Object.freeze({min:0.5,max:30});

export const BUNDLE_REQUIRED=Object.freeze(['schema_version','format','title','theme','audience','skill_level','delivery','style','pattern_count','terminology','provenance','patterns']);
export const BUNDLE_OPTIONAL=Object.freeze(['abbreviations','notes','combinations']);
export const PATTERN_REQUIRED=Object.freeze(['pattern_id','name','category','difficulty','finished_size','yarn','yarn_weight','additional_materials',
  'stitches_used','abbreviations','gauge','instructions','finishing']);
export const PATTERN_OPTIONAL=Object.freeze(['hook_size','requires_hook','assembly','assembly_required','notes','testing','origin','verification_status']);

// Standard crochet abbreviations detected in instruction text. Any of these
// used in a pattern must be defined in its own or the bundle's glossary.
// Each token lists the glossary keys that define it.
const VOCAB=Object.freeze({ch:['ch'],sl:['sl st','sl','slst'],slst:['sl st','slst'],ss:['ss','sl st'],sc:['sc'],hdc:['hdc'],htr:['htr'],dc:['dc'],tr:['tr'],
  dtr:['dtr'],ttr:['ttr'],trtr:['trtr'],inc:['inc'],dec:['dec'],invdec:['invdec'],sc2tog:['sc2tog'],dc2tog:['dc2tog'],hdc2tog:['hdc2tog'],blo:['blo'],flo:['flo'],
  mr:['mr'],st:['st'],sts:['sts','st'],rnd:['rnd'],rnds:['rnds','rnd'],rep:['rep'],sk:['sk'],sp:['sp'],yo:['yo'],yoh:['yoh'],fo:['fo'],beg:['beg'],
  tog:['tog'],fpdc:['fpdc'],bpdc:['bpdc']});
// Stitch names that exist in only one terminology (US sc = UK dc, US hdc = UK htr).
const TERMINOLOGY_ONLY=Object.freeze({US:['sc','hdc','sc2tog','hdc2tog'],UK:['htr']});
// Placeholder text is never accepted as instructions.
const PLACEHOLDER=/\b(todo|tbd|tbc|lorem ipsum|placeholder|fill me in|instructions go here)\b|^\s*(\.{2,}|…|x{3,}|-+)\s*$/i;
// Square brackets are crochet notation for a repeated or grouped stitch sequence ("[sc in next st, inc in next st]
// rep 6 times", "[dc, ch 1, dc] in next ch-sp"). A bracket is a placeholder unless it contains a crochet
// abbreviation (standard or the pattern's own) and no editorial marker ("[insert instructions here]", "[TBD]").
const EDITORIAL=/\b(here|tbd|tbc|todo|placeholder|lorem|fill\s+(me\s+)?in|as\s+needed|description|pattern\s+text|xxx+|etc)\b/i;
/** Every bracketed group, nested groups included ("[a, [b] twice]" -> "a, [b] twice", "b"). Unbalanced text is not a group. */
function bracketGroups(t){
  const out=[], open=[];
  for(let i=0;i<t.length;i++){
    if(t[i]==='[')open.push(i);
    else if(t[i]===']'&&open.length){const s=open.pop();out.push(t.slice(s+1,i));}
  }
  return out;
}
const crochetGroup=(g,known)=>!EDITORIAL.test(g)&&(String(g).toLowerCase().replace(/\bsl\s+st\b/g,'slst').replace(/(\d)([a-z])/g,'$1 $2').match(/[a-z0-9-]+/g)??[])
  .some(w=>known.has(w)||w.split('-').some(x=>x&&known.has(x)));
/** Placeholder text: an editorial marker, a filler line, or a bracket that is not a crochet stitch sequence. */
export function isPlaceholderText(v,known=new Set(Object.keys(VOCAB))){
  return PLACEHOLDER.test(v)||bracketGroups(v).some(g=>!crochetGroup(g,known));
}
// A customer-facing claim that patterns were tested or verified.
const TESTED_CLAIM=/\b(tested|test[- ]crocheted|tester[- ]approved|verified)\b/i;
// Claims no evidence can support in a name (ADR-041).
const NEVER_CLAIM=/\b(guaranteed|error[- ]free|mistake[- ]free|foolproof)\b/i;
const DATE=/^\d{4}-\d{2}-\d{2}$/, ID=/^[a-z0-9][a-z0-9-]{0,59}$/;

const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const nonEmpty=v=>typeof v==='string'&&v.trim().length>0;
/** Glossary key normalisation: case, spacing and a trailing "(s)". */
export const glossaryKey=k=>String(k).toLowerCase().replace(/\(s\)/g,'').replace(/\s+/g,' ').trim();
// "sl st" is one abbreviation, not "sl" + "st".
const tokens=t=>String(t).toLowerCase().replace(/\bsl\s+st\b/g,'slst').match(/[a-z0-9]+/g)??[];

/**
 * The standard abbreviations (VOCAB tokens) used in instruction texts, in first-use order. A defined multi-word
 * abbreviation ("hdc dec") is one abbreviation: words used only inside it are not counted on their own.
 */
export function usedAbbreviations(texts,definedKeys=[]){
  const escape=k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/ /g,'\\s+');
  const compounds=definedKeys.map(glossaryKey).filter(k=>/\s/.test(k)&&k!=='sl st').sort((a,b)=>b.length-a.length)
    .map(k=>new RegExp(`(?<![a-z0-9])${escape(k)}(?![a-z0-9])`,'gi'));
  const out=new Set();
  for(const t of texts){
    const rest=compounds.reduce((x,re)=>x.replace(re,' '),String(t));
    for(const w of tokens(rest))if(VOCAB[w])out.add(w);
  }
  return [...out];
}
/** The glossary keys that define a standard abbreviation token, preferred first ("slst" -> ["sl st", "slst"]). */
export const abbreviationKeys=w=>[...(VOCAB[w]??[])];

// Pieces vs sections (ADR-051). Read from the FIRST step of a section only; explicit wording, never guessed.
const firstStep=s=>String((Array.isArray(s?.steps)?s.steps.find(st=>nonEmpty(st?.text)):null)?.text??'');
// The section carries on from earlier work: yarn joined into existing stitches, or work continued without a new start.
const CONTINUES=/^\s*(?:(?:re)?join\b|attach\s+(?:the\s+)?(?:[\w-]+\s+){0,3}yarn\b|working\s+(?:along|into|in|around|across|over|on)\b|continu|do\s+not\s+fasten|without\s+fastening|pick\s+up\b|with\s+(?:the\s+)?(?:[\w-]+\s+){0,3}yarn,?\s+join\b)/i;
// The section starts a new piece: a foundation chain, a magic ring or a slip knot.
const NEW_START=/\b(?:ch(?:ain)?\s+\d+|mr|magic\s+ring|adjustable\s+ring|slip\s+knot|foundation\s+ch(?:ain)?)\b/i;
const NUMBER_WORDS={two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,twelve:12};
// "Petals (make 6)", "Leaves — make 2", a first step "Make 6."
const MAKE_SEVERAL=/\bmake\s+(\d+|two|three|four|five|six|seven|eight|nine|ten|twelve)\b(?!\s+(?:sc|hdc|dc|tr|ch|sl|st|sts|stitches|rounds?|rows?|rnds?)\b)/i;
const makesSeveral=s=>{const m=MAKE_SEVERAL.exec(`${s?.heading??''} ${/^\s*make\s+\w+\s*\./i.test(firstStep(s))?firstStep(s):''}`);
  return !!m&&(Number(m[1])||NUMBER_WORDS[m[1].toLowerCase()])>=2;};
export const continuesWork=s=>CONTINUES.test(firstStep(s));
/**
 * The headings of the separate pieces a pattern clearly makes, when it makes more than one (else []).
 * Only with several sections: a later section is a new piece when it starts with a foundation and does not join
 * existing work; a "make N" section (N >= 2) is several pieces.
 */
export function detachedPieces(sections){
  if(!Array.isArray(sections)||sections.length<2)return [];
  const starts=sections.filter((s,i)=>i===0||(!continuesWork(s)&&NEW_START.test(firstStep(s))));
  const several=sections.filter(makesSeveral);
  return starts.length>=2||several.length?[...new Set([...starts,...several])].map(s=>String(s.heading??'')):[];
}

function fields(obj,required,optional,path,e){
  for(const k of Object.keys(obj))if(!required.includes(k)&&!optional.includes(k))e.push(`${path}.${k}: unexpected field`);
  for(const k of required)if(!(k in obj))e.push(`${path}.${k}: required`);
}
function strings(v,path,e,{min=0}={}){
  if(!Array.isArray(v)){e.push(`${path}: must be an array of strings`);return [];}
  if(v.length<min)e.push(`${path}: needs at least ${min} item${min===1?'':'s'}`);
  v.forEach((s,i)=>{if(!nonEmpty(s))e.push(`${path}[${i}]: must be a non-empty string`);});
  return v.filter(nonEmpty);
}
function text(v,path,e,known){
  if(!nonEmpty(v)){e.push(`${path}: must be a non-empty string`);return false;}
  if(isPlaceholderText(v,known)){e.push(`${path}: placeholder text is not a crochet instruction (${JSON.stringify(v.slice(0,40))})`);return false;}
  return true;
}
function glossary(v,path,e){
  const out=new Map();
  if(!isObj(v)){e.push(`${path}: must be an object of abbreviation -> meaning`);return out;}
  for(const [k,m] of Object.entries(v)){
    if(!nonEmpty(k))e.push(`${path}: empty abbreviation`);
    else if(!nonEmpty(m))e.push(`${path}.${k}: the meaning must be a non-empty string`);
    else out.set(glossaryKey(k),m);
  }
  return out;
}

/** Every piece of instruction text in a pattern (instructions, assembly, finishing). */
function instructionTexts(p){
  const out=[];
  for(const s of Array.isArray(p.instructions)?p.instructions:[])for(const st of Array.isArray(s?.steps)?s.steps:[])out.push(st?.text);
  for(const k of ['assembly','finishing'])if(Array.isArray(p[k]))out.push(...p[k]);
  return out.filter(nonEmpty);
}

function validatePattern(p,i,bundle,shared,e){
  const path=`$.patterns[${i}]`;
  if(!isObj(p)){e.push(`${path}: must be an object`);return;}
  fields(p,PATTERN_REQUIRED,PATTERN_OPTIONAL,path,e);
  if(!(typeof p.pattern_id==='string'&&ID.test(p.pattern_id)))e.push(`${path}.pattern_id: must be a lowercase slug (a-z, 0-9, -)`);
  for(const k of ['name','category','finished_size','gauge'])if(!nonEmpty(p[k]))e.push(`${path}.${k}: must be a non-empty string`);
  if(!SKILL_LEVELS.includes(p.difficulty))e.push(`${path}.difficulty: must be one of ${SKILL_LEVELS.join(', ')}`);
  else if(Array.isArray(bundle.skill_level)&&!bundle.skill_level.includes(p.difficulty))e.push(`${path}.difficulty: ${p.difficulty} is outside the bundle's skill_level (${bundle.skill_level.join(', ')})`);
  // Materials.
  if(!Array.isArray(p.yarn)||!p.yarn.length)e.push(`${path}.yarn: at least one yarn is required`);
  else p.yarn.forEach((y,j)=>{
    const yp=`${path}.yarn[${j}]`;
    if(!isObj(y)){e.push(`${yp}: must be an object`);return;}
    fields(y,['description'],['colour','amount'],yp,e);
    if(!nonEmpty(y.description))e.push(`${yp}.description: must be a non-empty string`);
    for(const k of ['colour','amount'])if(k in y&&y[k]!==null&&!nonEmpty(y[k]))e.push(`${yp}.${k}: must be a non-empty string or null`);
  });
  if(!YARN_WEIGHTS.includes(p.yarn_weight))e.push(`${path}.yarn_weight: must be one of ${YARN_WEIGHTS.join(', ')}`);
  strings(p.additional_materials,`${path}.additional_materials`,e,{min:1});
  // Hook: required unless the pattern explicitly needs none.
  if('requires_hook' in p&&typeof p.requires_hook!=='boolean')e.push(`${path}.requires_hook: must be true or false`);
  if(p.requires_hook!==false){
    const h=p.hook_size;
    if(h===undefined||h===null)e.push(`${path}.hook_size: required (set requires_hook: false only for a pattern that uses no hook)`);
    else if(!isObj(h))e.push(`${path}.hook_size: must be {mm, us}`);
    else{
      fields(h,['mm'],['us'],`${path}.hook_size`,e);
      if(!(typeof h.mm==='number'&&h.mm>=HOOK_MM.min&&h.mm<=HOOK_MM.max))e.push(`${path}.hook_size.mm: must be a number of millimetres (${HOOK_MM.min}-${HOOK_MM.max})`);
      if('us' in h&&h.us!==null&&!nonEmpty(h.us))e.push(`${path}.hook_size.us: must be a non-empty string or null`);
    }
  }
  // Abbreviations: the stitches listed and every standard abbreviation in the text must be defined.
  const own=glossary(p.abbreviations,`${path}.abbreviations`,e), defined=k=>own.has(k)||shared.has(k);
  const used=strings(p.stitches_used,`${path}.stitches_used`,e,{min:1});
  for(const s of used)if(!defined(glossaryKey(s)))e.push(`${path}.stitches_used: "${s}" is not defined in the pattern or bundle abbreviations`);
  // Crochet words for the bracket check: the standard abbreviations and every word of a defined one ("puff", "hdc dec").
  const known=new Set([...Object.keys(VOCAB),...[...own.keys(),...shared.keys()].flatMap(k=>k.match(/[a-z0-9]+/g)??[])]);
  const texts=instructionTexts(p), seen=new Set();
  for(const t of texts)for(const w of tokens(t))if(VOCAB[w])seen.add(w);
  for(const w of usedAbbreviations(texts,[...own.keys(),...shared.keys()]))
    if(!VOCAB[w].some(defined))e.push(`${path}: abbreviation "${w}" is used in the instructions but not defined`);
  // Terminology: no stitch name that exists only in the other terminology.
  const other=TERMINOLOGIES.find(t=>t!==bundle.terminology);
  if(TERMINOLOGIES.includes(bundle.terminology)){
    const wrong=[...seen,...used.map(glossaryKey)].filter(w=>TERMINOLOGY_ONLY[other].includes(w));
    for(const w of new Set(wrong))e.push(`${path}: "${w}" is ${other} terminology; the bundle declares ${bundle.terminology}`);
  }
  // Instructions: at least one section, each with non-empty, non-placeholder steps.
  if(!Array.isArray(p.instructions)||!p.instructions.length)e.push(`${path}.instructions: at least one section is required (Stage 2 never writes instructions)`);
  else p.instructions.forEach((s,j)=>{
    const sp=`${path}.instructions[${j}]`;
    if(!isObj(s)){e.push(`${sp}: must be {heading, steps}`);return;}
    fields(s,['heading','steps'],[],sp,e);
    text(s.heading,`${sp}.heading`,e,known);
    if(!Array.isArray(s.steps)||!s.steps.length){e.push(`${sp}.steps: at least one step is required`);return;}
    s.steps.forEach((st,k)=>{
      const tp=`${sp}.steps[${k}]`;
      if(!isObj(st)){e.push(`${tp}: must be {label, text, stitch_count}`);return;}
      fields(st,['text'],['label','stitch_count'],tp,e);
      text(st.text,`${tp}.text`,e,known);
      if('label' in st&&st.label!==null&&!nonEmpty(st.label))e.push(`${tp}.label: must be a non-empty string or null`);
      if('stitch_count' in st&&st.stitch_count!==null&&!(Number.isInteger(st.stitch_count)&&st.stitch_count>0))e.push(`${tp}.stitch_count: must be a positive integer or null`);
    });
  });
  // Assembly (ADR-051): a section is not a piece. Required when declared, or when separate pieces are made:
  //   assembly_required true   always;
  //   assembly_required false  only when the text clearly makes detached pieces (detachedPieces);
  //   not declared             when there are several sections, unless every later one clearly continues the work.
  if('assembly_required' in p&&typeof p.assembly_required!=='boolean')e.push(`${path}.assembly_required: must be true or false`);
  const sections=Array.isArray(p.instructions)?p.instructions.filter(isObj):[];
  const assembly='assembly' in p?strings(p.assembly,`${path}.assembly`,e):[];
  const detached=p.assembly_required===false?detachedPieces(sections):null;
  const why=p.assembly_required===true?'assembly_required is true'
    :p.assembly_required===false?(detached.length?`assembly_required is false, but separate pieces are made: ${detached.map(h=>JSON.stringify(h)).join(', ')}`:null)
    :sections.length>1&&!sections.slice(1).every(continuesWork)?`${sections.length} pieces are made`:null;
  if(why&&!assembly.length)e.push(`${path}.assembly: required (${why}); Stage 2 never writes assembly instructions`);
  assembly.forEach((a,j)=>text(a,`${path}.assembly[${j}]`,e,known));
  strings(p.finishing,`${path}.finishing`,e,{min:1}).forEach((f,j)=>text(f,`${path}.finishing[${j}]`,e,known));
  if('notes' in p)strings(p.notes,`${path}.notes`,e);
  // Origin and verification status (ADR-041). AI-assisted drafts must say they are unverified.
  const origin=p.origin??bundle.provenance?.origin;
  if('origin' in p&&!PROVENANCE_ORIGINS.includes(p.origin))e.push(`${path}.origin: must be one of ${PROVENANCE_ORIGINS.join(', ')}`);
  if('verification_status' in p&&!VERIFICATION_STATUSES.includes(p.verification_status))e.push(`${path}.verification_status: must be one of ${VERIFICATION_STATUSES.join(', ')}`);
  if(origin===AI_ORIGIN&&!('verification_status' in p))e.push(`${path}.verification_status: required for an ${AI_ORIGIN} pattern (unverified unless tested with evidence)`);
  if(p.verification_status==='tested'&&p.testing?.status!=='tested')e.push(`${path}.verification_status: "tested" needs a testing record with status tested and evidence`);
  if(p.testing?.status==='tested'&&'verification_status' in p&&p.verification_status!=='tested')e.push(`${path}.verification_status: the testing record says tested; set verification_status to "tested" or remove the record`);
  // Testing: "tested" needs explicit evidence.
  if('testing' in p){
    const t=p.testing, tp=`${path}.testing`;
    if(!isObj(t))e.push(`${tp}: must be an object`);
    else{
      fields(t,['status'],['tested_by','tested_on','evidence'],tp,e);
      if(!TESTING_STATUSES.includes(t.status))e.push(`${tp}.status: must be one of ${TESTING_STATUSES.join(', ')}`);
      if(t.status==='tested'){
        if(!nonEmpty(t.tested_by))e.push(`${tp}.tested_by: required when status is tested`);
        if(!(typeof t.tested_on==='string'&&DATE.test(t.tested_on)&&!Number.isNaN(Date.parse(t.tested_on))))e.push(`${tp}.tested_on: required when status is tested (YYYY-MM-DD)`);
        if(!nonEmpty(t.evidence))e.push(`${tp}.evidence: required when status is tested (what was made and checked)`);
      }
    }
  }
}

/** Patterns with explicit testing evidence. Anything else is untested. */
export const isTested=p=>p?.testing?.status==='tested'&&nonEmpty(p.testing.tested_by)&&nonEmpty(p.testing.evidence)&&DATE.test(p.testing.tested_on??'');

/**
 * Validate a crochet pattern bundle source. Never repairs or fills anything.
 * @returns {ok, errors:string[]}
 */
export function validateCrochetBundle(b){
  const e=[];
  if(!isObj(b))return {ok:false,errors:['$: the pattern bundle must be an object']};
  fields(b,BUNDLE_REQUIRED,BUNDLE_OPTIONAL,'$',e);
  if(b.schema_version!==CROCHET_SCHEMA_VERSION)e.push(`$.schema_version: must be ${CROCHET_SCHEMA_VERSION}`);
  if(b.format!==CROCHET_FORMAT)e.push(`$.format: must be "${CROCHET_FORMAT}"`);
  for(const k of ['title','theme'])if(!nonEmpty(b[k]))e.push(`$.${k}: must be a non-empty string`);
  strings(b.audience,'$.audience',e,{min:1});
  strings(b.style,'$.style',e);
  if(!Array.isArray(b.skill_level)||!b.skill_level.length||!b.skill_level.every(s=>SKILL_LEVELS.includes(s)))e.push(`$.skill_level: a non-empty list of ${SKILL_LEVELS.join(', ')}`);
  if(!Array.isArray(b.delivery)||!b.delivery.length||!b.delivery.every(d=>DELIVERY.includes(d)))e.push(`$.delivery: a non-empty list of ${DELIVERY.join(', ')}`);
  if(!TERMINOLOGIES.includes(b.terminology))e.push(`$.terminology: must be declared as ${TERMINOLOGIES.join(' or ')}`);
  if(!isObj(b.provenance))e.push('$.provenance: must be {author, origin, notes}');
  else{
    fields(b.provenance,['author','origin'],['notes'],'$.provenance',e);
    if(!nonEmpty(b.provenance.author))e.push('$.provenance.author: must be a non-empty string (who wrote these instructions)');
    if(!PROVENANCE_ORIGINS.includes(b.provenance.origin))e.push(`$.provenance.origin: must be one of ${PROVENANCE_ORIGINS.join(', ')}`);
  }
  if('notes' in b)strings(b.notes,'$.notes',e);
  const shared='abbreviations' in b?glossary(b.abbreviations,'$.abbreviations',e):new Map();
  // Patterns: present, counted exactly, unique identity.
  const pats=Array.isArray(b.patterns)?b.patterns:null;
  if(!pats||!pats.length)e.push('$.patterns: at least one pattern is required');
  if(!(Number.isInteger(b.pattern_count)&&b.pattern_count>0))e.push('$.pattern_count: must be a positive integer');
  else if(pats&&pats.length!==b.pattern_count)e.push(`$.pattern_count: ${b.pattern_count} declared but ${pats.length} pattern${pats.length===1?' is':'s are'} supplied`);
  if(pats){
    const dup=(key,norm)=>{const seen=new Map();pats.forEach((p,i)=>{const v=isObj(p)&&typeof p[key]==='string'?norm(p[key]):null;if(!v)return;
      if(seen.has(v))e.push(`$.patterns[${i}].${key}: duplicate of $.patterns[${seen.get(v)}] (${JSON.stringify(p[key])})`);else seen.set(v,i);});};
    dup('pattern_id',v=>v);dup('name',v=>v.trim().toLowerCase().replace(/\s+/g,' '));
    pats.forEach((p,i)=>validatePattern(p,i,b,shared,e));
  }
  // Optional combination guide (e.g. bouquets): only patterns of this bundle, never a new instruction.
  if('combinations' in b){
    const c=b.combinations, ids=new Set((pats??[]).map(p=>p?.pattern_id));
    if(!isObj(c))e.push('$.combinations: must be {title, items}');
    else{
      fields(c,['title','items'],['intro'],'$.combinations',e);
      if(!nonEmpty(c.title))e.push('$.combinations.title: must be a non-empty string');
      if('intro' in c&&c.intro!==null&&!nonEmpty(c.intro))e.push('$.combinations.intro: must be a non-empty string or null');
      if(!Array.isArray(c.items)||!c.items.length)e.push('$.combinations.items: at least one combination is required');
      else c.items.forEach((it,i)=>{
        const ip=`$.combinations.items[${i}]`;
        if(!isObj(it)){e.push(`${ip}: must be {name, patterns, notes}`);return;}
        fields(it,['name','patterns'],['notes'],ip,e);
        if(!nonEmpty(it.name))e.push(`${ip}.name: must be a non-empty string`);
        if(!Array.isArray(it.patterns)||!it.patterns.length)e.push(`${ip}.patterns: at least one pattern is required`);
        else it.patterns.forEach((x,j)=>{
          if(!isObj(x)||!ids.has(x.pattern_id))e.push(`${ip}.patterns[${j}]: "${x?.pattern_id}" is not a pattern in this bundle`);
          else if(!(Number.isInteger(x.quantity)&&x.quantity>0))e.push(`${ip}.patterns[${j}].quantity: must be a positive integer`);
          else fields(x,['pattern_id','quantity'],[],`${ip}.patterns[${j}]`,e);
        });
        if('notes' in it)strings(it.notes,`${ip}.notes`,e);
      });
    }
  }
  // No tested claim in customer-facing names unless every pattern has evidence; never an unprovable guarantee.
  const names=[['$.title',b.title],...(pats??[]).map((p,i)=>[`$.patterns[${i}].name`,p?.name])];
  if(pats&&!pats.every(isTested))for(const [path,v] of names)
    if(typeof v==='string'&&TESTED_CLAIM.test(v))e.push(`${path}: claims the patterns are tested, but not every pattern has testing evidence`);
  for(const [path,v] of names)if(typeof v==='string'&&NEVER_CLAIM.test(v))e.push(`${path}: "${NEVER_CLAIM.exec(v)[0]}" is a claim no evidence can support`);
  return {ok:!e.length,errors:e};
}

/**
 * What marketing and the owner may truthfully say about the patterns: origin,
 * verification and testing counts. "Approved for production" is never "tested".
 */
export function crochetIntegrity(b){
  const pats=b.patterns, origins={}, verification={unverified:0,tested:0};
  for(const p of pats){
    const o=p.origin??b.provenance.origin;origins[o]=(origins[o]??0)+1;
    verification[isTested(p)?'tested':'unverified']++;
  }
  return {origin:b.provenance.origin,origins,verification,all_tested:verification.tested===pats.length,any_ai_assisted:!!origins[AI_ORIGIN],
    tested_pattern_ids:pats.filter(isTested).map(p=>p.pattern_id)};
}

/** Validate or throw a clear, non-retryable HandoffError listing every problem. */
export function assertCrochetBundle(b,label=PATTERN_SOURCE){
  const {ok,errors}=validateCrochetBundle(b);
  if(ok)return b;
  const err=new HandoffError(`${label} is not a complete crochet pattern bundle (${errors.length} problem${errors.length===1?'':'s'}); Stage 2 never invents crochet instructions: ${errors.slice(0,8).join('; ')}${errors.length>8?` (+${errors.length-8} more)`:''}`);
  err.errors=errors;
  throw err;
}
