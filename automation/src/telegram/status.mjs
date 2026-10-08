// Owner status / progress texts (presentation only, pure functions).
// The live status message of a running step, its final state, and the one
// owner reminder. Progress is READ from the persisted product (proof images,
// drafted patterns, book pages, Stage 2-4 sub-states) plus optional workflow
// notes; nothing here calls a model, Telegram, Etsy or the store, and nothing
// here decides what the pipeline does next.
//
// The four owner states:
//   🟢 RUNNING          no action needed
//   🟠 ACTION REQUIRED  waiting for the owner ("Pipeline paused until you respond.")
//   🔴 FAILED           intervention required
//   ✅ COMPLETE
import { shortError } from './ui.mjs';

export const OWNER=Object.freeze({running:'🟢',action:'🟠',failed:'🔴',complete:'✅',reminder:'🔔'});
export const PAUSED='Pipeline paused until you respond.';
const pad2=n=>String(n).padStart(2,'0');

/** "45s", "4m 12s", "1h 03m". Never negative, never a countdown. */
export function formatElapsed(ms){
  const s=Math.max(0,Math.floor(Number(ms)/1000)||0);
  if(s<60)return `${s}s`;
  const m=Math.floor(s/60);
  if(m<60)return `${m}m ${pad2(s%60)}s`;
  return `${Math.floor(m/60)}h ${pad2(m%60)}m`;
}
/** "██████░░░░" for a KNOWN total only; null when the total is unknown. */
export function progressBar(done,total,width=10){
  if(!Number.isInteger(total)||total<=0||!Number.isInteger(done))return null;
  const d=Math.min(Math.max(done,0),total), full=Math.round(d/total*width);
  return '█'.repeat(full)+'░'.repeat(width-full);
}

// ---------- owner gates (persisted product states that wait for the owner) ----------
// label: what is ready; wait: what does not happen until the owner responds.
export const OWNER_GATES=Object.freeze({
  AWAITING_CONCEPT_SELECTION:{label:'Concept previews are ready.',wait:'Nothing continues until you choose a concept.'},
  AWAITING_CREATIVE_APPROVAL:{label:'Style proofs are ready.',wait:'Nothing continues until you approve, give feedback or regenerate.'},
  AWAITING_BOOK_APPROVAL:{label:'Full book review is ready.',wait:'Production will not start until you approve the full book.'},
  AWAITING_PATTERN_APPROVAL:{label:'Pattern review is ready.',wait:'Production will not continue until you approve or revise.'},
  AWAITING_VISUALS_APPROVAL:{label:'Crochet visual set is ready for review.',wait:'Production will not use these images until you approve them.'},
  AWAITING_PRODUCTION_APPROVAL:{label:'Production files are ready.',wait:'Marketing will not start until you approve production.'},
  AWAITING_MARKETING_APPROVAL:{label:'Listing and marketing images are ready.',wait:'The Etsy draft will not be created until you approve.'},
  AWAITING_ETSY_PUBLISH_APPROVAL:{label:'The Etsy draft is ready for review.',wait:'Nothing is published unless you choose to.'}
});
const STEP_NAME={ideation:'concepts','concept-previews':'concept previews',specification:'specification',proofs:'style proofs','direction-change':'creative direction',
  restyle:'restyle',patterns:'crochet patterns',visuals:'crochet visuals',book:'full book',production:'production','marketing-compare':'hero comparison',marketing:'marketing',
  etsy:'Etsy draft','etsy-section':'Etsy shop section','etsy-refresh':'Etsy draft check','etsy-publish':'Etsy publish'};
export const stepName=step=>STEP_NAME[step]??String(step??'unknown step');

/**
 * The owner wait a persisted product is in, or null. `key` changes whenever
 * the product changes state (the owner responded), so a reminder is tied to
 * exactly one waiting state. Only true gates and FAILED count: a product the
 * owner simply has not moved on (e.g. CREATIVE_APPROVED) is not nagged.
 */
export function ownerWait(p){
  if(!p||p.lock)return null;
  const gate=OWNER_GATES[p.status];
  if(!gate&&p.status!=='FAILED')return null;
  const entered=p.status_history?.findLast?.(h=>h.to===p.status)?.at??p.updated_at;
  const since=p.status==='FAILED'?(p.last_error?.at??entered):entered;
  if(!since)return null;
  const label=gate?gate.label:`Stopped at: ${stepName(p.last_error?.step)}.`;
  const wait=gate?gate.wait:'Nothing continues until you retry or cancel.';
  return {key:`${p.status}@${since}`,since,status:p.status,label,wait,failed:p.status==='FAILED'};
}

// ---------- progress, derived from persisted state ----------
const last=(arr,by)=>[...(arr??[])].filter(by??Boolean).at(-1);
const latestBy=(arr,field)=>[...(arr??[])].filter(x=>x?.[field]).sort((a,b)=>String(a[field]).localeCompare(String(b[field]))).at(-1);
const HAVE=['reused','generated'];
const ETSY_STAGES={MARKETING_APPROVED:[1,'Preparing listing and delivery files'],ETSY_PREPARING:[1,'Preparing listing and delivery files'],
  ETSY_DRAFT_CREATED:[2,'Draft created on Etsy'],ETSY_ASSETS_UPLOADING:[3,'Uploading images and files'],ETSY_DRAFT_VERIFYING:[4,'Verifying the draft on Etsy']};

