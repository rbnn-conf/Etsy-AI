// Telegram SEO screens (ADR-036): pure functions, data -> {text, keyboard},
// on the shared presentation layer (ui.mjs). Every number shown comes from
// the SEO engine or a captured observation; nothing here scores or decides.
// Buttons:  m1|seo…|<a>|<b>       navigation (read-only, validated)
//           s1|<action>|<id>|<n>  a write action on a session ("s…") or an input entry ("e…"),
//                                 carrying its current nonce: a stale or repeated press is refused.
// Etsy is never changed from these screens; publishing is never offered.
import { nav, link, HOME, heading, compose, dateOnly } from '../telegram/ui.mjs';
import { SESSION_ID, ENTRY_ID, NONCE } from './state.mjs';
import { CONVERSION_CHOICES, DISCOVERY_RULE } from '../../../seo/src/index.mjs';

// ---------- s1 action buttons ----------
export const SEO_ACTION=/^[a-z]{3}(\.[a-z0-9]{2,9})?$/;
export function seoData(action,id,nonce){
  if(!SEO_ACTION.test(action)||!(SESSION_ID.test(id)||ENTRY_ID.test(id))||!NONCE.test(nonce))throw new Error('unsafe SEO callback data');
  const s=`s1|${action}|${id}|${nonce}`;if(Buffer.byteLength(s)>64)throw new Error('SEO callback data too long');return s;
}
export function parseSeoData(raw){
  if(typeof raw!=='string'||Buffer.byteLength(raw)>64)return null;
  const p=raw.split('|');if(p.length!==4||p[0]!=='s1')return null;
  const [,action,id,nonce]=p;
  if(!SEO_ACTION.test(action)||!(SESSION_ID.test(id)||ENTRY_ID.test(id))||!NONCE.test(nonce))return null;
  return {action,id,nonce};
}
const act=(text,action,target)=>({text,callback_data:seoData(action,target.id,target.nonce)});
export const SEO_HOME=Object.freeze([nav('🔎 SEO Menu','seo'),...HOME]);

// ---------- small formatting ----------
const n=v=>v===null||v===undefined?'—':Number(v).toLocaleString('en-GB');
const conv=l=>l?CONVERSION_CHOICES[l]??(l==='unknown'?'Unknown':l):'—';
const trend=t=>t===null||t===undefined?'not shown':`${t>0?'+':''}${t}%`;
const captured=o=>o.captured_at?dateOnly(o.captured_at):'capture date unknown';
export const READINESS_LABEL=Object.freeze({RESEARCH_INCOMPLETE:'⏳ Research incomplete',EXPANSION_RECOMMENDED:'🔎 More research recommended',
  READY_TO_SCORE:'🟢 Ready',READY_TO_SCORE_WITH_WARNINGS:'🟡 Ready with warnings'});
const readiness=s=>READINESS_LABEL[s]??s;
const list=(label,items)=>[label,...(items.length?items.map(x=>`• ${x}`):['• none'])];
const strategyLines=r=>['🎯 Primary',r.primary_keyword??'none (research required)','','🥈 Secondary',...(r.secondary_keywords.length?r.secondary_keywords:['none']),'',
  '🔗 Supporting',...(r.supporting_keywords.length?r.supporting_keywords:['none'])];

// ---------- dashboard ----------
export function seoDashboard(){
  return {text:compose(heading('🔎','SEO & Market Research'),'Research Etsy search positioning from Marketplace Insights you capture.','',
    'Nothing here changes Etsy. Recommendations are proposals you apply yourself.'),
    keyboard:{inline_keyboard:[[nav('🏪 Audit Existing Product','seoprods','0')],[nav('🆕 Research New Product','seonew')],[nav('🧠 Insights Library','seolib')],
      [nav('📊 Active Research','seoact')],[...HOME]]}};
}

