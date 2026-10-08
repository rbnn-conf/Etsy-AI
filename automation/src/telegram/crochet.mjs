// Telegram screens for crochet pattern content (ADR-041). Text and keyboards
// only; the workflow decides what is allowed. Creative approval and pattern
// approval are separate, and every screen says so. Approval for production
// is never described as testing.
import { encode } from './approvals.mjs';
import { nav, HOME, helpButton } from './ui.mjs';
import { requestedBrief, briefMismatch } from '../orchestrator/crochet.mjs';
import { hookText } from '../../../production/src/crochet/hook.mjs';

const act=(text,action,p)=>({text,callback_data:encode(action,p.product_id,p.review.nonce)});
const ask=(text,action,p)=>nav(text,'ask',p.product_id,action);
const pid=p=>`#${p.product_id}`;
const plural=(n,one,many=`${one}s`)=>`${n} ${n===1?one:many}`;

// The original request's count/terms lead the prompt, so a copied example never silently replaces them.
const asked=p=>requestedBrief(p.request?.text);
const askedLine=r=>`${r.pattern_count?`${r.pattern_count} patterns`:''}${r.pattern_count&&r.terminology?', ':''}${r.terminology?`${r.terminology} terms`:''}`;
export const briefPrompt=p=>{const r=asked(p);return [`🧶 Crochet patterns for ${pid(p)}`,'',
  ...(r?[`Your request: ${askedLine(r)}. To match it, reply: ${r.pattern_count??33}${r.terminology==='UK'?' UK':' US'}`,'']:[]),
  'Reply with the number of patterns and, if you want UK terms, "UK". Examples:','  33','  33 US','  33 UK','',
  'Optionally add collection guidance after a colon or on the next lines (creative direction for the plan, not a checklist), e.g.:',
  '  33 US: roses, daisies, sunflowers, tulips, lavender, fillers, leaves and stems','',
  'US crochet terms are used unless you ask for UK. This only records the brief: nothing is generated or charged yet.'].join('\n');};

/** CREATIVE_APPROVED crochet product, before its patterns are approved. */
export function patternsStartScreen(p,{estimate=null}={}){
  const b=p.crochet?.brief;
  return {text:[`🧶 Product ${pid(p)}: crochet pattern content`,'',
    'The approved style covers the look only. The crochet instructions need their own review and ✅ Approve Patterns before production.','',
    b?`Brief: ${plural(b.pattern_count,'pattern')}, ${b.terminology} crochet terms.${b.guidance?`\nGuidance:${b.guidance.slice(0,300)}${b.guidance.length>300?'…':''}`:''}`:'No brief yet: set the number of patterns first.',
    ...(b&&briefMismatch(b,asked(p)).length?[`⚠️ This brief differs from your request: ${briefMismatch(b,asked(p)).join('; ')}. Use ✏️ Change Pattern Count if that is not intended.`]:[]),
    b?'Draft candidate patterns with AI assistance (unverified drafts for your review), or supply your own crochet/patterns.json and validate it for free.':
      'Or supply your own crochet/patterns.json and validate it for free.',estimate].filter(Boolean).join('\n'),
    keyboard:{inline_keyboard:[...(b?[[ask(`🧶 Draft ${plural(b.pattern_count,'Candidate Pattern')} (AI)`,'cgen',p)]]:[]),
      [act(b?'✏️ Change Pattern Count':'🧶 Set Pattern Count & Terms','cbrief',p)],[act('📂 Validate Supplied patterns.json (free)','cval',p)],
      [nav('📦 Product','prod',p.product_id),...HOME]]}};
}

/** Why /produce refuses a crochet product whose visuals are not checked against the approved patterns (ADR-047). Details go to the log. */
export const visualsNotCheckedText=p=>[`❌ #${p.product_id} cannot enter production`,'Crochet visuals are not checked against the approved patterns.','',
  'Run Restyle and approve the new proofs first.'].join('\n');

/** Why /produce refuses a crochet product whose patterns are not approved. */
export function patternsNotReadyText(p){
  const c=p.crochet, v=c?.validation;
  return [`Product ${pid(p)} cannot go to production yet: its crochet patterns are not approved.`,'',
    'Creative approval covers the look only; Stage 2 never writes crochet instructions.',
    v?(v.ok?'The pattern source passed validation: review it and press ✅ Approve Patterns.':`The pattern source has ${plural(v.errors.length,'problem')}: redraft, revise or edit it, then validate again.`)
      :c?.brief?`Brief: ${plural(c.brief.pattern_count,'pattern')}, ${c.brief.terminology} terms. Next: draft or supply the patterns.`:'Next: set the number of patterns, then draft or supply them.'].join('\n');
}

