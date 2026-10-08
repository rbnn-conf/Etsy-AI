// Owner research workflow over a folder (ADR-034): plan, rounds and versioned
// research (ResearchStore, write-once). ResearchWorkspace is the one
// file-backed implementation, used by scripts/research.mjs (CLI) and by the
// Telegram SEO panel (ADR-036). Local files only: no network, no model, no
// Etsy, no Telegram.
//
//   <dir>/workspace.json  plan.json  profile.json  [listing.json]
//   <dir>/research/<research_id>/vNNN.json      <dir>/rounds/round-NN.json
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { validateIdea, MODES } from './idea.mjs';
import { createResearchSet, ResearchStore } from './research.mjs';
import { validateProfile } from './relevance.mjs';
import { validateSnapshot } from './listing.mjs';
import { createResearchPlan, applyResearch, markUnavailable, normaliseQuery, researchPlanReport } from './planner.mjs';
import { opportunityReport } from './report.mjs';
import { createListingResearchPlan, createInitialRound, researchState, nextResearchRound, markRoundTermUnavailable, clusterKeywords, buildEvidencePackage,
  scoreEvidencePackage, auditListingFromEvidence, roundReport, statusReport, discoveredReport, clustersReport, finishWithCurrentEvidence } from './expansion.mjs';

const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
const writeJson=(p,v)=>writeFile(p,JSON.stringify(v,null,2)+'\n');
const USAGE=`usage: research <command> --dir <workspace>
  init --idea <idea.json> | --listing <snapshot.json>   --profile <profile.json> --research-id <id>
  status        research status, budget and readiness
  round         the current research round (what to search)
  next-round    create the next expansion round from discovered terms
  import <capture.json>   captured rows ({rows, unavailable?, unavailable_all_requested?}) → new research version
  unavailable <term> [--note <text>]
  finish [--by <name>] [--note <text>]   FINISH_WITH_CURRENT_EVIDENCE: stop expansion; unresearched terms stay unknown
  discovered    discovered related terms and decisions
  clusters      buyer-intent clusters of captured research
  readiness     readiness status and reasons
  score         evidence package → Opportunity Engine (only when ready)`;

/** Previous version's observations back to raw rows, then this capture's rows replace same keywords. */
export function mergeCapture(previous,rows){
  const back=(previous?.observations??[]).map(({observation_id,...o})=>o);
  const keys=new Set(rows.map(r=>normaliseQuery(r.keyword)));
  return [...back.filter(o=>!keys.has(normaliseQuery(o.keyword))),...rows];
}
const roundFile=n=>`round-${String(n).padStart(2,'0')}.json`;
const pad2=n=>String(n).padStart(2,'0');
const readinessLines=s=>[`READINESS: ${s.readiness.status}`,...s.readiness.reasons.map(x=>`- ${x}`),...s.readiness.warnings.map(x=>`- warning: ${x}`)];

/**
 * One research session on disk. Every rule (plan, relevance, expansion,
 * readiness, evidence, scoring) is the engine's; this class only loads and
 * saves its files. Research versions stay write-once; a round file is
 * written once at creation and updated only by unavailable / finish records.
 */
export class ResearchWorkspace{
  constructor(dir,d){this.dir=dir;Object.assign(this,d);}
  static async create({dir,mode,idea=null,snapshot=null,profile,research_id,meta={},now=new Date()}){
    const pv=validateProfile(profile);
    if(!pv.ok)throw new Error(`invalid profile: ${pv.errors.join('; ')}`);
    if(!research_id)throw new Error('research_id is required');
    await mkdir(join(dir,'rounds'),{recursive:true});
    let plan;
    if(mode===MODES.EXISTING_LISTING){
      const sv=validateSnapshot(snapshot);if(!sv.ok)throw new Error(`invalid listing: ${sv.errors.join('; ')}`);
      plan=createListingResearchPlan({snapshot,profile:pv.profile,now});await writeJson(join(dir,'listing.json'),snapshot);
    }else{
      const iv=validateIdea(idea);if(!iv.ok)throw new Error(`invalid idea: ${iv.errors.join('; ')}`);
      plan=createResearchPlan({idea:iv.idea,now});mode=MODES.NEW_PRODUCT;
    }
    await writeJson(join(dir,'workspace.json'),{schema_version:1,mode,research_id,...meta});
    await writeJson(join(dir,'plan.json'),plan);await writeJson(join(dir,'profile.json'),profile);
    await writeJson(join(dir,'rounds',roundFile(1)),createInitialRound({plan,profile:pv.profile,now}));
    return ResearchWorkspace.open(dir);
  }
  static async open(dir){
    const ws=await readJson(join(dir,'workspace.json')), plan=await readJson(join(dir,'plan.json')), rawProfile=await readJson(join(dir,'profile.json'));
    const pv=validateProfile(rawProfile);if(!pv.ok)throw new Error(`invalid profile: ${pv.errors.join('; ')}`);
    const store=new ResearchStore(join(dir,'research')), research=await store.load(ws.research_id);
    const files=(await readdir(join(dir,'rounds')).catch(()=>[])).filter(f=>/^round-\d{2}\.json$/.test(f)).sort();
    const rounds=await Promise.all(files.map(f=>readJson(join(dir,'rounds',f))));
    const listing=ws.mode===MODES.EXISTING_LISTING?await readJson(join(dir,'listing.json')):null;
    return new ResearchWorkspace(dir,{ws,mode:ws.mode,plan,rawProfile,profile:pv.profile,store,rounds,listing,
      research:research??{research_id:ws.research_id,version:0,observations:[]},hasResearch:!!research});
  }
  state(){return researchState({plan:this.plan,profile:this.profile,research:this.research,rounds:this.rounds});}
  async #saveRound(r){await writeJson(join(this.dir,'rounds',roundFile(r.round_number)),r);this.rounds=[...this.rounds.filter(x=>x.round_number!==r.round_number),r].sort((a,b)=>a.round_number-b.round_number);}
  async #savePlan(p){await writeJson(join(this.dir,'plan.json'),p);this.plan=p;}