// ---------- existing products ----------
export function seoProductsScreen(items,{page=0,size=8,linked={}}={}){
  const pages=Math.max(1,Math.ceil(items.length/size)), pg=Math.min(Math.max(0,page),pages-1), slice=items.slice(pg*size,pg*size+size);
  const pager=[...(pg>0?[nav('◀️ Previous','seoprods',String(pg-1))]:[]),...(pg<pages-1?[nav('Next ▶️','seoprods',String(pg+1))]:[])];
  return {text:items.length?compose(`${heading('🏪','Choose product')}${pages>1?` (page ${pg+1}/${pages})`:''}`,'Products with a local listing. 🔎 = SEO research attached.')
      :compose(heading('🏪','Choose product'),'No product has a local listing yet.'),
    keyboard:{inline_keyboard:[...slice.map(p=>[nav(`${linked[p.product_id]?'🔎 ':''}#${p.product_id} ${p.name}`.slice(0,60),'seoprod',p.product_id)]),...(pager.length?[pager]:[]),[...SEO_HOME]]}};
}
const currentSeo=snap=>[snap.title,'',`Tags: ${snap.tags?`${snap.tags.length}/13`:'not recorded locally'}`];
export function auditNoResearchScreen(item,snap){
  return {text:compose(heading('🔎',`SEO audit — Product #${item.product_id}`),item.name,'','Current SEO','────────────',...currentSeo(snap),'',
    'No Marketplace Insights research is attached yet.'),
    keyboard:{inline_keyboard:[[nav('🔎 Start SEO Research','seostart',item.product_id)],[nav('📋 Current Listing','seolist',item.product_id)],[...SEO_HOME]]}};
}
export function auditInProgressScreen(item,snap,{session,state,progress}){
  return {text:compose(heading('🔎',`SEO audit — Product #${item.product_id}`),item.name,'',`Research: ${readiness(state.readiness.status)}`,
    `Required research: ${progress.done} / ${progress.total}`,'','Current SEO','────────────',...currentSeo(snap)),
    keyboard:{inline_keyboard:[[nav('🔎 Continue Research','seonext',session.id)],[nav('📋 Current Listing','seolist',item.product_id)],[...SEO_HOME]]}};
}
/** Research is ready (scored or scoreable): current SEO beside the engine's recommendation. */
export function auditScreen(item,snap,{session,result,readinessStatus,canContinue}){
  return {text:compose(heading('🔎',`SEO audit — Product #${item.product_id}`),item.name,'',`Research: ${readiness(readinessStatus)}`,'',
    `Confidence: ${String(result.confidence).toUpperCase()}`,'','Current SEO','────────────',...currentSeo(snap),'','Research recommendation','────────────',...strategyLines(result),
    session.decision?`\nOwner decision: ${session.decision.kind==='keep'?'keep current SEO':'SEO revision approved'} (${dateOnly(session.decision.at)})`:null),
    keyboard:{inline_keyboard:[[act('📝 Generate SEO Revision','rev',session)],[nav('📊 View Evidence','seoev',session.id)],
      ...(canContinue?[[nav('🔎 Continue Research','seonext',session.id)]]:[]),[act('✅ Keep Current SEO','kep',session)],[...SEO_HOME]]}};
}
export function listingScreen(item,snap,description){
  return {text:compose(heading('📋',`Current listing — #${item.product_id}`),`Title: ${snap.title}`,'',`Tags: ${snap.tags?snap.tags.join(', '):'not recorded locally'}`,'',
    'Description (start):',(description??'not recorded locally').slice(0,1200),'',`Source: ${snap.source.file} (local file; Etsy is not read)`),
    keyboard:{inline_keyboard:[[nav('⬅️ Back','seoprod',item.product_id)],[...SEO_HOME]]}};
}