/**
 * {icon,label,done?,total?,unit?,stage?:[n,of],last?}. Totals appear only
 * where the pipeline knows them; a note from the workflow (an item counter it
 * holds outside product.json) applies only while the product is still in the
 * state it was given in.
 */
export function progressOf(p,step,note=null){
  const n=note&&(!note.status||note.status===p?.status)?note:null;
  const base=deriveProgress(p??{},step);
  return n?{...base,...Object.fromEntries(Object.entries(n).filter(([k,v])=>k!=='status'&&v!==undefined))}:base;
}
function deriveProgress(p,step){
  switch(step){
    case 'ideation':
      return {icon:'💡',label:p.reference_files?.length&&!p.visual_direction?'Analysing your reference images':'Writing three product concepts'};
    case 'concept-previews':{
      const b=p.concepts?.batches?.at(-1), rec=p.concept_previews?.batches?.find(x=>x.batch===b?.batch);
      const im=last(rec?.images), c=im&&b?.concepts?.find(x=>x.concept_id===im.concept_id);
      return {icon:'🖼',label:'Painting concept previews',unit:'Previews',done:rec?.images?.length??0,total:b?.concepts?.length??null,last:c?`Concept ${c.concept_id} · ${c.proposed_name}`:null};
    }
    case 'specification':return {icon:'📝',label:'Writing the product specification'};
    case 'direction-change':return {icon:'🎨',label:'Updating the creative direction'};
    case 'restyle':return {icon:'🎨',label:'Restyling from the approved patterns'};
    case 'proofs':{
      const a=p.proofs?.attempts?.at(-1), im=last(a?.images), pg=im&&p.pages?.find(x=>x.page_number===im.page_number);
      return {icon:'🎨',label:'Painting style proofs',unit:'Proofs',done:a?.images?.length??0,total:p.proofs?.selected_pages?.length||null,last:pg?pg.title:null};
    }
    case 'patterns':{
      const c=p.crochet??{}, list=c.patterns??[];
      if(c.generation?.mode==='validate')return {icon:'🧶',label:'Validating the pattern file'};
      if(!c.plan)return {icon:'🧶',label:`Planning ${c.brief?.pattern_count??''} crochet patterns`.replace('  ',' ')};
      const drafted=list.filter(e=>e.file).length, e=latestBy(list,'generated_at'), i=e?list.indexOf(e):-1;
      const lastName=e?`${pad2(i+1)} ${e.name}`:null;
      if(c.pending?.op==='revise'){const r=list.find(x=>x.pattern_id===c.pending.pattern_id);return {icon:'🧶',label:`Revising ${r?.name??'a pattern'}`};}
      if(c.pending?.op==='regenerate-invalid')return {icon:'🧶',label:'Redrafting the invalid patterns',last:lastName};
      if(list.length&&drafted===list.length)return {icon:'🧶',label:'Validating the patterns',unit:'Patterns',done:drafted,total:list.length,last:lastName};
      return {icon:'🧶',label:'Drafting crochet patterns',unit:'Patterns',done:drafted,total:list.length||c.brief?.pattern_count||null,last:lastName};
    }
    case 'visuals':{
      // One line per image, read from product.json (persisted after every image): ✅ made, 🔄 in progress, ⏳ waiting.
      const A=p.crochet_visuals?.assets;
      if(!A)return {icon:'🎨',label:'Planning the crochet visual set',heading:'GENERATING VISUALS'};
      const done=A.filter(a=>a.status==='generated').length, next=A.find(a=>a.status!=='generated');
      const mark=a=>a.status==='generated'?'✅':a===next?'🔄':'⏳';
      const name=pid=>p.crochet?.patterns?.find(e=>e.pattern_id===pid)?.name??pid;
      const pv=A.filter(a=>a.role==='pattern-preview');
      const detail=[...A.filter(a=>a.role==='hero').map(a=>`Collection hero ${mark(a)}`),'','Pattern previews:',...pv.map((a,i)=>`${pad2(i+1)} ${name(a.pattern_id)} ${mark(a)}`)];
      return {icon:'🎨',label:done===A.length?'Running the visual QC':'Generating crochet visuals',heading:'GENERATING VISUALS',unit:'visuals',done,total:A.length,detail};
    }
    case 'book':{
      const b=p.book;
      if(!b)return {icon:'📖',label:'Preparing the page manifest'};
      const have=b.pages.filter(e=>HAVE.includes(e.status)).length, e=latestBy(b.pages.filter(x=>x.status==='generated'),'generated_at');
      const title=e?p.pages?.[e.page_number-1]?.title:null;
      return {icon:'📖',label:have===b.pages.length?'Running the creative QC':'Generating colouring pages',unit:'Pages',done:have,total:b.pages.length,last:e?`${e.page_id}${title?` ${title}`:''}`:null};
    }
    case 'production':{
      const s={CREATIVE_APPROVED:[1,'Preparing the production handoff'],PRODUCTION_READY:[1,'Preparing the production handoff'],
        PRODUCTION_BUILDING:[2,'Building customer files'],PRODUCTION_QC:[3,'Running production QC']}[p.status]??[null,'Building production files'];
      return {icon:'🏭',label:s[1],stage:s[0]?[s[0],3]:null};
    }
    case 'marketing':{
      const s={PRODUCTION_APPROVED:[1,'Writing the listing and image plan'],MARKETING_PLANNING:[1,'Writing the listing and image plan'],
        MARKETING_GENERATING:[2,'Making marketing images'],MARKETING_QC:[3,'Running marketing QC'],AWAITING_MARKETING_APPROVAL:[2,'Making marketing images']}[p.status]??[null,'Making marketing'];
      return {icon:'🛍',label:s[1],stage:s[0]?[s[0],3]:null};
    }
    case 'marketing-compare':return {icon:'🆚',label:'Making the hero comparison'};
    case 'etsy':{const s=ETSY_STAGES[p.status];return {icon:'🏪',label:s?.[1]??'Preparing the Etsy draft',stage:s?[s[0],4]:null};}
    case 'etsy-refresh':return {icon:'🔍',label:'Re-checking the Etsy draft (read only)'};
    case 'etsy-section':return {icon:'🗂',label:'Assigning the Etsy shop section'};
    case 'etsy-publish':return {icon:'🚀',label:'Publishing (confirmed by you)'};
    default:return {icon:'⚙️',label:`Working: ${stepName(step)}`};
  }
}