  /**
   * A capture: rows become the next research version (merged with the previous one: each version is a
   * complete capture set), then the plan is updated; listed terms are marked unavailable (unknown, not zero).
   */
  async importCapture({rows=[],unavailable=[],unavailable_all_requested=false,recorded_at=null,recorded_by='owner',note=null},{now=new Date()}={}){
    let research=this.research;
    if(rows.length){
      research=createResearchSet({research_id:this.ws.research_id,rows:mergeCapture(this.hasResearch?this.research:null,rows),recorded_at:recorded_at??now.toISOString(),
        recorded_by,note,previous:this.hasResearch?this.research:null});
      await this.store.save(research);this.research=research;this.hasResearch=true;
    }
    let plan=this.hasResearch?applyResearch(this.plan,research,{now}):this.plan;
    let last=this.rounds.at(-1);
    const marks=[...unavailable];
    if(unavailable_all_requested&&last.round_number>=2)for(const t of last.requested_terms)if(!research.observations.some(o=>normaliseQuery(o.keyword)===t.normalized_term))marks.push({term:t.term,note});
    for(const u of marks){
      if(plan.queries.some(q=>q.normalized_query===normaliseQuery(u.term)))plan=markUnavailable(plan,u.term,{note:u.note??null,now});
      else last=markRoundTermUnavailable(last,u.term,{note:u.note??null});
    }
    await this.#savePlan(plan);await this.#saveRound(last);
    return {research,imported:rows.length,marked:marks.map(u=>u.term)};
  }
  /** Etsy showed no data for a planned or requested term: unavailable (unknown, not zero). */
  async markUnavailable(term,{note=null,now=new Date()}={}){
    if(this.plan.queries.some(q=>q.normalized_query===normaliseQuery(term))){await this.#savePlan(markUnavailable(this.plan,term,{note,now}));return 'plan';}
    await this.#saveRound(markRoundTermUnavailable(this.rounds.at(-1),term,{note}));return 'round';
  }
  async nextRound({now=new Date()}={}){
    const r=nextResearchRound({plan:this.plan,profile:this.profile,research:this.research,rounds:this.rounds,now});
    await writeFile(join(this.dir,'rounds',roundFile(r.round_number)),JSON.stringify(r,null,2)+'\n',{flag:'wx'});
    this.rounds=[...this.rounds,r];
    return r;
  }
  /** FINISH_WITH_CURRENT_EVIDENCE (ADR-035), recorded on the latest round. */
  async finish({by='owner',note=null,now=new Date()}={}){
    const rounds=finishWithCurrentEvidence({rounds:this.rounds,research:this.hasResearch?this.research:null,decided_by:by,note,now});
    await this.#saveRound(rounds.at(-1));
    return rounds.at(-1);
  }
  async evidencePackage({now=new Date()}={}){
    const pkg=buildEvidencePackage({plan:this.plan,profile:this.profile,research:this.research,rounds:this.rounds,now});
    await writeJson(join(this.dir,'evidence-package.json'),pkg);
    return pkg;
  }
  /** Evidence package → the unchanged Opportunity Engine (and, for a listing, the audit proposal). */
  async score({now=new Date()}={}){
    const pkg=await this.evidencePackage({now});
    if(this.mode===MODES.EXISTING_LISTING){const audit=auditListingFromEvidence({snapshot:this.listing,profile:this.profile,pkg,now});return {pkg,result:audit.opportunity,audit};}
    return {pkg,result:scoreEvidencePackage({pkg,profile:this.profile}),audit:null};
  }
  /** Every stored research version (write-once history), oldest first. */
  async researchVersions(){
    const out=[];for(const v of await this.store.versions(this.ws.research_id))out.push(await this.store.load(this.ws.research_id,v));
    return out;
  }
  /**
   * Research terms with stable keys: "p07" = plan query 7, "r2n03" = round 2 requested term 3,
   * each with its live ledger state (planned, research_requested, captured, unavailable, owner_stopped).
   */
  terms(state=this.state()){
    const by=new Map(state.ledger.map(e=>[e.normalized_term,e]));
    const plan=this.plan.queries.map((q,i)=>({key:`p${pad2(i+1)}`,term:q.query,normalized_term:q.normalized_query,priority:q.priority,required:q.required,reason:q.reason,
      origin:'plan',state:by.get(q.normalized_query)?.state??'planned',relevance_class:by.get(q.normalized_query)?.relevance_class??null}));
    const exp=this.rounds.filter(r=>r.round_number>=2).flatMap(r=>r.requested_terms.map((t,i)=>({key:`r${r.round_number}n${pad2(i+1)}`,term:t.term,normalized_term:t.normalized_term,
      priority:null,required:true,reason:t.reason,origin:'expansion',round_number:r.round_number,discovered_from:t.discovered_from,
      state:by.get(t.normalized_term)?.state??'research_requested',relevance_class:t.relevance_class})));
    return [...plan,...exp];
  }
  termByKey(key){return this.terms().find(t=>t.key===key)??null;}
  /** Required terms still waiting for the owner: P1 plan queries, then requested expansion terms. */
  pendingRequired(state=this.state()){return this.terms(state).filter(t=>t.required&&['planned','research_requested'].includes(t.state));}
  /** Required research done (captured or unavailable) out of required terms asked for so far. */
  progress(state=this.state()){
    const req=this.terms(state).filter(t=>t.required&&t.state!=='owner_stopped');
    return {done:req.filter(t=>['captured','unavailable'].includes(t.state)).length,total:req.length};
  }
}

/** Run one workflow command. @returns the text to print */
export async function runResearchCommand(argv,{now=new Date()}={}){
  const args=[...argv], cmd=args.shift(), opt=k=>{const i=args.indexOf(`--${k}`);return i>=0?args[i+1]:null;};
  const dir=opt('dir');
  if(!cmd||!dir)return USAGE;
  if(cmd==='init'){
    const profile=await readJson(opt('profile')), research_id=opt('research-id');
    if(!research_id)throw new Error('--research-id is required');
    const w=opt('listing')?await ResearchWorkspace.create({dir,mode:MODES.EXISTING_LISTING,snapshot:await readJson(opt('listing')),profile,research_id,now})
      :await ResearchWorkspace.create({dir,mode:MODES.NEW_PRODUCT,idea:await readJson(opt('idea')),profile,research_id,now});
    return `${researchPlanReport(w.plan)}\n\nWorkspace ready: ${dir}`;
  }
  const w=await ResearchWorkspace.open(dir);
  switch(cmd){
    case 'status':return statusReport(w.state());
    case 'round':return roundReport(w.rounds.at(-1));
    case 'readiness':return readinessLines(w.state()).join('\n');
    case 'discovered':return discoveredReport(w.state());
    case 'clusters':return clustersReport(clusterKeywords({state:w.state(),profile:w.profile}));
    case 'next-round':return roundReport(await w.nextRound({now}));
    case 'unavailable':{
      const term=args[0], where=await w.markUnavailable(term,{note:opt('note'),now});
      return where==='plan'?`"${term}" marked unavailable in the research plan (unknown, not zero).`:`"${term}" marked unavailable in round ${w.rounds.at(-1).round_number} (unknown, not zero).`;
    }
    case 'finish':case 'finish-with-current-evidence':case 'FINISH_WITH_CURRENT_EVIDENCE':{
      const last=await w.finish({by:opt('by')??'owner',note:opt('note'),now});
      return [`FINISH_WITH_CURRENT_EVIDENCE recorded on round ${last.round_number} by ${last.owner_finished.decided_by}.`,
        `Not researched (kept unknown, never evidence): ${last.owner_finished.terms_not_researched.join(', ')||'none'}`,'',...readinessLines(w.state())].join('\n');
    }
    case 'import':{
      const cap=await readJson(args[0]);
      const r=await w.importCapture({rows:cap.rows??[],unavailable:cap.unavailable??[],unavailable_all_requested:!!cap.unavailable_all_requested,
        recorded_at:cap.recorded_at??null,recorded_by:cap.recorded_by??'owner',note:cap.note??null},{now});
      const out=[];
      if(r.imported)out.push(`Research ${r.research.research_id} v${r.research.version}: ${r.research.observations.length} observations (${r.imported} imported).`);
      for(const t of r.marked)out.push(`"${t}" marked unavailable (unknown, not zero).`);
      out.push('',...readinessLines(w.state()));
      return out.join('\n');
    }
    case 'score':{
      const {pkg,result,audit}=await w.score({now});
      const head=`Evidence package ${pkg.package_id} (${pkg.captured_observations.length} captured observations, ${pkg.readiness_status})`;
      if(audit)return [head,'',opportunityReport(audit.opportunity,{title:'SEO audit (proposal only; product and Etsy untouched)'}),
        '',`Recommended primary intent: ${audit.recommended_primary_intent??'none (research required)'}`,`Primary keyword change: ${JSON.stringify(audit.primary_keyword_change)}`].join('\n');
      return [head,'',opportunityReport(result,{title:'Opportunity analysis from the evidence package'})].join('\n');
    }
    default:return USAGE;
  }
}