// ---------- new product ----------
export function newResearchScreen(ideas){
  return {text:compose(heading('🆕','Research new product'),'Describe the product, or research an idea that already exists in the factory.'),
    keyboard:{inline_keyboard:[[nav('✏️ Describe a Product','seodesc')],...ideas.slice(0,8).map(p=>[nav(`💡 #${p.product_id} ${p.name??p.request?.text??''}`.slice(0,60),'seoidea',p.product_id)]),[...SEO_HOME]]}};
}
export const describeScreen=()=>({text:compose(heading('✏️','Describe the product'),'Send one message describing the product, for example:','cozy autumn colouring pages for adults','',
  'Next you confirm its format, themes, audience, delivery and style. Nothing is guessed.'),keyboard:{inline_keyboard:[[nav('⬅️ Back','seonew'),...HOME]]}});

// ---------- intake (structured idea; nothing inferred silently) ----------
const AUD=[['adults','Adults'],['teens','Teens'],['kids','Kids'],['families','Families'],['general','General']];
const DEL=[['digital','Digital'],['printable','Printable'],['editable','Editable'],['physical','Physical']];
export function intakeScreen(e){
  const a=e.answers, sug=e.suggestions, head=[heading('🧾',`Product details — ${e.target.name}`.slice(0,80)),''];
  const done=[a.formats&&`Format: ${a.formats.join(', ')}`,a.themes&&`Themes: ${a.themes.join(', ')}`,e.step!=='audiences'&&a.audiences_done&&`Audience: ${a.audiences.join(', ')||'not set'}`,
    e.step!=='delivery'&&a.delivery_done&&`Delivery: ${a.delivery.join(', ')||'not set'}`,a.styles_done&&`Style: ${a.styles.join(', ')||'none'}`].filter(Boolean);
  const cancel=[act('❌ Cancel','icn',e)];
  if(e.step==='formats')return {text:compose(...head,...done,'What is the product? Send its format, for example:','coloring pages · planner · greeting card',
      sug.formats.length?`\nFrom its own words: ${sug.formats.join(', ')}`:null),keyboard:{inline_keyboard:[...(sug.formats.length?[[act(`✅ Use: ${sug.formats.join(', ')}`.slice(0,60),'ifs',e)]]:[]),cancel]}};
  if(e.step==='themes')return {text:compose(...head,...done,'','Main themes? Send them separated by commas, for example:','autumn, cozy'),keyboard:{inline_keyboard:[cancel]}};
  if(e.step==='audiences')return {text:compose(...head,...done,'','Who is it for? Tap to select (or type a custom audience), then Done.',`Selected: ${a.audiences.join(', ')||'none'}`,
      sug.audiences.length?`From its own words: ${sug.audiences.join(', ')}`:null),
    keyboard:{inline_keyboard:[...AUD.map(([k,l])=>[act(`${a.audiences.includes(k)?'☑️':'⬜'} ${l}`,`iau.${k}`,e)]),[act('✅ Done','ido',e),act('Skip','isk',e)],cancel]}};
  if(e.step==='delivery')return {text:compose(...head,...done,'','How is it delivered? Tap to select, then Done.',`Selected: ${a.delivery.join(', ')||'none'}`,
      sug.delivery.length?`From its own words: ${sug.delivery.join(', ')}`:null),
    keyboard:{inline_keyboard:[...DEL.map(([k,l])=>[act(`${a.delivery.includes(k)?'☑️':'⬜'} ${l}`,`idl.${k}`,e)]),[act('✅ Done','ido',e),act('Skip','isk',e)],cancel]}};
  if(e.step==='styles')return {text:compose(...head,...done,'','Style or attributes? Send them separated by commas (cute, minimalist, vintage…), or Skip.'),
    keyboard:{inline_keyboard:[[act('Skip','isk',e)],cancel]}};
  return {text:compose(...head,...done,'','Missing details stay unknown: the research plan simply leaves them out.'),
    keyboard:{inline_keyboard:[[act('✅ Create Research Plan','icf',e)],[act('✏️ Start Again','irs',e)],cancel]}};
}

