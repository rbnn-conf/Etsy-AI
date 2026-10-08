// SEO Research Planner (ADR-033): idea → research plan of Marketplace Insights
// searches for the OWNER to run by hand.
//
// A GENERATED RESEARCH QUERY IS NOT EVIDENCE OF MARKET DEMAND. The planner
// proposes what to look up; it never supplies, estimates or implies numbers,
// and its priorities use no demand assumptions (no data exists yet).
//
// Deterministic, generic (any product type), no model, no network. Queries are
// built only from the idea's own words plus documented format families and
// regional variants, so the plan cannot wander into unrelated niches.
import { createHash } from 'node:crypto';
import { matchKey, normaliseKeyword } from './observations.mjs';
import { STANDARD_AUDIENCES, DELIVERY_METHODS, MODES } from './idea.mjs';

export const PLAN_SCHEMA_VERSION=1;
export const PLAN_STATUSES=Object.freeze(['draft','researching','ready_for_expansion','complete','superseded']);
export const OBSERVATION_STATUSES=Object.freeze(['not_researched','captured','unavailable']);
export const INTENT_TYPES=Object.freeze(['core_product','theme_product','audience_product','attribute_product','theme_audience_product','delivery_variant','regional_variant']);
export const COMPLETENESS=Object.freeze(['complete','usable_with_warnings','insufficient']);
export const MAX_QUERIES=40;
export const CAPTURE_FIELDS=Object.freeze(['searches in the last 30 days','search results','conversion label','trend, if Etsy shows one','related search terms Etsy displays','capture date']);

// Format families: alternative packagings of the same product that a buyer may search for.
// Small and explicit; a format not listed here has no siblings.
export const FORMAT_FAMILIES=Object.freeze([
  ['coloring pages','coloring book'],['activity book','activity pages'],['greeting card','card'],['invitation','invite'],
  ['planner'],['spreadsheet','spreadsheet template'],['template'],['worksheet'],['journal'],['calendar'],['party kit'],['wall art'],['sticker'],
  ['crochet pattern','crochet pattern bundle']]);
// Genuine regional variants of a theme word (the same season, two spellings of the market).
export const THEME_VARIANTS=Object.freeze({autumn:['fall'],fall:['autumn']});
// Search shapes (ADR-041 amendment to ADR-033): a format family whose buyers put the theme INSIDE the
// format words ("crochet rose pattern", not "roses crochet pattern"). Its theme queries use this shape,
// with the theme in the singular. Only the idea's own words fill it. A family not listed keeps "<theme> <format>".
export const SEARCH_SHAPES=Object.freeze({'crochet pattern':'crochet {theme} pattern'});
const SINGULAR=Object.freeze({leaves:'leaf'});
const singular=w=>SINGULAR[w]??(w.length>4&&w.endsWith('ies')?w.slice(0,-3)+'y':w.length>3&&w.endsWith('s')&&!w.endsWith('ss')?w.slice(0,-1):w);
// How an audience reads in a search: before the product ("adult coloring pages") or after it ("… pages adults").
const AUDIENCE_WORDS=Object.freeze({adults:{prefix:'adult',suffix:'adults'},teens:{prefix:'teen',suffix:'teens'},kids:{prefix:'kids',suffix:'kids'},families:{prefix:'family',suffix:'family'},general:null});
const AUDIENCE_ALIASES=Object.freeze({adult:'adults',adults:'adults',grownup:'adults','grown-up':'adults',teen:'teens',teens:'teens',teenager:'teens',teenagers:'teens',
  kid:'kids',kids:'kids',child:'kids',children:'kids',family:'families',families:'families',general:'general',everyone:'general'});
// Delivery methods that are also search words. physical/other add nothing to a query.
const DELIVERY_WORDS=Object.freeze({digital:'digital',printable:'printable',editable:'editable',physical:null,other:null});

/**
 * Query normalisation (dedupe key, never shown as the query): lowercase,
 * colour→color and cosy→cozy, accents and punctuation removed, single spaces,
 * and a simple plural rule (-ies→-y; trailing -s after a consonant or e).
 * Word ORDER and theme variants are kept: "fall coloring pages" and
 * "autumn coloring pages" are separate research intents.
 */