/** The review message: validation result, per-pattern status, origin and verification. */
/** Unsupported characters (ADR-052), one line per location: concise; full details are in the log. */
export function unprintableLines(list){
  const by=new Map();
  for(const x of list)by.set(x.location,[...(by.get(x.location)??[]),`"${x.char}" ${x.code}`]);
  return ['❌ Pattern text contains unsupported characters',...[...by].slice(0,6).map(([at,cs])=>`${at}: ${cs.join(', ')}`),...(by.size>6?[`… and ${by.size-6} more places`]:[]),
    '','Fix the source and re-validate.','No model call was made.'];
}
export function patternReviewText(p,{bundle}){
  const c=p.crochet, v=c.validation, rows=c.patterns;
  const ai=bundle?.provenance?.origin==='ai-assisted-draft';
  const bad=rows.filter(r=>r.status==='invalid');
  const others=(v.errors??[]).filter(e=>!/cannot be printed by the document fonts/.test(e));
  return [`🧶 Product ${pid(p)}: pattern review`,'',
    bundle?`${bundle.title}: ${plural(bundle.patterns?.length??0,'pattern')} (${bundle.pattern_count} declared), ${bundle.terminology} terms.`:'The pattern source could not be read.',
    ai?'Origin: AI-assisted drafts. Verification: unverified (not test-crocheted). Approving them approves them for production only, never as tested.':
      bundle?`Origin: ${bundle.provenance?.origin??'unknown'}.`:null,'',
    ...(v.unprintable?.length?[...unprintableLines(v.unprintable),'']:[]),
    v.ok?'✅ Validation passed: materials, hooks, terminology, abbreviations, instructions, assembly and finishing are complete.':`❌ Validation failed: ${plural(v.errors.length,'problem')}.`,
    ...(v.ok?[]:others.slice(0,8).map(e=>`• ${e}`)),...(others.length>8?[`… and ${others.length-8} more (see the review document).`]:[]),'',
    ...rows.slice(0,40).map((r,i)=>`${r.status==='invalid'?'❌':'✅'} ${String(i+1).padStart(2,'0')} ${r.name}`),...(rows.length>40?[`… ${rows.length-40} more`]:[]),'',
    v.ok?'Read the review document, then ✅ Approve Patterns, or revise first.':bad.length&&c.plan?'Redraft the failing patterns (AI), revise one, or edit crochet/patterns.json and re-validate.':'Edit crochet/patterns.json and re-validate, or reject.']
    .filter(x=>x!==null).join('\n');
}
export function patternReviewKeyboard(p){
  const c=p.crochet, ok=c.validation?.ok, bad=c.patterns.some(r=>r.status==='invalid');
  return {inline_keyboard:[...(ok?[[act('✅ Approve Patterns','capprove',p)]]:[]),...(bad&&c.plan?[[ask('🔁 Redraft Invalid Patterns (AI)','cregen',p)]]:[]),
    ...(c.plan?[[ask('✏️ Revise a Pattern (AI)','crev',p)]]:[]),[act('🔄 Re-validate patterns.json (free)','cval',p)],[ask('❌ Reject Patterns','creject',p)],
    [helpButton(p.product_id),...HOME]]};
}
export const revisePrompt=p=>[`✏️ Revise a pattern of ${pid(p)}`,'',
  'Reply with the pattern number and what to change, e.g.:','  7: make the petals longer and give the stitch count for every round','',
  'Only that pattern is redrafted (1 AI text call). It stays an unverified draft; the whole source is validated again before you can approve it.'].join('\n');

/** A plain-text copy of the candidate patterns for the owner to read in full. */
export function reviewDocument(bundle,{validation}){
  const L=[];
  L.push(`${bundle.title}`,`${bundle.patterns.length} patterns · ${bundle.terminology} crochet terms · origin: ${bundle.provenance?.origin}`,
    bundle.provenance?.origin==='ai-assisted-draft'?'AI-assisted drafts for review. Unverified: not test-crocheted.':'', `Validation: ${validation.ok?'passed':`FAILED (${validation.errors.length} problems)`}`,'');
  if(!validation.ok)L.push('PROBLEMS',...validation.errors.map(e=>`- ${e}`),'');
  bundle.patterns.forEach((x,i)=>{
    L.push('='.repeat(60),`${String(i+1).padStart(2,'0')}  ${x.name}  (${x.pattern_id})`,`${x.category} · ${x.difficulty} · ${x.finished_size}`,
      `Yarn: ${(x.yarn??[]).map(y=>[y.description,y.colour,y.amount].filter(Boolean).join(', ')).join(' | ')} (${x.yarn_weight})`,
      `Hook: ${x.requires_hook===false?'none':x.hook_size?hookText(x.hook_size):'MISSING'}`,
      `Also needed: ${(x.additional_materials??[]).join(', ')}`,`Gauge: ${x.gauge}`,
      `Abbreviations: ${Object.entries(x.abbreviations??{}).map(([k,m])=>`${k} = ${m}`).join('; ')}`,'');
    for(const s of x.instructions??[]){L.push(`${s.heading}`);for(const st of s.steps??[])L.push(`  ${st.label?`${st.label}: `:''}${st.text}${st.stitch_count?` (${st.stitch_count})`:''}`);L.push('');}
    if(x.assembly?.length)L.push('Assembly',...x.assembly.map((a,j)=>`  ${j+1}. ${a}`),'');
    L.push('Finishing',...(x.finishing??[]).map((a,j)=>`  ${j+1}. ${a}`),'');
    if(x.notes?.length)L.push('Notes',...x.notes.map(n=>`  - ${n}`),'');
    L.push(`Verification: ${x.verification_status??'not stated'}`,'');
  });
  return L.join('\n');
}