// ---------- research plan ----------
export function planScreen(session,plan){
  const c=p=>plan.queries.filter(q=>q.priority===p).length;
  return {text:compose(heading('🔎','Research plan'),'Product:',session.name,'',`Research queries: ${plan.queries.length}`,`P1 required: ${c('P1')}`,`P2 optional: ${c('P2')}`,`P3 exploration: ${c('P3')}`,
    ...(plan.idea_completeness!=='complete'?['',`Details missing: ${plan.missing_fields.join(', ')||'some values came from the product\'s own words'} (left out, not guessed).`]:[]),'',
    'A research query is not evidence of demand: nothing counts until you capture it from Etsy.'),
    keyboard:{inline_keyboard:[[nav('🚀 Start Research','seonext',session.id)],[nav('📋 View Plan','seoplan',session.id)],[act('❌ Cancel','cnl',session)]]}};
}
const STATE_ICON={captured:'✅',unavailable:'🚫',owner_stopped:'⏹',planned:'▫️',research_requested:'▫️'};
export function planDetailScreen(session,terms){
  const open=terms.filter(t=>['planned','research_requested'].includes(t.state));
  return {text:compose(heading('📋',`Research plan — ${session.name}`.slice(0,70)),...terms.map(t=>`${STATE_ICON[t.state]??'▫️'} ${t.priority?`${t.priority} `:'R '}${t.term}`),'',
    '✅ captured · 🚫 Etsy had no data · ⏹ not researched (owner finished) · ▫️ to research','Tap a query to research it now.'),
    keyboard:{inline_keyboard:[...open.slice(0,10).map(t=>[nav(`🔎 ${t.term}`.slice(0,60),'seoterm',session.id,t.key)]),[nav('⬅️ Research','seonext',session.id),...HOME]]}};
}

