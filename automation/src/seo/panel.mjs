// Telegram SEO panel (ADR-036): the owner interface over the SEO engine
// (seo/). This file only routes buttons and messages and stores Telegram
// input state; planning, relevance, expansion, readiness, evidence, scoring
// and FINISH_WITH_CURRENT_EVIDENCE are the engine's (ResearchWorkspace and
// friends). It never calls Etsy or OpenAI and never changes a product.
import { MODES, validateIdea, resolveIdea, buildEvidencePackage, scoreEvidencePackage, listingRecommendationFromResult, proposeRevision, profileFromIdea,
  parseEtsyCount, parseTrend, parseDailyCounts, parseRelatedTerms, parseConversionText, observationFromEntry, normaliseQuery, CONVERSION_CHOICES } from '../../../seo/src/index.mjs';
import { editorUrl } from '../telegram/menu.mjs';
import { nav } from '../telegram/ui.mjs';
import { SeoState, SESSION_ID } from './state.mjs';
import { listSeoProducts, productSnapshot } from './catalogue.mjs';
import { buildLibrary, librarySummary, keywordHistory, searchLibrary, reusableObservation, byKeywordKey } from './library.mjs';
import * as S from './screens.mjs';

const READY=s=>String(s).startsWith('READY_TO_SCORE');
const CONV_OF=Object.fromEntries(Object.keys(CONVERSION_CHOICES).map(k=>[k.replace('_',''),k]));
const split=t=>[...new Set(String(t).split(/[,\n;]+/).map(x=>x.trim().toLowerCase()).filter(Boolean))].slice(0,8);
const today=now=>now.toISOString().slice(0,10);
/** The engine permits FINISH at any time, but it only changes something while expansion is open. */
export const canFinish=state=>!state.owner_finished&&(state.readiness.status==='EXPANSION_RECOMMENDED'||state.round_statuses.some(r=>r.round_number>=2&&r.status==='pending_capture'));

export class SeoPanel{
  /**
   * @param show  (chatId, messageId|null, screen, outcome) => result   (edits the menu message when possible)
   * @param send  (chatId, text) => void                                  (a plain message, e.g. copyable SEO)
   */
  /**
   * The owner-APPROVED SEO result for a product (ADR-041): scored research the
   * owner approved in Telegram, or null. Unscored, unapproved or cancelled
   * research is never used by marketing. Keyword roles only; no numbers.
   */
  async approvedKeywords(productId){
    const s=await this.state.sessionForProduct(productId);
    if(!s||s.status!=='scored'||s.decision?.kind!=='approved'||!s.scored?.primary)return null;
    return {session:s.id,approved_at:s.decision.at,approved_by:s.decision.by,confidence:s.scored.confidence??null,
      primary:s.scored.primary,secondary:s.scored.secondary??[],supporting:s.scored.supporting??[]};
  }
  constructor({productsDir,stateDir,store,show,send,now=()=>new Date(),log=()=>{}}){
    Object.assign(this,{productsDir,store,show,send,now,log});
    this.state=new SeoState({stateDir,now});
  }
  async hasEntry(chatId){return !!(await this.state.entry(chatId));}
  async entryAt(chatId){return (await this.state.entry(chatId))?.updated_at??null;}
  async clearEntry(chatId){if(await this.state.entry(chatId))await this.state.clearEntry(chatId);}
  dashboard(chatId,mid=null){return this.show(chatId,mid,S.seoDashboard(),'seo_menu');}