// ---------- texts ----------
/** Progress lines without the elapsed time (the content that changes at item boundaries). */
export function progressLines(pr){
  const out=[`${pr.icon} ${pr.label}`];
  // Per-item lines (crochet visuals), then the total as "Progress: 3 / 7 visuals".
  if(Array.isArray(pr.detail)&&pr.detail.length){out.push('',...pr.detail,'');if(Number.isInteger(pr.done)&&Number.isInteger(pr.total))out.push(`Progress: ${Math.min(pr.done,pr.total)} / ${pr.total} ${pr.unit??''}`.trim());}
  else if(Number.isInteger(pr.done)&&Number.isInteger(pr.total)&&pr.total>0)out.push(`${progressBar(pr.done,pr.total)} ${pr.unit?`${pr.unit} `:''}${Math.min(pr.done,pr.total)} / ${pr.total}`);
  else if(Number.isInteger(pr.done)&&pr.unit)out.push(`${pr.unit}: ${pr.done}`);   // total unknown: a count, never a percentage
  if(Array.isArray(pr.stage)&&pr.stage[0])out.push(`Stage ${pr.stage[0]} / ${pr.stage[1]}`);
  if(pr.last)out.push(`✅ Last: ${pr.last}`);
  return out;
}
export function runningText(id,pr,elapsedMs){
  return [`${OWNER.running} #${id} — ${pr.heading??'WORKING'}`,...progressLines(pr),`⏱ ${formatElapsed(elapsedMs)}`,'',"No action needed. I'll message you when it's ready."].join('\n');
}
/** The status message once the step stopped at an owner gate (the buttons are on the review below). */
export function actionText(id,wait,elapsedMs){
  return [`${OWNER.action} #${id} — ACTION REQUIRED`,wait.label,elapsedMs!=null?`⏱ Took ${formatElapsed(elapsedMs)}`:null,'',PAUSED,'Your options are in the message below.'].filter(x=>x!==null).join('\n');
}
export function failedText(id,{step,message},elapsedMs){
  return [`${OWNER.failed} #${id} — FAILED`,`Stage: ${stepName(step)}`,'',shortError(message),elapsedMs!=null?`⏱ After ${formatElapsed(elapsedMs)}`:null,'',PAUSED,'Retry options are in the message below.'].filter(x=>x!==null).join('\n');
}
export function completeText(id,step,elapsedMs){
  return [`${OWNER.complete} #${id} — ${stepName(step).toUpperCase()} DONE`,elapsedMs!=null?`⏱ ${formatElapsed(elapsedMs)}`:null].filter(Boolean).join('\n');
}
/** The header put on an actionable message (a review with buttons, or a failure with Retry). */
export function actionHeader(p,{label=null}={}){
  if(p?.status==='FAILED')return [`${OWNER.failed} #${p.product_id} — FAILED`,`Stage: ${stepName(p.last_error?.step)}`,PAUSED].join('\n');
  return [`${OWNER.action} #${p.product_id} — ACTION REQUIRED`,label??OWNER_GATES[p?.status]?.label??null,PAUSED].filter(Boolean).join('\n');
}
/** The one reminder for a waiting state. */
export function reminderText(p,wait){
  return [`${OWNER.reminder} Product #${p.product_id} is waiting for you`,'',wait.label,wait.wait].join('\n');
}