// ---------- Marketplace Insights capture ----------
export function queryScreen(session,term,{canFinish}){
  return {text:compose(heading('🔎','Marketplace Insights'),'Search Etsy Marketplace Insights for:','',`"${term.term}"`,'',
    `Priority: ${term.priority??`Round ${term.round_number} (expansion)`}${term.required?' · required':' · optional'}`,`Reason: ${term.reason}`,
    term.discovered_from?.length?`Discovered beside: ${term.discovered_from.join(', ')}`:null),
    keyboard:{inline_keyboard:[[act('📝 Enter Results',`ent.${term.key}`,session)],[act('🚫 Etsy Has No Data',`nod.${term.key}`,session)],
      ...(canFinish?[[nav('⏹ Finish With Current Evidence','seofin',session.id)]]:[]),[nav('📊 Research Status','seoses',session.id),...HOME]]}};
}
export function reuseScreen(session,term,e){
  const o=e.observation, from=e.refs[0];
  return {text:compose(heading('♻️','Existing research found'),`"${term.term}"`,'',`Captured:\n${captured(o)}`,'',`Searches:\n${n(o.searches_30d)}`,'',`Results:\n${n(o.search_results)}`,'',
    `Conversion:\n${conv(o.conversion_label)}`,'',`Trend:\n${trend(o.trend_percent)}`,'',`From: ${from.name??from.session_id}${from.product_id?` (#${from.product_id})`:''}`,
    'Reusing keeps the original capture date and source. It does not spend a Marketplace Insights lookup.'),
    keyboard:{inline_keyboard:[[act('♻️ Reuse This Observation',`reu.${term.key}`,session)],[act('🔄 Research Again',`ent.${term.key}`,session)],
      [nav('📈 View History','seohist',session.id,e.key)],[...SEO_HOME]]}};
}
const entryTitle=e=>heading('📝',`${e.term}`.slice(0,70));
export function entryScreen(e,{error=null}={}){
  const v=e.values, err=error?`⚠️ ${error}\n`:null, cancel=[act('❌ Cancel','ecn',e)];
  switch(e.step){
    case 'searches':return {text:compose(entryTitle(e),err,'Searches shown by Etsy?','Type the number, e.g. 4345 (or Etsy\'s rounded 4.3k).'),keyboard:{inline_keyboard:[cancel]}};
    case 'daily':return {text:compose(entryTitle(e),err,`Etsy showed a rounded value: ${v.searches.displayed}.`,'','For an exact total, paste Etsy\'s 30 daily search counts (one message).',
      `Or keep the rounded value: it is saved as ${n(v.searches.value)} and marked as rounded.`),keyboard:{inline_keyboard:[[act(`Keep rounded ${v.searches.displayed}`,'dsk',e)],cancel]}};
    case 'results':return {text:compose(entryTitle(e),err,'Search results?','e.g. 138500 (or 138.5k)'),keyboard:{inline_keyboard:[cancel]}};
    case 'conversion':return {text:compose(entryTitle(e),err,'Conversion rate shown by Etsy?'),
      keyboard:{inline_keyboard:[...Object.entries(CONVERSION_CHOICES).map(([k,l])=>[act(l,`cnv.${k.replace('_','')}`,e)]),cancel]}};
    case 'trend':return {text:compose(entryTitle(e),err,'Trend percentage?','Example: +3.2'),keyboard:{inline_keyboard:[[act('Skip Trend','tsk',e)],cancel]}};
    case 'related':return {text:compose(entryTitle(e),err,'Related search terms? Paste one per line.','','Optional figures:','coloring pages for adults | 1.6k | 133.4k | High','',
      'They are recorded as discovery only: never evidence until researched themselves.'),keyboard:{inline_keyboard:[[act('No Related Terms','rsk',e)],cancel]}};
    default:return reviewScreen(e);
  }
}
export function reviewScreen(e){
  const v=e.values;
  const s=v.daily?`${n(v.daily.sum)} (sum of 30 daily counts; Etsy showed ${v.searches.displayed})`:v.searches.exact?n(v.searches.value):`${n(v.searches.value)} (rounded: Etsy showed ${v.searches.displayed})`;
  const r=v.results.exact?n(v.results.value):`${n(v.results.value)} (rounded: Etsy showed ${v.results.displayed})`;
  return {text:compose(heading('📊','Review insight'),e.term,'',`Searches: ${s}`,`Results: ${r}`,`Conversion: ${conv(v.conversion_label)}`,`Trend: ${trend(v.trend)}`,
    `Related terms: ${v.related?.terms?.length??0}${v.related?.terms?.length?' (discovery only)':''}`,'',`Captured:\n${dateOnly(e.captured_at)}`),
    keyboard:{inline_keyboard:[[act('✅ Save Observation','sav',e)],[act('✏️ Edit','edt',e)],[act('❌ Cancel','ecn',e)]]}};
}
export function savedScreen(session,term,{progress,canFinish,reused=null}){
  return {text:compose(heading('✅',reused?'Insight reused':'Insight captured'),term,reused?`Original capture: ${captured(reused)} (provenance kept)`:null,'',
    'Research progress:',`${progress.done} / ${progress.total} required observations`),
    keyboard:{inline_keyboard:[[nav('🔎 Next Query','seonext',session.id)],[nav('📊 Research Status','seoses',session.id)],[nav('🧠 View Evidence','seoev',session.id)],
      ...(canFinish?[[nav('⏹ Finish With Current Evidence','seofin',session.id)]]:[]),[...HOME]]}};
}

// ---------- expansion / readiness / finish ----------
export function expansionScreen(session,state,{candidates}){
  const b=state.budget;
  return {text:compose(heading('🔎','More research recommended'),'The evidence has revealed additional relevant searches.','','Recommended next:',...candidates.map(t=>`• ${t}`),'',
    'Research budget:',`${b.queries_used} / ${b.max_total_research_queries} queries`,`${b.expansion_rounds_used} / ${b.max_expansion_rounds} expansion rounds`),
    keyboard:{inline_keyboard:[[act('🔎 Start Next Round','rnd',session)],[nav('⏹ Finish With Current Evidence','seofin',session.id)],[nav('📊 Why These Terms?','seowhy',session.id)],[...HOME]]}};
}
export function whyScreen(session,state){
  const cand=state.ledger.filter(e=>state.candidates.includes(e.term)), req=state.ledger.filter(e=>e.state==='research_requested');
  const rej=state.ledger.filter(e=>e.origin==='discovered'&&e.state==='rejected');
  return {text:compose(heading('📊','Why these terms?'),...[...cand,...req].flatMap(e=>[`• ${e.term} (${e.relevance_class})`,`  ${e.decision_reason}`,`  Seen beside: ${e.discovered_from.join(', ')}`]),'',
    `Not researched (${rej.length}):`,...rej.slice(0,12).map(e=>`• ${e.term}: ${e.decision_reason}`),'',DISCOVERY_RULE),
    keyboard:{inline_keyboard:[[nav('⬅️ Back','seonext',session.id),...HOME]]}};
}
export function readyScreen(session,state,{canFinish,optional}){
  return {text:compose(heading('✅','Research ready to score'),`Readiness: ${readiness(state.readiness.status)}`,...state.readiness.warnings.map(w=>`⚠️ ${w}`),'',
    'Scoring uses only captured observations. It is free (no OpenAI, no Etsy).'),
    keyboard:{inline_keyboard:[[act('🎯 Score Research','scr',session)],...(optional?[[nav('📋 Optional Queries','seoplan',session.id)]]:[]),
      ...(canFinish?[[nav('⏹ Finish With Current Evidence','seofin',session.id)]]:[]),[nav('🧠 View Evidence','seoev',session.id),...HOME]]}};
}
export function incompleteScreen(session,state){
  return {text:compose(heading('⏳','Research incomplete'),...state.readiness.reasons.map(r=>`• ${r}`),'','Capture more of the plan (optional queries), or cancel this research.'),
    keyboard:{inline_keyboard:[[nav('📋 View Plan','seoplan',session.id)],[act('❌ Cancel Research','cnl',session)],[...HOME]]}};
}
export function finishConfirmScreen(session,{unresearched}){
  return {text:compose(heading('⏹','Finish SEO research?'),`${unresearched.length} recommended search${unresearched.length===1?' has':'es have'} not been researched:`,...unresearched.map(t=>`• ${t}`),'',
    `${unresearched.length===1?'It':'They'} will remain UNKNOWN.`,'',`${unresearched.length===1?'It':'They'} will NOT:`,'• become zero','• become unavailable','• become rejected','• enter scoring','',
    'The factory will score only captured evidence.'),
    keyboard:{inline_keyboard:[[act('✅ Finish & Score','fin',session)],[nav('🔎 Continue Research','seonext',session.id)]]}};
}
export function sessionStatusScreen(session,state,{progress}){
  const t=state.readiness, b=state.budget;
  return {text:compose(heading('📊',`Research status — ${session.name}`.slice(0,70)),`Readiness: ${readiness(t.status)}`,`Required research: ${progress.done} / ${progress.total}`,
    `Budget: ${b.queries_used} / ${b.max_total_research_queries} queries · ${b.expansion_rounds_used} / ${b.max_expansion_rounds} expansion rounds`,
    ...t.reasons.map(r=>`• ${r}`),...t.warnings.map(w=>`⚠️ ${w}`)),
    keyboard:{inline_keyboard:[[nav('🔎 Next Step','seonext',session.id)],[nav('📋 View Plan','seoplan',session.id),nav('🧠 Evidence','seoev',session.id)],[...HOME]]}};
}

// ---------- results / evidence ----------
export function resultsScreen(session,{result,readinessStatus,warnings,isExisting}){
  return {text:compose(heading('🎯','SEO research complete'),'Product:',session.name,'','Readiness:',readiness(readinessStatus),'','Confidence:',String(result.confidence).toUpperCase(),'',
    'PRIMARY',result.primary_keyword??'none (research required)','','SECONDARY',...(result.secondary_keywords.length?result.secondary_keywords:['none']),'',
    'SUPPORTING',...(result.supporting_keywords.length?result.supporting_keywords:['none']),
    ...(warnings.length?['','Warnings:',...warnings]:[])),
    keyboard:{inline_keyboard:[...(isExisting?[[act('📝 Generate SEO Revision','rev',session)]]:[]),[nav('📊 View Evidence','seoev',session.id)],[nav('🧠 Research Library','seolib')],
      ...(session.product_id?[[nav('📋 Product','seoprod',session.product_id)]]:[]),[...HOME]]}};
}
export function evidenceScreen(session,{observations,unknown,rejected,reuse,packageId}){
  const reused=new Map(reuse.map(r=>[r.observation_id,r]));
  return {text:compose(heading('🧠',`Evidence — ${session.name}`.slice(0,70)),packageId?`Evidence package ${packageId}`:'Captured so far (not yet scored)','',
    `Captured observations (${observations.length}):`,...observations.flatMap(o=>[`• ${o.keyword}`,`  ${n(o.searches_30d)} searches · ${n(o.search_results)} results · ${conv(o.conversion_label)} · trend ${trend(o.trend_percent)}`,
      `  ${captured(o)}${reused.has(o.observation_id)?' · ♻️ reused (original provenance)':''}`]),'',
    ...list('Unknown (not evidence, not zero):',unknown),'',`Discovered but not researched: ${rejected}`),
    keyboard:{inline_keyboard:[[nav('⬅️ Research','seonext',session.id),...HOME]]}};
}

// ---------- revision / approval ----------
export function revisionScreen(session,rev){
  if(!rev.available)return {text:compose(heading('📝','SEO revision'),rev.reason),keyboard:{inline_keyboard:[[...SEO_HOME]]}};
  return {text:compose(heading('📝','Proposed SEO revision'),session.name,'','TITLE','',`CURRENT:\n${rev.title.current}`,'',`PROPOSED:\n${rev.title.proposed}`,'',
    'TAGS','',...list('KEEP:',rev.tags.keep),'',...list('ADD:',rev.tags.add),'',...list('REMOVE:',rev.tags.remove.map(t=>t.tag)),'',
    'DESCRIPTION','',`New opening line:\n${rev.description.lead_sentence}`,rev.description.unchanged_body?'Then your current description, unchanged.':null,'',
    ...rev.notes.map(x=>`ℹ️ ${x}`),'','Generated without OpenAI (£0.00). Nothing is sent to Etsy.'),
    keyboard:{inline_keyboard:[[act('✅ Approve SEO Revision','apr',session)],[nav('📋 Copy Recommended SEO','seocopy',session.id)],[nav('📊 View Evidence','seoev',session.id)],[...SEO_HOME]]}};
}
/** After approval. A listing that is (or may be) on Etsy is never modified from here. */
export function approvedScreen(session,item,{editorUrl}){
  const onEtsy=item.etsy.known!=='none';
  if(onEtsy)return {text:compose(heading('🔴','Live Etsy listing'),`#${item.product_id} ${item.name}`,'',
      item.etsy.known==='unknown'?'Its Etsy state is not known locally, so it is treated as live.':`Etsy listing ${item.etsy.listing_id}.`,'',
      'Automatic modification is not permitted from this SEO screen.','The approved revision is saved. Copy it into the Etsy listing editor yourself.'),
    keyboard:{inline_keyboard:[[nav('📋 Copy Recommended SEO','seocopy',session.id)],...(editorUrl?[[link('🔗 Open Etsy Editor',editorUrl)]]:[]),[...HOME]]}};
  return {text:compose(heading('✅','SEO revision approved'),`#${item.product_id} ${item.name}`,'','Saved as the owner-approved SEO revision for this product.',
    'It is available as an input when the Etsy draft is prepared. Nothing was published or sent to Etsy.'),
    keyboard:{inline_keyboard:[[nav('📋 Copy Recommended SEO','seocopy',session.id)],[...SEO_HOME]]}};
}
export const keptScreen=(session,item)=>({text:compose(heading('✅','Current SEO kept'),`#${item.product_id} ${item.name}`,'','Recorded: the current listing SEO stays as it is. Nothing was changed.'),
  keyboard:{inline_keyboard:[[nav('📋 Product','seoprod',item.product_id)],[...SEO_HOME]]}});
export function copyText(rev){
  return [`TITLE\n${rev.title.proposed}`,`TAGS\n${rev.tags.final.join(', ')}`,`DESCRIPTION\n${rev.description.proposed}`].join('\n\n').slice(0,4000);
}

// ---------- library ----------
export function libraryScreen(sum){
  return {text:compose(heading('🧠','Marketplace Insights library'),`Unique keywords: ${sum.keywords}`,`Observations: ${sum.observations}`,`Latest capture: ${sum.latest?dateOnly(sum.latest):'—'}`,'',
    'Every observation you captured, never overwritten. Reuse one instead of spending another lookup.'),
    keyboard:{inline_keyboard:[[nav('🔍 Search Keyword','seosrch')],[nav('🕒 Recent Research','seorec')],[nav('📈 Keyword History','seokeys')],[nav('🔎 SEO Menu','seo')]]}};
}
export const searchPromptScreen=()=>({text:compose(heading('🔍','Search keyword'),'Send a keyword, e.g. weekly planner'),keyboard:{inline_keyboard:[[nav('⬅️ Library','seolib'),...HOME]]}});
export function searchResultsScreen(text,matches){
  return {text:compose(heading('🔍',`"${text}"`.slice(0,60)),matches.length?matches.map(m=>`• ${m.keyword} — ${m.count} observation${m.count>1?'s':''}, latest ${m.latest?dateOnly(m.latest):'date unknown'}`).join('\n'):'No captured observation matches.'),
    keyboard:{inline_keyboard:[...matches.slice(0,8).map(m=>[nav(`📈 ${m.keyword}`.slice(0,60),'seohist','',m.key)]),[nav('⬅️ Library','seolib'),...HOME]]}};
}
export function keywordsScreen(matches){
  return {text:compose(heading('📈','Keyword history'),matches.length?'Choose a keyword:':'No observations yet.'),
    keyboard:{inline_keyboard:[...matches.slice(0,12).map(m=>[nav(`📈 ${m.keyword} (${m.count})`.slice(0,60),'seohist','',m.key)]),[nav('⬅️ Library','seolib'),...HOME]]}};
}
export function historyScreen(keyword,entries,{back}){
  return {text:compose(heading('📈','Keyword history'),keyword,'',...entries.flatMap(e=>{const o=e.observation;return [captured(o),`Searches ${n(o.searches_30d)} · Results ${n(o.search_results)}`,
      `Conversion ${conv(o.conversion_label)} · Trend ${trend(o.trend_percent)}`,`From ${e.refs.map(r=>`${r.name??r.session_id} v${r.version}`).join(', ')}`,''];}),
    'Each line is a separate capture: nothing is averaged or interpolated.'),
    keyboard:{inline_keyboard:[[back],[nav('⬅️ Library','seolib'),...HOME]]}};
}
export function recentScreen(sessions){
  return {text:compose(heading('🕒','Recent research'),sessions.length?sessions.slice(0,10).map(s=>`• ${s.name} — ${s.status}${s.scored?` · primary ${s.scored.primary??'none'}`:''} (${dateOnly(s.updated_at)})`).join('\n'):'No research yet.'),
    keyboard:{inline_keyboard:[...sessions.slice(0,8).map(s=>[nav(`${s.name}`.slice(0,60),'seoses',s.id)]),[nav('⬅️ Library','seolib'),...HOME]]}};
}
export function activeScreen(rows){
  return {text:compose(heading('📊','Active research'),rows.length?rows.map(r=>`${r.product_id?`#${r.product_id} `:''}${r.name}\n${r.progress.done}/${r.progress.total} required · ${r.label}`).join('\n\n'):'No active research.'),
    keyboard:{inline_keyboard:[...rows.slice(0,8).map(r=>[nav(`▶️ ${r.product_id?`#${r.product_id} `:''}${r.name}`.slice(0,60),'seonext',r.id)]),[...SEO_HOME]]}};
}
export const staleText='Already handled: this button is out of date.';