  // ---------- reading ----------
  async #items(){return listSeoProducts(this.productsDir);}
  async #item(pid){return (await this.#items()).find(x=>x.product_id===pid)??null;}
  async #view(session){
    const ws=await this.state.open(session.id), state=ws.state();
    return {ws,state,progress:ws.progress(state),finish:canFinish(state)};
  }
  /** Pure: build the evidence package and score it (the owner's "score" action saves the package). */
  #score(ws){
    const pkg=buildEvidencePackage({plan:ws.plan,profile:ws.profile,research:ws.research,rounds:ws.rounds,now:this.now()});
    return {pkg,result:scoreEvidencePackage({pkg,profile:ws.profile})};
  }
  async #termScreen(session,ws,term,state){
    const lib=await buildLibrary(this.state), e=reusableObservation(lib,term.term,{excludeSession:session.id});
    return e?S.reuseScreen(session,term,e):S.queryScreen(session,term,{canFinish:canFinish(state)});
  }
  /** What the owner should do next in a session. */
  async #next(session){
    if(session.status==='cancelled')return {text:'This research was cancelled.',keyboard:{inline_keyboard:[[...S.SEO_HOME]]}};
    const {ws,state}=await this.#view(session);
    if(session.status==='scored')return this.#results(session,ws);
    const pending=ws.pendingRequired(state);
    if(pending.length)return this.#termScreen(session,ws,pending[0],state);
    if(state.readiness.status==='EXPANSION_RECOMMENDED')return S.expansionScreen(session,state,{candidates:state.candidates});
    if(READY(state.readiness.status))return S.readyScreen(session,state,{canFinish:canFinish(state),optional:ws.terms(state).some(t=>t.state==='planned')});
    return S.incompleteScreen(session,state);
  }
  #results(session,ws){
    const state=ws.state(), {result}=this.#score(ws);
    return S.resultsScreen(session,{result,readinessStatus:state.readiness.status,warnings:state.readiness.warnings,isExisting:!!session.product_id});
  }
  async #evidence(session){
    const {ws,state}=await this.#view(session);
    const obs=new Map(ws.research.observations.map(o=>[normaliseQuery(o.keyword),o]));
    const observations=state.ledger.filter(e=>e.state==='captured'&&['plan','expansion'].includes(e.origin)).map(e=>obs.get(e.normalized_term)).filter(Boolean);
    const unknown=state.ledger.filter(e=>['unavailable','owner_stopped'].includes(e.state)).map(e=>`${e.term} (${e.state==='unavailable'?'Etsy had no data':'not researched: owner finished'})`);
    return S.evidenceScreen(session,{observations,unknown,rejected:state.ledger.filter(e=>e.origin==='discovered').length,reuse:session.reuse??[],packageId:session.scored?.package_id??null});
  }
  async #audit(item){
    const {snapshot,description}=await productSnapshot(this.productsDir,item,{now:this.now()});
    const session=await this.state.sessionForProduct(item.product_id);
    if(!session||session.status==='cancelled')return S.auditNoResearchScreen(item,snapshot);
    const {ws,state,progress}=await this.#view(session);
    if(session.status!=='scored'&&!READY(state.readiness.status))return S.auditInProgressScreen(item,snapshot,{session,state,progress});
    const {result}=this.#score(ws);
    const canContinue=!state.owner_finished&&session.status!=='scored'&&(ws.pendingRequired(state).length>0||state.readiness.status==='EXPANSION_RECOMMENDED');
    return S.auditScreen(item,snapshot,{session,result,readinessStatus:state.readiness.status,canContinue});
  }

  // ---------- navigation (m1|seo…) ----------
  async onMenu(m,{chatId,mid}){
    const show=(s,o)=>this.show(chatId,mid,s,o);
    const session=async()=>{const s=await this.state.session(m.a);return s&&s.chat_id===String(chatId)?s:null;};
    switch(m.screen){
      case 'seo':return show(S.seoDashboard(),'seo_menu');
      case 'seoprods':{
        const links=(await this.state.read()).product_links;
        return show(S.seoProductsScreen(await this.#items(),{page:Number(m.a||0),linked:links}),'seo_products');
      }
      case 'seoprod':case 'seolist':case 'seostart':{
        const item=await this.#item(m.a);
        if(!item)return show({text:'That product has no readable local listing.',keyboard:S.seoDashboard().keyboard},'seo_unknown_product');
        if(m.screen==='seoprod')return show(await this.#audit(item),'seo_audit');
        if(m.screen==='seolist'){const {snapshot,description}=await productSnapshot(this.productsDir,item,{now:this.now()});return show(S.listingScreen(item,snapshot,description),'seo_listing');}
        const existing=await this.state.sessionForProduct(item.product_id);
        if(existing&&existing.status!=='cancelled')return show(await this.#audit(item),'seo_audit');
        const {snapshot}=await productSnapshot(this.productsDir,item,{now:this.now()});
        return show(S.intakeScreen(await this.#startIntake(chatId,{mode:MODES.EXISTING_LISTING,product_id:item.product_id,name:item.name,
          suggestFrom:{working_name:snapshot.title,product_type:snapshot.product_type??'',concept:snapshot.description_excerpt??''},page_count:snapshot.page_count,product_type:snapshot.product_type})),'seo_intake');
      }
      case 'seonew':{
        const linked=new Set(Object.keys((await this.state.read()).product_links));
        const ideas=(await this.store.list()).filter(p=>p.request?.chat_id===String(chatId)&&!['REJECTED','PUBLISHED'].includes(p.status)&&!linked.has(p.product_id));
        return show(S.newResearchScreen(ideas),'seo_new');
      }
      case 'seodesc':await this.state.setEntry(chatId,{kind:'describe'});return show(S.describeScreen(),'seo_describe');
      case 'seoidea':{
        const p=await this.store.load(m.a).catch(()=>null);
        if(!p||p.request?.chat_id!==String(chatId))return show({text:'Unknown product idea.',keyboard:S.seoDashboard().keyboard},'seo_unknown_product');
        return show(S.intakeScreen(await this.#startIntake(chatId,{mode:MODES.NEW_PRODUCT,product_id:p.product_id,name:p.name??p.request.text,
          suggestFrom:{working_name:p.name??p.request.text,product_type:p.product_type??'',concept:p.request.text,audience:p.target_customer??null},product_type:p.product_type,page_count:p.page_count})),'seo_intake');
      }
      case 'seolib':return show(S.libraryScreen(librarySummary(await buildLibrary(this.state))),'seo_library');
      case 'seosrch':await this.state.setEntry(chatId,{kind:'libsearch'});return show(S.searchPromptScreen(),'seo_library_search');
      case 'seokeys':return show(S.keywordsScreen(searchLibrary(await buildLibrary(this.state),'')),'seo_keywords');
      case 'seohist':{
        const lib=await buildLibrary(this.state), n=byKeywordKey(lib,m.b);
        if(!n)return show(S.libraryScreen(librarySummary(lib)),'stale');
        const entries=keywordHistory(lib,n);
        const back=SESSION_ID.test(m.a)?nav('⬅️ Research','seonext',m.a):nav('⬅️ Keywords','seokeys');
        return show(S.historyScreen(entries[0].observation.keyword,entries,{back}),'seo_history');
      }
      case 'seorec':{
        const list=(await this.state.sessions(chatId)).sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
        return show(S.recentScreen(list),'seo_recent');
      }
      case 'seoact':{
        const rows=[];
        for(const s of (await this.state.sessions(chatId)).filter(s=>s.status==='researching').sort((a,b)=>b.updated_at.localeCompare(a.updated_at))){
          const {state,progress}=await this.#view(s);
          const label=READY(state.readiness.status)?'Ready to score':state.readiness.status==='EXPANSION_RECOMMENDED'?'More research recommended':'Waiting for Marketplace Insights';
          rows.push({id:s.id,name:s.name,product_id:s.product_id,progress,label});
        }
        return show(S.activeScreen(rows),'seo_active');
      }
    }
    const s=await session();
    if(!s)return show({text:'Unknown research session.',keyboard:S.seoDashboard().keyboard},'seo_unknown_session');
    switch(m.screen){
      case 'seonext':return show(await this.#next(s),'seo_next');
      case 'seoses':{const {state,progress}=await this.#view(s);return show(S.sessionStatusScreen(s,state,{progress}),'seo_status');}
      case 'seoplan':{const ws=await this.state.open(s.id);return show(S.planDetailScreen(s,ws.terms()),'seo_plan');}
      case 'seoterm':{
        const {ws,state}=await this.#view(s), t=ws.termByKey(m.b);
        if(s.status!=='researching'||!t||!['planned','research_requested'].includes(t.state))return show(await this.#next(s),'stale');
        return show(await this.#termScreen(s,ws,t,state),'seo_term');
      }
      case 'seoev':return show(await this.#evidence(s),'seo_evidence');
      case 'seowhy':{const {state}=await this.#view(s);return show(S.whyScreen(s,state),'seo_why');}
      case 'seofin':{
        const {state}=await this.#view(s);
        if(s.status!=='researching'||!canFinish(state))return show(await this.#next(s),'stale');
        const unresearched=[...state.ledger.filter(e=>e.state==='research_requested').map(e=>e.term),...state.candidates];
        return show(S.finishConfirmScreen(s,{unresearched}),'seo_finish_confirm');
      }
      case 'seores':{const ws=await this.state.open(s.id);return show(this.#results(s,ws),'seo_results');}
      case 'seocopy':{
        const rev=(await this.state.readSessionJson(s.id,'approved-revision.json'))?.revision??(await this.state.readSessionJson(s.id,'revision.json'))?.revision;
        if(!rev?.available)return show(await this.#next(s),'stale');
        await this.send(chatId,S.copyText(rev));
        return {outcome:'seo_copy_sent'};
      }
    }
    return show(S.seoDashboard(),'seo_menu');
  }

  // ---------- intake (structured idea; the owner confirms every value) ----------
  async #startIntake(chatId,{mode,product_id,name,suggestFrom,product_type=null,page_count=null}){
    const r=resolveIdea({working_name:suggestFrom.working_name,product_type:suggestFrom.product_type,format:null,concept:suggestFrom.concept,audience:suggestFrom.audience??null,themes:[]});
    const sug={formats:r.sources.formats==='extracted_from_text'?r.formats:[],audiences:r.sources.audiences==='extracted_from_text'?r.audiences:[],delivery:r.sources.delivery==='extracted_from_text'?r.delivery:[]};
    return this.state.setEntry(chatId,{kind:'intake',step:'formats',target:{mode,product_id,name:String(name).slice(0,100),concept:String(suggestFrom.concept||name).slice(0,2000),product_type,page_count},
      suggestions:sug,answers:{formats:null,themes:null,audiences:[...sug.audiences],delivery:[...sug.delivery],styles:[],audiences_done:false,delivery_done:false,styles_done:false}});
  }
  async #intakeConfirm(chatId,e,actor){
    const t=e.target, a=e.answers;
    const idea=validateIdea({product_id:t.product_id,working_name:t.name.slice(0,140),product_type:(t.product_type||a.formats[0]).slice(0,140),concept:t.concept||t.name,audience:null,season:null,
      themes:a.themes,format:a.formats[0],page_count:Number.isInteger(t.page_count)&&t.page_count>0?t.page_count:null,owner_notes:'Telegram SEO intake: every value confirmed by the owner.',candidate_keywords:[],status:'draft',
      audiences:a.audiences.length?a.audiences:null,delivery:a.delivery.length?a.delivery:null,formats:a.formats,styles:a.styles.length?a.styles:null,item_count:null});
    if(!idea.ok)throw new Error(`intake: ${idea.errors.join('; ')}`);
    let snapshot=null;
    if(t.mode===MODES.EXISTING_LISTING){const item=await this.#item(t.product_id);snapshot=(await productSnapshot(this.productsDir,item,{now:this.now()})).snapshot;}
    const {profile}=profileFromIdea(idea.idea,{profile_id:`tg-${e.id}`,describes:snapshot?{mode:MODES.EXISTING_LISTING,ref:snapshot.snapshot_id}:{mode:MODES.NEW_PRODUCT,ref:`telegram-${e.id}`}});
    const {id,ws}=await this.state.createSession({mode:t.mode,idea:idea.idea,snapshot,profile,product_id:t.product_id,name:t.name,chat_id:chatId,actor});
    await this.state.clearEntry(chatId);
    return S.planScreen(await this.state.session(id),ws.plan);
  }

  // ---------- write actions (s1|…) ----------
  async onAction(cq,{answer,actor,chatId,mid}){
    const d=S.parseSeoData(cq.data);
    if(!d){await answer('Unrecognised button.');return {outcome:'unparseable'};}
    const show=(s,o)=>this.show(chatId,mid,s,o);
    if(SESSION_ID.test(d.id)){
      const s=await this.state.session(d.id);
      if(!s||s.chat_id!==String(chatId)){await answer('Unknown research.');return {outcome:'seo_unknown_session'};}
      if(d.nonce!==s.nonce){await answer(S.staleText);await show(await this.#next(s),'stale');return {outcome:'stale'};}
      return this.#sessionAction(s,d.action,{answer,show,chatId,actor});
    }
    const e=await this.state.entry(chatId);
    if(!e||e.id!==d.id||e.nonce!==d.nonce){await answer(S.staleText);return {outcome:'stale'};}
    await answer();
    if(e.kind==='intake')return this.#intakeAction(e,d.action,{show,chatId,actor});
    if(e.kind==='observation')return this.#entryAction(e,d.action,{show,chatId,actor});
    return {outcome:'stale'};
  }
  async #sessionAction(s,action,{answer,show,chatId,actor}){
    const [a,key]=action.split('.');
    const refuse=async why=>{await answer(why);return {outcome:'stale',...(await show(await this.#next(s),'stale'))};};
    if(s.status==='cancelled')return refuse('This research was cancelled.');
    const {ws,state}=await this.#view(s);
    const open=t=>t&&['planned','research_requested'].includes(t.state);
    switch(a){
      case 'ent':{
        const t=ws.termByKey(key);if(s.status!=='researching'||!open(t))return refuse('That query is already done.');
        await answer();
        await this.state.touch(s.id);
        const e=await this.state.setEntry(chatId,{kind:'observation',session_id:s.id,key:t.key,term:t.term,step:'searches',values:{},captured_at:today(this.now())});
        return show(S.entryScreen(e),'seo_entry');
      }
      case 'nod':{
        const t=ws.termByKey(key);if(s.status!=='researching'||!open(t))return refuse('That query is already done.');
        await ws.markUnavailable(t.term,{note:`Owner (${actor}): Etsy showed no Marketplace Insights data`,now:this.now()});
        await answer('Recorded: Etsy has no data (unknown, not zero).');
        return show(await this.#next(await this.state.touch(s.id)),'seo_unavailable');
      }
      case 'reu':{
        const t=ws.termByKey(key);if(s.status!=='researching'||!open(t))return refuse('That query is already done.');
        const lib=await buildLibrary(this.state), e=reusableObservation(lib,t.term,{excludeSession:s.id});
        if(!e)return refuse('No reusable observation any more.');
        const {observation_id,...row}=e.observation, from=e.refs.find(r=>r.session_id!==s.id)??e.refs[0];
        const r=await ws.importCapture({rows:[row],recorded_by:actor,note:`Reused observation ${observation_id} (captured ${e.observation.captured_at??'date unknown'}) from ${from.research_id} v${from.version}`},{now:this.now()});
        const kept=r.research.observations.find(o=>o.observation_id===observation_id);
        if(!kept)throw new Error('reuse would change the observation: refused');
        const s2=await this.state.touch(s.id,x=>{x.reuse=[...(x.reuse??[]),{key:t.key,term:t.term,observation_id,from,at:this.now().toISOString(),by:actor}];});
        await answer('Reused with its original capture date.');
        const v=await this.#view(s2);
        return show(S.savedScreen(s2,t.term,{progress:v.progress,canFinish:v.finish,reused:e.observation}),'seo_reused');
      }
      case 'rnd':{
        if(s.status!=='researching'||state.readiness.status!=='EXPANSION_RECOMMENDED')return refuse('No expansion round is due.');
        const r=await ws.nextRound({now:this.now()});
        await answer(`Round ${r.round_number}: ${r.requested_terms.length} search${r.requested_terms.length===1?'':'es'} to research.`);
        return show(await this.#next(await this.state.touch(s.id)),'seo_round');
      }
      case 'fin':{
        if(s.status!=='researching'||!canFinish(state))return refuse('Finishing is not available now.');
        await ws.finish({by:actor,note:'Finished from Telegram (FINISH_WITH_CURRENT_EVIDENCE)',now:this.now()});
        await answer('Research finished with current evidence.');
        const st=ws.state();
        if(!READY(st.readiness.status))return show(S.incompleteScreen(await this.state.touch(s.id),st),'seo_finished_incomplete');
        return this.#doScore(s,ws,show,'seo_finished_scored');
      }
      case 'scr':{
        if(s.status!=='researching'||!READY(state.readiness.status))return refuse('The research is not ready to score.');
        await answer();
        return this.#doScore(s,ws,show,'seo_scored');
      }
      case 'rev':{
        if(!s.product_id)return refuse('A revision needs an existing product.');
        const item=await this.#item(s.product_id);if(!item)return refuse('The product has no readable local listing.');
        if(s.status!=='scored'&&!READY(state.readiness.status))return refuse('The research is not ready yet.');
        await answer();
        const {pkg,result}=s.status==='scored'?this.#score(ws):await ws.score({now:this.now()});
        const {snapshot,description}=await productSnapshot(this.productsDir,item,{now:this.now()});
        const recommendation=listingRecommendationFromResult({snapshot,profile:ws.profile,result,now:this.now()});
        const revision=proposeRevision({snapshot,description,recommendation,result});
        await this.state.writeSessionJson(s.id,'revision.json',{generated_at:this.now().toISOString(),generated_by:actor,package_id:pkg.package_id,snapshot_source:snapshot.source,revision});
        const s2=await this.state.touch(s.id,x=>{if(x.status!=='scored')x.status='scored';x.scored??={at:this.now().toISOString(),package_id:pkg.package_id,primary:result.primary_keyword};});
        return show(S.revisionScreen(s2,revision),'seo_revision');
      }
      case 'apr':{
        const rev=await this.state.readSessionJson(s.id,'revision.json'), item=s.product_id?await this.#item(s.product_id):null;
        if(!rev?.revision?.available||!item)return refuse('Generate the revision first.');
        await this.state.writeSessionJson(s.id,'approved-revision.json',{approved_at:this.now().toISOString(),approved_by:actor,product_id:s.product_id,etsy:item.etsy,
          note:'Owner-approved SEO revision. Saved only: nothing is sent to Etsy from the SEO panel.',...rev});
        const s2=await this.state.touch(s.id,x=>{x.decision={kind:'approved',at:this.now().toISOString(),by:actor};});
        await answer('Approved and saved. Etsy was not changed.');
        return show(S.approvedScreen(s2,item,{editorUrl:item.etsy.listing_id?editorUrl(item.etsy.listing_id):null}),'seo_approved');
      }
      case 'kep':{
        const item=s.product_id?await this.#item(s.product_id):null;if(!item)return refuse('Unknown product.');
        const s2=await this.state.touch(s.id,x=>{x.decision={kind:'keep',at:this.now().toISOString(),by:actor};});
        await answer('Recorded.');
        return show(S.keptScreen(s2,item),'seo_kept');
      }
      case 'cnl':{
        if(s.status!=='researching')return refuse('Nothing to cancel.');
        await this.state.touch(s.id,(x,r)=>{x.status='cancelled';if(x.product_id&&r.product_links[x.product_id]===x.id)delete r.product_links[x.product_id];});
        await answer('Research cancelled. Captured observations stay in the library.');
        return show(S.seoDashboard(),'seo_cancelled');
      }
    }
    return refuse('Unknown action.');
  }
  async #doScore(s,ws,show,outcome){
    const {pkg,result}=await ws.score({now:this.now()}), st=ws.state();
    const s2=await this.state.touch(s.id,x=>{x.status='scored';x.scored={at:this.now().toISOString(),package_id:pkg.package_id,readiness:st.readiness.status,confidence:result.confidence,
      primary:result.primary_keyword,secondary:result.secondary_keywords,supporting:result.supporting_keywords};});
    return show(S.resultsScreen(s2,{result,readinessStatus:st.readiness.status,warnings:st.readiness.warnings,isExisting:!!s2.product_id}),outcome);
  }
  async #intakeAction(e,action,{show,chatId,actor}){
    const [a,k]=action.split('.'), x=structuredClone(e.answers);let step=e.step;
    if(a==='icn'){await this.state.clearEntry(chatId);return show(S.seoDashboard(),'seo_intake_cancelled');}
    if(a==='irs'){const n=await this.state.setEntry(chatId,{...e,step:'formats',answers:{formats:null,themes:null,audiences:[...e.suggestions.audiences],delivery:[...e.suggestions.delivery],styles:[],audiences_done:false,delivery_done:false,styles_done:false}});return show(S.intakeScreen(n),'seo_intake');}
    if(a==='icf'&&step==='confirm')return show(await this.#intakeConfirm(chatId,e,actor),'seo_plan_created');
    if(a==='ifs'&&step==='formats'&&e.suggestions.formats.length){x.formats=e.suggestions.formats;step='themes';}
    else if(a==='iau'&&step==='audiences'&&['adults','teens','kids','families','general'].includes(k))x.audiences=x.audiences.includes(k)?x.audiences.filter(v=>v!==k):[...x.audiences,k];
    else if(a==='idl'&&step==='delivery'&&['digital','printable','editable','physical'].includes(k))x.delivery=x.delivery.includes(k)?x.delivery.filter(v=>v!==k):[...x.delivery,k];
    else if((a==='ido'||a==='isk')&&step==='audiences'){if(a==='isk')x.audiences=[];x.audiences_done=true;step='delivery';}
    else if((a==='ido'||a==='isk')&&step==='delivery'){if(a==='isk')x.delivery=[];x.delivery_done=true;step='styles';}
    else if(a==='isk'&&step==='styles'){x.styles=[];x.styles_done=true;step='confirm';}
    else return show(S.intakeScreen(e),'stale');
    return show(S.intakeScreen(await this.state.setEntry(chatId,{...e,step,answers:x})),'seo_intake');
  }
  async #entryAction(e,action,{show,chatId,actor}){
    const [a,k]=action.split('.'), v=structuredClone(e.values);
    const s=await this.state.session(e.session_id);
    if(!s||s.status!=='researching'){await this.state.clearEntry(chatId);return show(S.seoDashboard(),'stale');}
    const next=async(step,values=v)=>show(S.entryScreen(await this.state.setEntry(chatId,{...e,step,values})),'seo_entry');
    switch(a){
      case 'ecn':await this.state.clearEntry(chatId);return show(await this.#next(s),'seo_entry_cancelled');
      case 'edt':return next('searches',{});
      case 'dsk':if(e.step==='daily')return next('results');break;
      case 'cnv':if(e.step==='conversion'&&CONV_OF[k]){v.conversion_label=CONV_OF[k];return next('trend');}break;
      case 'tsk':if(e.step==='trend'){v.trend=null;return next('related');}break;
      case 'rsk':if(e.step==='related'){v.related=null;return next('review');}break;
      case 'sav':{
        if(e.step!=='review')break;
        const ws=await this.state.open(s.id), t=ws.termByKey(e.key);
        if(!t||!['planned','research_requested'].includes(t.state)){await this.state.clearEntry(chatId);return show(await this.#next(s),'stale');}
        const row=observationFromEntry({...v,keyword:e.term},{captured_at:e.captured_at,captured_by:actor});
        await this.state.clearEntry(chatId);   // before the write: a second press finds no entry and is refused
        await ws.importCapture({rows:[row],recorded_by:actor,note:'Telegram Marketplace Insights capture'},{now:this.now()});
        const s2=await this.state.touch(s.id), view=await this.#view(s2);
        return show(S.savedScreen(s2,e.term,{progress:view.progress,canFinish:view.finish}),'seo_saved');
      }
    }
    return show(S.entryScreen(e),'stale');
  }

  // ---------- typed replies ----------
  /** @returns the outcome, or null when no SEO input is waiting in this chat */
  async onText(m,{chatId,actor}){
    const e=await this.state.entry(chatId);
    if(!e)return null;
    const text=String(m.text??'').trim(), show=(s,o)=>this.show(chatId,null,s,o);
    if(e.kind==='describe'){
      if(!text)return show(S.describeScreen(),'seo_describe');
      return show(S.intakeScreen(await this.#startIntake(chatId,{mode:MODES.NEW_PRODUCT,product_id:null,name:text.slice(0,100),suggestFrom:{working_name:text.slice(0,140),product_type:'',concept:text}})),'seo_intake');
    }
    if(e.kind==='libsearch'){await this.state.clearEntry(chatId);return show(S.searchResultsScreen(text,searchLibrary(await buildLibrary(this.state),text)),'seo_search_results');}
    if(e.kind==='intake'){
      const x=structuredClone(e.answers);let step=e.step;
      if(step==='formats'&&split(text).length){x.formats=split(text);step='themes';}
      else if(step==='themes'&&split(text).length){x.themes=split(text);step='audiences';}
      else if(step==='audiences'&&split(text).length)x.audiences=[...new Set([...x.audiences,...split(text)])];
      else if(step==='styles'){x.styles=split(text);x.styles_done=true;step='confirm';}
      else return show(S.intakeScreen(e),'seo_intake_hint');
      return show(S.intakeScreen(await this.state.setEntry(chatId,{...e,step,answers:x})),'seo_intake');
    }
    if(e.kind==='observation'){
      const v=structuredClone(e.values), again=error=>show(S.entryScreen(e,{error}),'seo_entry_invalid');
      const next=async(step)=>show(S.entryScreen(await this.state.setEntry(chatId,{...e,step,values:v})),'seo_entry');
      switch(e.step){
        case 'searches':{const r=parseEtsyCount(text);if(!r.ok)return again(r.error);v.searches=r;v.daily=null;return next(r.exact?'results':'daily');}
        case 'daily':{const r=parseDailyCounts(text);if(!r.ok)return again(r.error);v.daily={sum:r.sum};return next('results');}
        case 'results':{const r=parseEtsyCount(text);if(!r.ok)return again(r.error);v.results=r;return next('conversion');}
        case 'conversion':{const c=parseConversionText(text);if(!c||c==='unknown')return again('choose one of the buttons');v.conversion_label=c;return next('trend');}
        case 'trend':{const r=parseTrend(text);if(!r.ok)return again(r.error);v.trend=r.value;return next('related');}
        case 'related':{const r=parseRelatedTerms(text);if(!r.ok)return again(r.errors.join('; '));v.related={terms:r.terms,rounded:r.rounded};return next('review');}
        default:return show(S.reviewScreen(e),'seo_entry');
      }
    }
    return null;
  }
}

/**
 * Replay a completed research cycle (captures + the owner's finish record) into a Telegram session
 * attached to a product. Used by scripts/seo-import-cycle.mjs and the acceptance test. Engine rules
 * only: captures become research versions; after the last capture, a due expansion round is created
 * and then finished by the owner, exactly as it happened.
 */
export async function importResearchCycle(state,{idea,profile,captures,finish=null,product_id=null,name,chat_id,actor='owner',now=new Date()}){
  const {id,ws}=await state.createSession({mode:MODES.NEW_PRODUCT,idea,profile,product_id,name,chat_id,actor});
  for(const c of captures)await ws.importCapture({rows:c.rows??[],unavailable:c.unavailable??[],recorded_at:c.recorded_at??null,recorded_by:c.recorded_by??actor,note:c.note??null},{now});
  if(finish){
    if(ws.state().readiness.status==='EXPANSION_RECOMMENDED')await ws.nextRound({now});
    await ws.finish({by:finish.decided_by??actor,note:finish.note??null,now:finish.at?new Date(finish.at):now});
  }
  const st=ws.state();
  if(READY(st.readiness.status)){
    const {pkg,result}=await ws.score({now});
    await state.touch(id,x=>{x.status='scored';x.scored={at:now.toISOString(),package_id:pkg.package_id,readiness:st.readiness.status,confidence:result.confidence,
      primary:result.primary_keyword,secondary:result.secondary_keywords,supporting:result.supporting_keywords};});
  }
  return {id,readiness:st.readiness.status};
}