export function normaliseQuery(q){
  return matchKey(q).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/['’]/g,'').replace(/[^a-z0-9]+/g,' ').trim().split(' ').filter(Boolean)
    .map(w=>w==='cosy'?'cozy':w).map(w=>w.length>4&&w.endsWith('ies')?w.slice(0,-3)+'y':w.length>3&&w.endsWith('s')&&!/[aiuos]s$/.test(w)?w.slice(0,-1):w).join(' ');
}
const display=q=>normaliseKeyword(matchKey(q).replace(/[^a-z0-9' -]+/g,' ').replace(/-/g,' '));   // US spelling, readable
const ukSpelling=q=>q.includes('color')?[q.replace(/color/g,'colour')]:[];
const familyOf=f=>FORMAT_FAMILIES.find(fam=>fam.some(x=>normaliseQuery(x)===normaliseQuery(f)))??null;
const words=s=>` ${normaliseQuery(s??'')} `;
const has=(text,phrase)=>words(text).includes(` ${normaliseQuery(phrase)} `);

/**
 * Structured view of an idea for research. Structured fields win. When one
 * is absent, only EXPLICIT words in the idea's own text are used (a known
 * audience word, a known format phrase, the literal words "printable",
 * "digital" or "editable"), and each such value is flagged. Nothing else is
 * inferred: "colouring pages" never implies "digital".
 * @returns {formats, themes, audiences, styles, delivery, season, sources, idea_completeness, missing_fields, warnings}
 */
export function resolveIdea(idea){
  const warnings=[], sources={};
  const text=[idea.working_name,idea.product_type,idea.format,idea.concept,idea.audience].filter(Boolean).join(' | ');
  const pick=(field,structured,fromText)=>{
    if(structured?.length){sources[field]='structured';return structured;}
    const found=fromText();
    if(found.length){sources[field]='extracted_from_text';warnings.push(`${field} not supplied as structured data; taken from the idea's own words: ${found.join(', ')}. Confirm it.`);return found;}
    sources[field]=null;return [];
  };
  const knownFormats=FORMAT_FAMILIES.flat();
  const formats=pick('formats',idea.formats,()=>{
    const out=[];for(const src of [idea.format,idea.product_type,idea.working_name])for(const f of knownFormats)if(src&&has(src,f)&&!out.some(x=>normaliseQuery(x)===normaliseQuery(f)))out.push(f);
    // A longer phrase already found makes its bare sub-word redundant ("greeting card" covers "card").
    return out.filter(f=>!out.some(g=>g!==f&&words(g).includes(` ${normaliseQuery(f)} `)));
  }).map(display);
  const audiences=pick('audiences',idea.audiences,()=>[...new Set(normaliseQuery(text).split(' ').map(w=>AUDIENCE_ALIASES[w]).filter(Boolean))]);
  const delivery=pick('delivery',idea.delivery,()=>['printable','digital','editable'].filter(d=>has(text,d)));
  const themes=[...new Set((idea.themes??[]).map(display))];sources.themes=themes.length?'structured':null;
  const styles=[...new Set((idea.styles??[]).map(display))];sources.styles=styles.length?'structured':null;
  const missing_fields=[];
  if(!formats.length)missing_fields.push('formats');
  if(!themes.length)missing_fields.push('themes');
  if(!audiences.length)missing_fields.push('audiences');
  if(!delivery.length)missing_fields.push('delivery');
  if(!formats.length)warnings.push('No product format is known: research queries cannot describe the product. Supply formats (for example "coloring pages", "planner", "greeting card").');
  if(!themes.length)warnings.push('No themes supplied: no theme queries are generated.');
  if(!audiences.length)warnings.push('No audience supplied: no audience queries are generated (it is not guessed).');
  if(!delivery.length)warnings.push('No delivery method supplied: no printable/digital/editable variants are generated (it is not assumed).');
  const idea_completeness=!formats.length?'insufficient':missing_fields.length||Object.values(sources).includes('extracted_from_text')?'usable_with_warnings':'complete';
  return {formats,themes,audiences,styles,delivery,season:idea.season??null,sources,idea_completeness,missing_fields,warnings};
}

/**
 * Candidate Marketplace Insights searches (RESEARCH QUERIES, not SEO
 * recommendations). Primary format = the first format; siblings come from its
 * format family. Priorities are about closeness to the core buyer intent only.
 *   P1: theme + primary format (with regional variants) · audience + primary format
 *   P2: theme + sibling format · audience + sibling · style + primary format ·
 *       theme + primary format + audience · delivery + primary format · primary format alone
 *   P3: sibling format alone · style + sibling · delivery + sibling
 * Deduplicated by normalised query (the first, higher-priority wording wins);
 * capped at MAX_QUERIES, dropping the lowest priority last-generated first.
 */
export function generateQueries(resolved){
  const out=[], index=new Map(), dropped=[];
  if(!resolved.formats.length)return {queries:out,dropped,warnings:[]};
  const f0=resolved.formats[0];
  const siblings=[...new Set([...resolved.formats.slice(1),...(familyOf(f0)??[]).map(display)])].filter(f=>normaliseQuery(f)!==normaliseQuery(f0));
  const themeWords=[];
  for(const t of resolved.themes){
    if(!themeWords.some(x=>x.word===t))themeWords.push({word:t,variant_of:null});
    for(const v of THEME_VARIANTS[normaliseQuery(t)]??[])if(!themeWords.some(x=>x.word===v))themeWords.push({word:v,variant_of:t});
  }
  const aud=resolved.audiences.map(a=>{const k=AUDIENCE_ALIASES[normaliseQuery(a)]??null;return k?AUDIENCE_WORDS[k]&&{label:k,...AUDIENCE_WORDS[k]}:{label:a,prefix:display(a),suffix:display(a),custom:true};}).filter(Boolean);
  const del=resolved.delivery.map(d=>DELIVERY_WORDS[d]).filter(Boolean);
  const add=(query,intent_type,priority,reason,components)=>{
    const q=display(query), n=normaliseQuery(q);
    if(index.has(n)){out[index.get(n)].merged_variants.push(q);return;}
    index.set(n,out.length);
    out.push({query:q,normalized_query:n,also_spelled:ukSpelling(q),intent_type,priority,reason,required:priority==='P1',observation_status:'not_researched',
      components:{format:components.format??null,theme:components.theme??null,audience:components.audience??null,style:components.style??null,delivery:components.delivery??null},merged_variants:[]});
  };
  // A family with a search shape phrases its theme queries the way buyers search (SEARCH_SHAPES).
  const shape=(familyOf(f0)??[]).map(f=>SEARCH_SHAPES[normaliseQuery(f)]??SEARCH_SHAPES[f]).find(Boolean)??null;
  // A theme word the shape already says ("crochet flowers" in "crochet {theme} pattern") is not repeated.
  const shapeWords=shape?new Set(shape.replace('{theme}','').split(/\s+/).filter(Boolean)):new Set();
  const phrase=(t,fmt)=>shape?shape.replace('{theme}',display(t).split(' ').filter(w=>!shapeWords.has(w)).map(singular).join(' ')).replace(/\s+/g,' '):`${t} ${fmt}`;
  const themeQ=(fmt,priority,sib)=>{for(const t of themeWords)add(phrase(t.word,fmt),t.variant_of?'regional_variant':'theme_product',priority,
    t.variant_of?`regional variant of "${t.variant_of}" + ${sib?'related product format':'product format'}`:shape?`theme in the buyer search shape "${shape}"`:`theme + ${sib?`related product format (same family as "${f0}")`:'product format'}`,{format:fmt,theme:t.word});};
  // P1
  themeQ(f0,'P1',false);
  for(const a of aud)add(`${a.prefix} ${f0}`,'audience_product','P1','target audience + product format',{format:f0,audience:a.label});
  // P2
  for(const s of siblings)themeQ(s,'P2',true);
  for(const s of siblings)for(const a of aud)add(`${a.prefix} ${s}`,'audience_product','P2',`target audience + related product format (same family as "${f0}")`,{format:s,audience:a.label});
  for(const st of resolved.styles)add(`${st} ${f0}`,'attribute_product','P2','style/attribute + product format',{format:f0,style:st});
  for(const t of themeWords)for(const a of aud)add(`${phrase(t.word,f0)} ${a.suffix}`,'theme_audience_product','P2',`theme${t.variant_of?' (regional variant)':''} + product format + audience`,{format:f0,theme:t.word,audience:a.label});
  for(const d of del)add(`${d} ${f0}`,'delivery_variant','P2',`supplied delivery method ("${d}") + product format`,{format:f0,delivery:d});
  add(f0,'core_product','P2','core product intent (broad)',{format:f0});
  // P3
  for(const s of siblings)add(s,'core_product','P3',`related product format (same family as "${f0}"), broad`,{format:s});
  for(const s of siblings)for(const st of resolved.styles)add(`${st} ${s}`,'attribute_product','P3','style/attribute + related product format',{format:s,style:st});
  for(const s of siblings)for(const d of del)add(`${d} ${s}`,'delivery_variant','P3',`supplied delivery method ("${d}") + related product format`,{format:s,delivery:d});
  const warnings=[];
  if(out.length>MAX_QUERIES){
    const keep=[...out.keys()].sort((a,b)=>out[a].priority.localeCompare(out[b].priority)||a-b).slice(0,MAX_QUERIES);
    const k=new Set(keep);out.forEach((q,i)=>{if(!k.has(i))dropped.push(q.query);});
    const kept=out.filter((_,i)=>k.has(i));out.length=0;out.push(...kept);
    warnings.push(`query_cap_reached: ${dropped.length} lower-priority queries not listed (limit ${MAX_QUERIES}): ${dropped.join(', ')}.`);
  }
  // Guardrail: every word of every query comes from the idea or the documented families/variants.
  const vocab=new Set([...resolved.formats,...siblings,...themeWords.map(t=>t.word),...aud.flatMap(a=>[a.prefix,a.suffix]),...resolved.styles,...del,
    // A search shape's singular theme word is derived from the idea's own word ("leaves" -> "leaf").
    ...(shape?themeWords.map(t=>display(t.word).split(' ').map(singular).join(' ')):[])].flatMap(x=>normaliseQuery(x).split(' ')));
  for(const q of out)for(const w of q.normalized_query.split(' '))if(!vocab.has(w))throw new Error(`research planner guardrail: "${w}" in "${q.query}" is not from the idea`);
  const order={P1:0,P2:1,P3:2};
  return {queries:out.sort((a,b)=>order[a.priority]-order[b.priority]),dropped,warnings};
}

const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');

/** NEW_PRODUCT research plan (status draft). Every query starts not_researched; no numbers anywhere. */
export function createResearchPlan({idea,now=new Date()}){
  const resolved=resolveIdea(idea);
  const g=resolved.idea_completeness==='insufficient'?{queries:[],dropped:[],warnings:[]}:generateQueries(resolved);
  const idea_reference={product_id:idea.product_id??null,working_name:idea.working_name,sha256:sha(idea)};
  const {sources,idea_completeness,missing_fields,warnings,...structured}=resolved;
  return {schema_version:PLAN_SCHEMA_VERSION,research_plan_id:`plan-${sha([idea_reference,g.queries.map(q=>q.normalized_query)]).slice(0,16)}`,
    mode:MODES.NEW_PRODUCT,product_id:idea.product_id??null,idea_reference,created_at:now.toISOString(),
    idea_completeness,missing_fields,resolved_idea:{...structured,sources},
    queries:g.queries,capture_fields:[...CAPTURE_FIELDS],discovered_terms:[],research_references:[],
    warnings:[...warnings,...g.warnings,'A generated research query is not evidence of market demand: every query is not_researched until the owner captures it.'],
    status:'draft',status_history:[{status:'draft',at:now.toISOString()}]};
}

/**
 * Apply a captured research set: a query is "captured" only when the research
 * contains an observation for it. Related terms Etsy displayed are listed as
 * DISCOVERED (never as researched observations). Status moves to researching,
 * then ready_for_expansion once every required (P1) query is captured or unavailable.
 */
export function applyResearch(plan,research,{now=new Date()}={}){
  if(['complete','superseded'].includes(plan.status))throw new Error(`plan is ${plan.status}`);
  const p=structuredClone(plan);
  const obs=new Map(research.observations.map(o=>[normaliseQuery(o.keyword),o]));
  for(const q of p.queries){const o=obs.get(q.normalized_query);if(o){q.observation_status='captured';q.observation_id=o.observation_id;}}
  const known=new Set([...p.queries.map(q=>q.normalized_query),...obs.keys()]);
  for(const o of research.observations)for(const t of o.related_terms??[]){
    const n=normaliseQuery(t.term);if(known.has(n)||p.discovered_terms.some(d=>d.normalized_term===n))continue;
    const metrics=[t.searches_30d,t.search_results,t.conversion_label].filter(v=>v!==null).length;
    p.discovered_terms.push({term:t.term,normalized_term:n,status:'discovered',seen_beside:o.keyword,
      metrics_captured:metrics===3?'all':metrics?'partial':'none',searches_30d:t.searches_30d,search_results:t.search_results,conversion_label:t.conversion_label,
      note:'Displayed by Etsy as a related search. Not researched: it is not an observation and is not scored.'});
  }
  p.research_references.push({research_id:research.research_id,version:research.version});
  return withStatus(p,now);
}
/** The owner could not get Marketplace Insights for a query (for example, Etsy showed nothing). */
export function markUnavailable(plan,query,{note=null,now=new Date()}={}){
  const p=structuredClone(plan), q=p.queries.find(x=>x.normalized_query===normaliseQuery(query));
  if(!q)throw new Error(`"${query}" is not in this research plan`);
  if(q.observation_status==='captured')throw new Error(`"${query}" is already captured`);
  q.observation_status='unavailable';q.unavailable_note=note;
  return withStatus(p,now);
}
function withStatus(p,now){
  const req=p.queries.filter(q=>q.required), done=q=>q.observation_status!=='not_researched';
  const next=req.length&&req.every(done)?'ready_for_expansion':p.queries.some(done)?'researching':p.status;
  if(next!==p.status){p.status=next;p.status_history.push({status:next,at:now.toISOString()});}
  return p;
}
const PLAN_TRANSITIONS=Object.freeze({draft:['superseded'],researching:['superseded'],ready_for_expansion:['complete','superseded'],complete:['superseded'],superseded:[]});
/** Owner-driven transitions: ready_for_expansion → complete; any open plan → superseded (by a newer plan). */
export function setPlanStatus(plan,status,{now=new Date(),superseded_by=null}={}){
  if(!(PLAN_TRANSITIONS[plan.status]??[]).includes(status))throw new Error(`research plan cannot move from ${plan.status} to ${status}`);
  return {...structuredClone(plan),status,...(status==='superseded'?{superseded_by}:{}),status_history:[...plan.status_history,{status,at:now.toISOString()}]};
}

/**
 * EXISTING_LISTING research gaps from the listing's title and tags, its
 * relevance profile (the product's own words) and existing observations. No
 * recommendation to change the listing: that stays downstream.
 */
/**
 * An existing listing's own metadata as an idea: formats and central themes from its relevance
 * profile, audiences and delivery words from the profile, styles = profile attributes the title
 * LEADS with. Nothing is added that the listing or its profile does not say.
 */
export function listingIdea(snapshot,profile){
  const lead=snapshot.title.split(/\s*[,|]\s*|\s+[—–-]\s+/)[0].trim();
  const attrs=profile.attributes.map(display);
  const delivery=DELIVERY_METHODS.filter(d=>attrs.includes(d));
  return {product_id:snapshot.listing?.repo_product?.slice(0,3)??null,working_name:snapshot.title,product_type:snapshot.product_type,format:null,concept:snapshot.description_excerpt??'',
    audience:null,season:null,themes:profile.central_themes,formats:profile.formats,audiences:profile.audiences.length?profile.audiences:null,
    delivery:delivery.length?delivery:null,styles:attrs.filter(a=>!DELIVERY_METHODS.includes(a)&&has(lead,a))};
}

export function planExistingListingResearch({snapshot,profile,research,now=new Date()}){
  const obs=new Map(research.observations.map(o=>[normaliseQuery(o.keyword),o]));
  const lead=snapshot.title.split(/\s*[,|]\s*|\s+[—–-]\s+/)[0].trim();
  const existing=[...(snapshot.tags??[]).map(t=>({term:t,source:'tag'})),{term:lead,source:'title_lead'}]
    .filter((x,i,a)=>a.findIndex(y=>normaliseQuery(y.term)===normaliseQuery(x.term))===i);
  const researched=[], needing=[];
  for(const x of existing){const o=obs.get(normaliseQuery(x.term));(o?researched:needing).push(o?{...x,observation_id:o.observation_id}:x);}
  const resolved=resolveIdea(listingIdea(snapshot,profile));
  const g=generateQueries(resolved);
  const have=new Set([...existing.map(x=>normaliseQuery(x.term)),...obs.keys()]);
  const new_candidate_queries=g.queries.filter(q=>!have.has(q.normalized_query));
  const gaps=[];
  if(snapshot.tags===null)gaps.push('The listing\'s tags are not recorded, so only the title can be compared with research.');
  if(needing.length)gaps.push(`${needing.length} of ${existing.length} current terms (tags and title lead) have no Marketplace Insights observation: ${needing.map(x=>x.term).join(', ')}.`);
  const p1=g.queries.filter(q=>q.priority==='P1'&&!obs.has(q.normalized_query));
  if(p1.length)gaps.push(`${p1.length} core (P1) search intents for this product have never been researched: ${p1.map(q=>q.query).join(', ')}.`);
  if(!resolved.audiences.length)gaps.push('No audience is recorded for this product, so no audience searches can be planned.');
  return {schema_version:PLAN_SCHEMA_VERSION,mode:MODES.EXISTING_LISTING,snapshot_id:snapshot.snapshot_id,created_at:now.toISOString(),
    research_reference:{research_id:research.research_id,version:research.version},
    existing_terms_already_researched:researched,existing_terms_needing_research:needing,new_candidate_queries,research_gaps:gaps,
    resolved_product:{formats:resolved.formats,themes:resolved.themes,audiences:resolved.audiences,styles:resolved.styles,delivery:resolved.delivery},
    listing_action:'none',etsy_action:'none',
    warnings:[...resolved.warnings.filter(w=>!/taken from the idea/.test(w)),...g.warnings,'Research gaps only: no listing change is recommended at this stage. A generated research query is not evidence of market demand.']};
}

/** Owner-facing text: what to search, in what order, and what to write down. No numbers. */
export function researchPlanReport(plan,{title}={}){
  const name=title??plan.idea_reference?.working_name??plan.snapshot_id;
  const out=['SEO RESEARCH PLAN','',`Product: ${name}`,`Idea completeness: ${plan.idea_completeness}${plan.missing_fields?.length?` (missing: ${plan.missing_fields.join(', ')})`:''}`,
    `Status: ${plan.status}`,'','A generated research query is NOT evidence of demand. Nothing below has been researched yet.'];
  const heads={P1:'P1 — SEARCH THESE FIRST',P2:'P2 — THEN RESEARCH',P3:'P3 — OPTIONAL EXPLORATION'};
  let n=0;
  for(const p of ['P1','P2','P3']){
    const qs=plan.queries.filter(q=>q.priority===p);if(!qs.length)continue;
    out.push('',heads[p],'');
    for(const q of qs)out.push(`${++n}. ${q.query}${q.also_spelled.length?`  (also spelled: ${q.also_spelled.join(', ')})`:''}  [${q.observation_status}]`,`   Why: ${q.reason}`);
  }
  out.push('','FOR EACH QUERY CAPTURE:','',...plan.capture_fields.map(f=>`- ${f}`),'','Leave any value Etsy does not show empty. Never estimate.');
  if(plan.warnings.length)out.push('','WARNINGS','',...plan.warnings.map(w=>`- ${w}`));
  return out.join('\n');
}
