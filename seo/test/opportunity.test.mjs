// SEO Opportunity Engine v1 (ADR-032). LumiumX internal score, NOT the Etsy
// algorithm. Fixtures only: no network, no model, no Etsy, no Telegram, no
// Production Engine. Expected numbers are recomputed here from the published
// formula, independently of the implementation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createResearchSet, validateIdea, validateProfile, classifyKeyword, scoreOpportunities, opportunityReport, diagnosticsTable,
  demandScore, competitionScore, conversionScore, trendScore, seasonalityScore, relevanceScore, finalScore, round1,
  WEIGHTS, RELEVANCE_VALUES, CONVERSION_VALUES, SEASONALITY_VALUES, DEMAND_REFERENCE, COMPETITION_REFERENCE, CLOSE_COMPETITION_POINTS,
  scoreBrief, submitForOwnerReview, recordOwnerDecision, validateBrief, createProductionHandoff, briefSha, createBriefDraft,
  createListingRecommendation, tagCandidates, validatePerformance, signature, CONVERSION_LABELS } from '../src/index.mjs';

const ROOT=join(import.meta.dirname,'..'), REPO=join(ROOT,'..');
const json=async p=>JSON.parse(await readFile(join(ROOT,p),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const seed=async()=>{const f=await json('fixtures/marketplace-insights/manual-capture-01.json');return createResearchSet({research_id:f.research_id,rows:f.rows,recorded_at:f.recorded_at,recorded_by:f.recorded_by});};
const profile=async id=>{const v=validateProfile(await json(`fixtures/profiles/${id}.json`));assert.ok(v.ok,v.errors.join());return v.profile;};
const idea=async()=>validateIdea(await json('fixtures/ideas/cozy-autumn-colouring-adults.json')).idea;
const row=(keyword,searches_30d,search_results,conversion_label,trend_percent=null)=>({keyword,searches_30d,search_results,conversion_label,trend_percent,captured_at:null,
  source:{type:'etsy_marketplace_insights',method:'manual',captured_by:'test'}});
const research=rows=>createResearchSet({research_id:'unit',rows,recorded_at:'2026-09-29',recorded_by:'test'});
// A small autumn-colouring profile for constructed cases.
const P=(extra={})=>{const v=validateProfile({schema_version:1,profile_id:'unit-autumn',describes:{mode:'NEW_PRODUCT',ref:'test'},source:'test',seasonality:null,notes:null,
  central_themes:['autumn'],formats:['coloring pages','coloring book'],components:[],audiences:['adults'],attributes:['cozy','printable'],tangential:['pumpkin'],...extra});assert.ok(v.ok,v.errors.join());return v.profile;};
const score=(rows,opts={})=>scoreOpportunities({profile:opts.profile??P(opts.p),research:research(rows),context:opts.context,extra_keywords:opts.extra});
const byKw=(r,k)=>r.diagnostics.find(x=>x.keyword===k);
// Independent re-implementation of the published formula (spec §6–§10).
const L=Math.log10, D=s=>Math.min(100,Math.max(0,100*L(1+s)/L(1+10000))), C=r=>Math.min(100,Math.max(0,100*(1-L(1+Math.min(r,1e6))/L(1+1e6))));
const F=({d,c,cv,rel,t=50,s=50})=>d*0.20+c*0.15+cv*0.30+rel*0.25+t*0.05+s*0.05;
const near=(a,b,msg)=>assert.ok(Math.abs(a-b)<1e-9,`${msg??''} ${a} ≠ ${b}`);

test('exact scoring mathematics: every component and the final formula match the published definitions',()=>{
  assert.equal(DEMAND_REFERENCE,10000);assert.equal(COMPETITION_REFERENCE,1000000);
  near(Object.values(WEIGHTS).reduce((a,b)=>a+b,0),1,'weights sum');
  assert.deepEqual({...WEIGHTS},{demand:0.20,competition:0.15,conversion:0.30,relevance:0.25,trend:0.05,seasonality:0.05});
  assert.deepEqual({...RELEVANCE_VALUES},{EXACT:100,STRONG:85,SUPPORTING:65,WEAK:30,IRRELEVANT:0});
  assert.deepEqual({...CONVERSION_VALUES},{very_high:100,high:80,typical:60,low:30,very_low:10,unknown:40});
  assert.deepEqual({...SEASONALITY_VALUES},{peak:100,in_season:85,approaching:70,evergreen:70,off_season:35,unknown:50});
  for(const s of [0,1,14,98,99,100,2300,4800,9999,10000])near(demandScore(s),D(s),`demand(${s})`);
  near(demandScore(99),100*2/L(10001));assert.ok(demandScore(99)<50&&demandScore(100)>50,'demand midpoint sits at ~100 searches');
  for(const r of [0,1,999,4500,29100,138700,999999,1000000])near(competitionScore(r),C(r),`competition(${r})`);
  assert.equal(demandScore(10000),100);assert.equal(competitionScore(0),100);assert.equal(competitionScore(1000000),0);
  assert.deepEqual([20,0,-20].map(t=>trendScore(t).score),[70,50,30]);
  for(const [k,v] of Object.entries(CONVERSION_VALUES))assert.equal(conversionScore(k),v);
  for(const [k,v] of Object.entries(RELEVANCE_VALUES))assert.equal(relevanceScore(k),v);
  for(const [k,v] of Object.entries(SEASONALITY_VALUES))assert.deepEqual(seasonalityScore(k),{score:v,missing:false});
  // fall coloring pages for the autumn idea: EXACT, 2300 / 29100 / very_high, no trend, no seasonality.
  const fall=F({d:D(2300),c:C(29100),cv:100,rel:100});
  near(finalScore({demand:D(2300),competition:C(29100),conversion:100,relevance:100,trend:50,seasonality:50}),fall);
  assert.equal(round1(fall),80.6);
  assert.equal(finalScore({demand:100,competition:100,conversion:100,relevance:100,trend:100,seasonality:100}),100);
  assert.equal(finalScore({demand:0,competition:0,conversion:0,relevance:0,trend:0,seasonality:0}),0);
  assert.throws(()=>demandScore(-1),/whole number/);assert.throws(()=>conversionScore('medium'),/unknown conversion label/);assert.throws(()=>seasonalityScore('winter'),/unknown seasonality/);
});

test('component and final bounds: always within [0,100] across extreme inputs',()=>{
  const S=[0,1,5,99,100,10000,10001,1e6,1e9,Number.MAX_SAFE_INTEGER], T=[-1000,-100,-50,0,50,100,1000];
  for(const s of S){assert.ok(demandScore(s)>=0&&demandScore(s)<=100);assert.ok(competitionScore(s)>=0&&competitionScore(s)<=100);}
  for(const t of T){const v=trendScore(t).score;assert.ok(v>=0&&v<=100);}
  assert.equal(trendScore(1000).score,100);assert.equal(trendScore(-1000).score,0);
  for(const s of S)for(const r of S)for(const l of CONVERSION_LABELS)for(const cls of Object.keys(RELEVANCE_VALUES)){
    const f=finalScore({demand:demandScore(s),competition:competitionScore(r),conversion:conversionScore(l),relevance:relevanceScore(cls),trend:trendScore(T[s%7]??0).score,seasonality:50});
    assert.ok(f>=0&&f<=100,`${s} ${r} ${l} ${cls}: ${f}`);
  }
});

test('deterministic: same inputs give byte-identical results; capture order does not change any score or decision',async()=>{
  const rows=(await json('fixtures/marketplace-insights/manual-capture-01.json')).rows, p=await profile('cozy-autumn-colouring-adults');
  const a=scoreOpportunities({profile:p,research:research(rows)});
  assert.equal(JSON.stringify(a),JSON.stringify(scoreOpportunities({profile:p,research:research(rows)})));
  // A reversed capture is a different research record (its checksum covers missing_values in capture
  // order), but every score, role and reason is identical.
  const b=scoreOpportunities({profile:p,research:research([...rows].reverse())});
  const strip=r=>{const c=structuredClone(r);delete c.inputs.research.sha256;return JSON.stringify(c);};
  assert.equal(strip(a),strip(b));
});

test('deterministic tie breaking: rounded score, then relevance class, conversion, demand, competition, keyword',()=>{
  // Identical data → lexical order.
  let r=score([row('autumn coloring pages',500,20000,'high'),row('autumn coloring book',500,20000,'high')]);
  assert.deepEqual(r.diagnostics.slice(0,2).map(x=>x.keyword),['autumn coloring book','autumn coloring pages']);
  // Same rounded score, different conversion: higher conversion first, even with a (sub-rounding) lower raw score.
  const tieOn=(make,pick)=>{for(let s=100;s<10000;s++){const rr=score(make(s));const [a,b]=pick(rr);if(round1(a.final_opportunity_score)===round1(b.final_opportunity_score))return rr;}return null;};
  r=tieOn(s=>[row('autumn coloring pages',100,1000,'very_high'),row('autumn coloring book',s,1000,'high')],rr=>[byKw(rr,'autumn coloring pages'),byKw(rr,'autumn coloring book')]);
  assert.ok(r,'a same-rounded-score pair exists');
  assert.equal(r.primary_keyword,'autumn coloring pages','higher conversion wins the tie');
  // Same rounded score, different relevance class: EXACT beats STRONG.
  r=tieOn(s=>[row('autumn coloring pages',100,1000,'high'),row('adults coloring pages',s,1000,'high')],rr=>[byKw(rr,'autumn coloring pages'),byKw(rr,'adults coloring pages')]);
  assert.ok(r);assert.equal(byKw(r,'adults coloring pages').relevance_class,'STRONG');assert.equal(r.primary_keyword,'autumn coloring pages','EXACT wins the tie');
});

test('close competition: #1 − #2 ≤ 5.0 points is flagged, > 5.0 is not; the primary is never lowered',()=>{
  assert.equal(CLOSE_COMPETITION_POINTS,5);
  // Trend +50 (100) vs −50 (0): exactly 0.05 × 100 = 5.0 points apart.
  let r=score([row('autumn coloring pages',500,20000,'high',50),row('autumn coloring book',500,20000,'high',-50)]);
  near(r.close_competition_detail.difference,5);assert.equal(r.close_competition,true);assert.equal(r.primary_keyword,'autumn coloring pages');
  assert.ok(r.confidence_triggers.some(t=>t.condition==='close_competition'));
  // very_high vs high: 0.30 × 20 = 6.0 points apart.
  r=score([row('autumn coloring pages',500,20000,'very_high'),row('autumn coloring book',500,20000,'high')]);
  near(r.close_competition_detail.difference,6);assert.equal(r.close_competition,false);
  assert.equal(score([row('autumn coloring pages',500,20000,'high')]).close_competition,false,'one candidate: nothing to be close to');
});

test('high volume + very low conversion does not automatically win',()=>{
  const r=score([row('autumn coloring pages',10000,20000,'very_low'),row('autumn coloring book',500,20000,'very_high')]);
  assert.equal(r.primary_keyword,'autumn coloring book');
  const big=byKw(r,'autumn coloring pages');assert.equal(big.selected_role,'SUPPORTING','accurate: kept but de-emphasised, not rejected');
  assert.ok(big.decision_reasons.some(x=>/de-emphasised: very low conversion/.test(x)));
});

test('relevance guardrail: an irrelevant or weak phrase never becomes primary, even with the higher score',()=>{
  const r=score([row('christmas coloring pages',10000,1000,'very_high'),row('pumpkin coloring pages',10000,1000,'very_high'),row('autumn coloring book',50,50000,'typical')]);
  const xmas=byKw(r,'christmas coloring pages'), weak=byKw(r,'pumpkin coloring pages'), ok=byKw(r,'autumn coloring book');
  assert.equal(xmas.relevance_class,'IRRELEVANT');assert.equal(weak.relevance_class,'WEAK');
  assert.ok(xmas.final_opportunity_score>ok.final_opportunity_score&&weak.final_opportunity_score>ok.final_opportunity_score,'both outscore the accurate phrase');
  assert.equal(r.primary_keyword,'autumn coloring book');
  assert.deepEqual(xmas.rejection_reasons,['irrelevant']);assert.deepEqual(weak.rejection_reasons,['weak_relevance']);
  assert.ok(xmas.decision_reasons.some(x=>/scores higher than the primary but cannot be primary: relevance guardrail/.test(x)));
  // Only weak/supporting evidence: no primary, research required; nothing is promoted.
  const none=score([row('pumpkin coloring pages',5000,1000,'very_high'),row('cozy coloring book',5000,1000,'very_high')]);
  assert.equal(none.primary_keyword,null);assert.equal(none.research_required,true);assert.equal(none.confidence,'low');
  assert.equal(byKw(none,'cozy coloring book').selected_role,'SUPPORTING','SUPPORTING is never promoted in v1');
});

test('relevance classes follow the documented rules (idea first: an unrelated product is IRRELEVANT)',async()=>{
  const p=await profile('cozy-autumn-colouring-adults');
  const cls=k=>classifyKeyword(k,p).relevance_class;
  assert.equal(cls('fall coloring pages'),'EXACT');assert.equal(cls('Autumn Colouring Pages'),'EXACT','UK spelling and case');
  assert.equal(cls('adult coloring pages'),'STRONG');assert.equal(cls('cozy coloring book'),'SUPPORTING');
  assert.equal(cls('pumpkin coloring pages'),'WEAK');assert.equal(cls('cozy'),'WEAK');
  assert.equal(cls('family christmas card'),'IRRELEVANT');assert.equal(cls('halloween coloring pages'),'IRRELEVANT');assert.equal(cls('for the'),'IRRELEVANT');
  const g=await profile('006-cute-ghost-halloween');
  assert.equal(classifyKeyword('halloween activity book',g).relevance_class,'EXACT');
  assert.equal(classifyKeyword('halloween coloring pages',g).relevance_class,'STRONG','a part of the product');
  assert.equal(classifyKeyword('kids activity book',g).relevance_class,'STRONG');
  assert.equal(signature('Coloring Pages, Fall'),signature('fall coloring page'));
  assert.equal(validateProfile({...(await json('fixtures/profiles/cozy-autumn-colouring-adults.json')),attributes:['autumn']}).ok,false,'a word has one facet');
});

test('competition, conversion and demand each move the score by exactly their weight',()=>{
  const base=[row('autumn coloring pages',1000,10000,'typical')];
  const b=score(base).diagnostics[0].final_opportunity_score;
  const comp=score([row('autumn coloring pages',1000,1000,'typical')]).diagnostics[0].final_opportunity_score;
  near(comp-b,0.15*(C(1000)-C(10000)),'competition');assert.ok(comp>b,'fewer results → higher');
  const conv=score([row('autumn coloring pages',1000,10000,'very_high')]).diagnostics[0].final_opportunity_score;
  near(conv-b,0.30*40,'conversion');
  const dem=score([row('autumn coloring pages',5000,10000,'typical')]).diagnostics[0].final_opportunity_score;
  near(dem-b,0.20*(D(5000)-D(1000)),'demand');
});

test('missing trend and missing seasonality: neutral 50, flagged, affect confidence not the score',()=>{
  const r=score([row('autumn coloring pages',1000,10000,'high'),row('autumn coloring book',900,10000,'typical',0),row('adults coloring pages',800,10000,'typical',0)]);
  const p=byKw(r,'autumn coloring pages');
  assert.equal(p.trend_score,50);assert.equal(p.trend_missing,true);assert.equal(p.seasonality_score,50);assert.equal(p.seasonality_missing,true);
  near(p.final_opportunity_score,score([row('autumn coloring pages',1000,10000,'high',0)]).diagnostics[0].final_opportunity_score,'missing trend = 0% trend');
  assert.deepEqual(r.confidence_triggers.map(t=>t.condition),['trend_missing','seasonality_missing']);assert.equal(r.confidence,'medium','missing trend/season alone never gives low');
  const peak=score([row('autumn coloring pages',1000,10000,'high',0)],{p:{seasonality:'peak'}}).diagnostics[0];
  near(peak.final_opportunity_score-p.final_opportunity_score,0.05*50);assert.equal(peak.seasonality_missing,false);
});

test('unknown conversion scores 40 and makes confidence low; zero searches, zero results and very large values',()=>{
  const u=score([row('autumn coloring pages',1000,10000,'unknown',0),row('autumn coloring book',50,90000,'typical',0),row('adults coloring book',60,90000,'typical',0)],{p:{seasonality:'in_season'}});
  assert.equal(u.primary_keyword,'autumn coloring pages');assert.equal(byKw(u,'autumn coloring pages').conversion_score,40);
  assert.equal(u.confidence,'low');assert.ok(u.confidence_triggers.some(t=>t.condition==='primary_conversion_unknown'));
  const z=score([row('autumn coloring pages',0,0,'very_high'),row('autumn coloring book',10,500,'typical')]);
  const zero=byKw(z,'autumn coloring pages');
  assert.equal(zero.demand_score,0);assert.equal(zero.competition_score,100);assert.deepEqual(zero.rejection_reasons,['insufficient_demand']);
  assert.equal(z.primary_keyword,'autumn coloring book','no searches: not a primary');
  const big=score([row('autumn coloring pages',Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER,'high')]).diagnostics[0];
  assert.equal(big.demand_score,100);assert.equal(big.competition_score,0);assert.deepEqual(big.rejection_reasons,['poor_competitive_opportunity']);
  assert.ok(big.final_opportunity_score<=100);
  // Not captured is not zero: a null count leaves the keyword unscored, never scored as 0.
  const n=score([row('autumn coloring pages',null,5000,'high'),row('autumn coloring book',500,5000,'high')]);
  assert.equal(byKw(n,'autumn coloring pages').final_opportunity_score,null);assert.deepEqual(byKw(n,'autumn coloring pages').rejection_reasons,['missing_market_evidence']);
});

test('duplicate intent: the same words in another order are kept once',()=>{
  const r=score([row('autumn coloring pages',900,10000,'high'),row('coloring pages autumn',800,10000,'high')]);
  assert.deepEqual(byKw(r,'coloring pages autumn').rejection_reasons,['duplicate_intent']);assert.equal(r.secondary_keywords.length,0);
});

test('confidence HIGH / MEDIUM / LOW from evidence completeness (never an Etsy prediction)',()=>{
  const full=[row('autumn coloring pages',3000,10000,'very_high',10),row('autumn coloring book',800,30000,'typical',0),row('adults coloring pages',600,50000,'typical',-5)];
  const hi=score(full,{p:{seasonality:'in_season'}});
  assert.equal(hi.confidence,'high');assert.deepEqual(hi.confidence_triggers,[]);assert.equal(hi.close_competition,false);
  const two=score(full.slice(0,2),{p:{seasonality:'in_season'}});
  assert.equal(two.confidence,'medium');assert.deepEqual(two.confidence_triggers.map(t=>t.condition),['only_two_relevant_observations']);
  const one=score(full.slice(0,1),{p:{seasonality:'in_season'}});assert.equal(one.confidence,'low');assert.ok(one.confidence_triggers.some(t=>t.condition==='only_one_viable_observation'));
  assert.equal(score(full,{p:{seasonality:'in_season'},context:{research_stale:true}}).confidence,'low');
  const c=score(full,{p:{seasonality:'in_season'},context:{evidence_conflicts:['two captures disagree on searches']}});
  assert.equal(c.confidence,'low');assert.match(c.confidence_triggers.at(-1).detail,/two captures disagree/);
  assert.match(hi.disclaimer,/NOT the Etsy algorithm/);
});

test('#004 audit: halloween coloring pages is preferred to halloween coloring book (not hard-coded)',async()=>{
  const r=scoreOpportunities({profile:await profile('004-cozy-spooky-halloween-colouring'),research:await seed()});
  const pages=byKw(r,'halloween coloring pages'), book=byKw(r,'halloween coloring book');
  assert.equal(pages.relevance_class,'EXACT');assert.equal(book.relevance_class,'EXACT');
  near(pages.final_opportunity_score,F({d:D(4800),c:C(24700),cv:80,rel:100}));near(book.final_opportunity_score,F({d:D(3400),c:C(19400),cv:30,rel:100}));
  assert.ok(pages.final_opportunity_score>book.final_opportunity_score);
  assert.deepEqual(explainDiffParts(book,pages)[0],'conversion','the gap is conversion (low vs high)');
  // Reported finding: the long-tail "…printable" variant edges ahead on very_high conversion; flagged as close.
  assert.equal(r.primary_keyword,'halloween coloring pages printable');assert.deepEqual(r.secondary_keywords,['halloween coloring pages','halloween coloring book']);
  assert.equal(r.close_competition,true);assert.equal(r.confidence,'medium');
  assert.equal(byKw(r,'adult coloring pages').relevance_class,'IRRELEVANT','#004 names no adult audience');
});
function explainDiffParts(row,ref){return row.comparison_with_primary?row.comparison_with_primary.parts.map(p=>p.component):[];}

test('#005 audit: fall coloring pages primary, cozy coloring book supporting; adult coloring pages depends on an owner-confirmed audience',async()=>{
  const p=await profile('005-cozy-autumn-adventures'), res=await seed();
  const r=scoreOpportunities({profile:p,research:res});
  assert.equal(r.primary_keyword,'fall coloring pages');assert.equal(byKw(r,'cozy coloring book').selected_role,'SUPPORTING');
  assert.equal(byKw(r,'adult coloring pages').relevance_class,'IRRELEVANT','the #005 listing never names adults');
  assert.deepEqual(r.secondary_keywords,[]);
  // With the owner confirming adults as an audience, the same formula gives the spec's expected shape.
  const {index,...raw}=p;
  const withAdults=scoreOpportunities({profile:validateProfile({...raw,audiences:['family','adults']}).profile,research:res});
  assert.equal(withAdults.primary_keyword,'fall coloring pages');assert.deepEqual(withAdults.secondary_keywords,['adult coloring pages']);
  assert.equal(byKw(withAdults,'cozy coloring book').selected_role,'SUPPORTING');assert.equal(withAdults.close_competition,true);
});

test('#006 audit: cute ghost coloring does not win because it contains "ghost"; broader Halloween colouring phrases compete',async()=>{
  const r=scoreOpportunities({profile:await profile('006-cute-ghost-halloween'),research:await seed()});
  const ghost=byKw(r,'cute ghost coloring');
  assert.equal(ghost.relevance_class,'STRONG');assert.notEqual(r.primary_keyword,'cute ghost coloring');
  assert.equal(ghost.selected_role,'SUPPORTING');assert.ok(ghost.market_weaknesses.length===2);
  for(const k of ['halloween coloring pages','halloween coloring book','halloween coloring pages printable'])assert.ok(byKw(r,k).eligible_for_primary,k);
  assert.ok(byKw(r,'halloween coloring pages').final_opportunity_score>ghost.final_opportunity_score+30);
  assert.equal(byKw(r,'adult coloring pages').relevance_class,'IRRELEVANT','a kids product');
});

test('Christmas audit: the winner is reported relative to the candidates, not as a strong market',async()=>{
  const r=scoreOpportunities({profile:await profile('traditional-robin-christmas-card'),research:await seed()});
  const trad=byKw(r,'traditional christmas card'), robin=byKw(r,'christmas robin card');
  near(trad.final_opportunity_score,F({d:D(98),c:C(10500),cv:60,rel:100}));near(robin.final_opportunity_score,F({d:D(14),c:C(4500),cv:10,rel:100}));
  assert.equal(r.primary_keyword,'traditional christmas card');assert.equal(robin.selected_role,'SUPPORTING');assert.equal(r.close_competition,false);
  assert.ok(trad.market_weaknesses.some(w=>/98 searches in 30 days: below 50 on the demand scale/.test(w)));
  assert.ok(r.warnings.some(w=>/best of the supplied candidates, not evidence of a strong market/.test(w)));
  assert.ok(trad.final_opportunity_score<65,'not presented as a strong opportunity');
});

test('NEW_PRODUCT demonstration: "Cozy autumn colouring pages for adults" — full diagnostics, selection, positioning, confidence',async()=>{
  const res=await seed(), i=await idea(), p=await profile('cozy-autumn-colouring-adults');
  const b=scoreBrief({idea:i,profile:p,research:res,now:new Date('2026-09-29T12:00:00Z')});
  const s=b.opportunity_scores;
  assert.equal(b.approval_status,'scored');assert.equal(b.primary_keyword,'fall coloring pages');
  assert.deepEqual(b.secondary_keywords,['adult coloring pages']);assert.ok(b.supporting_keywords.includes('cozy coloring book'));
  assert.deepEqual(b.rejected_keywords.find(x=>x.keyword==='cozy autumn coloring').reasons,['missing_market_evidence'],'owner candidate without data: not researched');
  assert.ok(b.rejected_keywords.filter(x=>/halloween|christmas/.test(x.keyword)).every(x=>x.reasons.includes('irrelevant')),'idea first');
  assert.equal(s.close_competition,true);assert.equal(b.confidence,'medium');
  // Transparency: every evaluated keyword has raw data beside every component and the decision.
  const COLS=['keyword','relevance_class','searches_30d','search_results','conversion_label','trend_percent','demand_score','competition_score','conversion_score','trend_score',
    'relevance_score','seasonality_score','final_opportunity_score','eligible_for_primary','selected_role','decision_reasons'];
  assert.equal(s.diagnostics.length,13,'12 observations + 1 unresearched owner candidate');
  for(const d of s.diagnostics)for(const c of COLS)assert.ok(c in d,`${d.keyword}.${c}`);
  // "Why did fall coloring pages beat cozy coloring book?" answered in plain text.
  const cozy=s.diagnostics.find(d=>d.keyword==='cozy coloring book');
  assert.match(cozy.decision_reasons.join(' '),/60\.5 vs primary "fall coloring pages" 80\.6 \(−20\.2\): conversion 60\.0 vs 100\.0 \(−12\.0\), relevance 65\.0 vs 100\.0 \(−8\.8\)/);
  const report=opportunityReport({...s,primary_keyword:b.primary_keyword,secondary_keywords:b.secondary_keywords,supporting_keywords:b.supporting_keywords,rejected_keywords:b.rejected_keywords,
    confidence:b.confidence,warnings:b.warnings});
  assert.match(report,/NOT the Etsy algorithm/);assert.match(diagnosticsTable(s),/\| 1 \| fall coloring pages \| EXACT \| 2300 \| 29100 \| very_high \| — \| 84\.0 \| 25\.6 \| 100\.0 \| 50\.0\* \| 100\.0 \| 50\.0\* \| 80\.6 \| yes \| PRIMARY \|/);
  assert.match(b.positioning.statement,/Position "Cozy Autumn Colouring Pages for Adults" for buyers searching "fall coloring pages", with "adult coloring pages" as secondary search intent/);
  assert.equal(b.title_direction.lead_with,'fall coloring pages');
  assert.deepEqual(b.tag_candidates.map(t=>t.tag),['fall coloring pages','adult coloring pages','cozy coloring book','cozy autumn coloring']);
  assert.ok(b.warnings.some(w=>/insufficient_valid_tag_candidates: 4 legitimate/.test(w)),'no invented tags');
  assert.deepEqual(validateBrief(b,res,i),{ok:true,errors:[]});
});

test('tag candidates: at most 13, each ≤ 20 characters, no same-word repeats, never padded',()=>{
  const r=score([row('autumn coloring pages',900,10000,'high')]);
  const extra=['autumn coloring book','coloring pages autumn','cozy autumn coloring','pumpkin coloring','autumn coloring','fall coloring','adults coloring','printable coloring',
    'autumn printable','cozy autumn','adults autumn','fall adults coloring','cozy coloring book','coloring book','cozy adults coloring','adults coloring book','cozy coloring']
    .map(k=>({keyword:k,relevance_class:classifyKeyword(k,P()).relevance_class,source:'test'}));
  const t=tagCandidates(r,extra);
  assert.equal(t.tags.length,13);assert.deepEqual(t.warnings,[]);
  assert.ok(t.tags.every(x=>x.tag.length<=20));
  assert.equal(new Set(t.tags.map(x=>signature(x.tag))).size,13);
  assert.ok(!t.tags.some(x=>x.tag==='pumpkin coloring'),'WEAK phrases are not tags');
  assert.ok(t.skipped.some(x=>x.keyword==='fall coloring'&&/same words/.test(x.reason)),'fall = autumn: same intent');
  assert.ok(t.skipped.some(x=>x.keyword==='coloring pages autumn'&&/20-character/.test(x.reason)));
  const few=tagCandidates(r,extra.slice(0,3));assert.equal(few.tags.length,2);assert.match(few.warnings[0],/insufficient_valid_tag_candidates: 2 legitimate/);
});

test('owner approval: draft → scored → owner_review → approved | rejected; research_required cannot be reviewed',async()=>{
  const res=await seed(), i=await idea(), p=await profile('cozy-autumn-colouring-adults');
  const b=scoreBrief({idea:i,profile:p,research:res});
  assert.throws(()=>recordOwnerDecision(b,{decision:'approved',decided_by:'owner'}),/cannot move from scored to approved/);
  const rv=submitForOwnerReview(b);assert.equal(rv.approval_status,'owner_review');assert.equal(b.approval_status,'scored','inputs are not mutated');
  assert.throws(()=>recordOwnerDecision(rv,{decision:'approved'}),/decided_by is required/);
  const ok=recordOwnerDecision(rv,{decision:'approved',decided_by:'owner',now:new Date('2026-09-30T09:00:00Z')});
  assert.deepEqual(ok.status_history.map(h=>h.status),['draft','scored','owner_review','approved']);
  assert.equal(ok.owner_decision.approved_positioning,b.positioning.statement);assert.deepEqual(validateBrief(ok,res,i),{ok:true,errors:[]});
  const no=recordOwnerDecision(submitForOwnerReview(b),{decision:'rejected',decided_by:'owner',note:'prefer a Halloween idea'});
  assert.equal(no.approval_status,'rejected');assert.throws(()=>submitForOwnerReview(no),/cannot move from rejected/);
  // Tampering with a stored score or selection is caught by recomputation.
  const t1=structuredClone(ok);t1.opportunity_scores.diagnostics[1].final_opportunity_score=99;
  assert.match(validateBrief(t1,res,i).errors.join(),/do not recompute/);
  const t2=structuredClone(ok);t2.primary_keyword='adult coloring pages';
  assert.match(validateBrief(t2,res,i).errors.join(),/primary_keyword does not match the recomputed scoring/);
  // No EXACT/STRONG evidence → research_required, and it cannot go to review.
  const thin=createResearchSet({research_id:'thin',rows:[row('cozy coloring book',3200,33600,'typical')],recorded_at:'2026-09-29',recorded_by:'test'});
  const rr=scoreBrief({idea:i,profile:p,research:thin});
  assert.equal(rr.approval_status,'research_required');assert.equal(rr.primary_keyword,null);assert.equal(rr.research_required,true);
  assert.throws(()=>submitForOwnerReview(rr),/cannot move from research_required to owner_review/);
  assert.deepEqual(validateBrief(rr,thin,i),{ok:true,errors:[]});
});

test('production handoff: blocked before approval; after approval it carries facts and intents only, and runs nothing',async()=>{
  const res=await seed(), i=await idea(), p=await profile('cozy-autumn-colouring-adults');
  const b=scoreBrief({idea:i,profile:p,research:res}), rv=submitForOwnerReview(b);
  for(const x of [createBriefDraft({idea:i,research:res}),b,rv,recordOwnerDecision(rv,{decision:'rejected',decided_by:'owner'})])
    assert.throws(()=>createProductionHandoff({brief:x,idea:i,research:res}),/production handoff refused: the SEO brief is "(draft|scored|owner_review|rejected)"/);
  const ok=recordOwnerDecision(rv,{decision:'approved',decided_by:'owner',now:new Date('2026-09-30T09:00:00Z')});
  const h=createProductionHandoff({brief:ok,idea:i,research:res});
  const schema=await json('schemas/production-handoff.schema.json');
  assert.deepEqual(Object.keys(h).sort(),[...schema.required].sort());
  assert.equal(h.primary_search_intent,'fall coloring pages');assert.deepEqual(h.secondary_search_intents,['adult coloring pages']);
  assert.equal(h.approved_concept,i.concept);assert.deepEqual(h.theme,i.themes);assert.equal(h.seo_brief_reference.sha256,briefSha(ok));
  assert.deepEqual(h.seo_research_reference,ok.research_version);
  assert.doesNotMatch(JSON.stringify(h),/score|relevance_class|diagnostic|weight|confidence/i,'no scoring internals cross the boundary');
  const tampered=structuredClone(ok);tampered.secondary_keywords=['halloween coloring pages'];
  assert.throws(()=>createProductionHandoff({brief:tampered,idea:i,research:res}),/invalid brief/);
  assert.throws(()=>createProductionHandoff({brief:ok,idea:{...i,working_name:'Christmas Cards'},research:res}),/does not match the approved brief/);
});

test('EXISTING_LISTING recommendation: current vs recommended positioning; never regenerates the product or touches Etsy',async()=>{
  const res=await seed();
  const LIST=['004-cozy-spooky-halloween-colouring','005-cozy-autumn-adventures','006-cute-ghost-halloween','traditional-robin-christmas-card'];
  const snaps=await Promise.all(LIST.map(id=>json(`fixtures/listings/${id}.json`)));
  const files=[];for(const s of snaps)if(await readFile(join(REPO,s.source.file)).then(()=>true,()=>false))files.push(s.source.file);
  const before=await Promise.all(files.map(async f=>sha(await readFile(join(REPO,f)))));
  const recs=[];for(const [n,s] of snaps.entries())recs.push(createListingRecommendation({snapshot:s,profile:await profile(LIST[n]),research:res,now:new Date('2026-09-29T12:00:00Z')}));
  assert.deepEqual(await Promise.all(files.map(async f=>sha(await readFile(join(REPO,f))))),before,'product files byte-identical');
  for(const r of recs){
    assert.equal(r.product_action,'none');assert.equal(r.etsy_action,'none');
    for(const k of ['current_primary_intent','recommended_primary_intent','retained_terms','terms_to_add','terms_to_deemphasise','primary_keyword_change','reasoning','title_direction',
      'tag_candidates','description_keyword_plan','pricing_evidence','thumbnail_marketing_search_intent'])assert.ok(k in r,k);
    assert.ok(r.tag_candidates.length<=13&&r.tag_candidates.every(t=>t.tag.length<=20));
  }
  const [r4,r5,r6,rx]=recs;
  assert.deepEqual(r5.current_primary_intent,{title_lead:'Cozy Autumn Coloring Book Printable',matched_keyword:'cozy coloring book',relevance_class:'SUPPORTING',
    final_opportunity_score:byKw(r5.opportunity,'cozy coloring book').final_opportunity_score,role:'SUPPORTING'});
  assert.deepEqual(r5.primary_keyword_change,{from:'cozy coloring book',to:'fall coloring pages',changed:true});
  assert.ok(r5.retained_terms.includes('fall coloring pages')&&r5.terms_to_deemphasise.includes('pumpkin coloring'));
  assert.ok(r5.warnings.some(w=>/insufficient_valid_tag_candidates/.test(w)));
  assert.deepEqual(r5.thumbnail_marketing_search_intent.show_theme,['fall']);
  assert.equal(r4.recommended_primary_intent,'halloween coloring pages printable');
  assert.ok(r4.terms_to_add.some(t=>t.keyword==='halloween coloring pages printable'&&t.fits_tag===false),'too long for a tag: title/description only');
  assert.ok(r6.terms_to_deemphasise.includes('cute ghost')===false&&r6.tag_review.find(t=>t.tag==='cute ghost').relevance_class==='SUPPORTING');
  assert.equal(rx.recommended_primary_intent,'traditional christmas card');assert.equal(rx.pricing_evidence[0].amount,4.25);
  const wrong=await profile(LIST[0]);
  assert.throws(()=>createListingRecommendation({snapshot:snaps[1],profile:wrong,research:res}),/does not describe listing/);
});

test('performance feedback (future): validated shape; derived metrics only from raw values; never used by scoring',async()=>{
  const base={listing_id:'4584343288',period_start:'2026-10-01',period_end:'2026-10-31',views:1000,clicks:40,orders:2,revenue:8.5,spend:4.25,currency:'GBP',
    search_terms:[{term:'traditional christmas card',count:12}],captured_at:'2026-11-01',source:{type:'etsy_ads',captured_by:'owner'}};
  const ok=validatePerformance(base);assert.equal(ok.ok,true,ok.errors.join());
  near(ok.observation.ctr,0.04);near(ok.observation.conversion_rate,0.05);near(ok.observation.roas,2);
  const missing=validatePerformance({...base,clicks:null,spend:null});
  assert.equal(missing.observation.ctr,null);assert.equal(missing.observation.conversion_rate,null);assert.equal(missing.observation.roas,null);
  assert.match(validatePerformance({...base,clicks:null,ctr:0.04}).errors.join(),/cannot exist without its inputs/);
  assert.match(validatePerformance({...base,roas:3}).errors.join(),/roas is 3 but its raw values give 2/);
  assert.match(validatePerformance({...base,currency:null}).errors.join(),/currency/);
  assert.match(validatePerformance({...base,views:'1k'}).errors.join(),/views must be a whole number/);
  const schema=await json('schemas/performance-observation.schema.json');
  assert.deepEqual([...schema.required].sort(),Object.keys(base).sort());
  const scoring=await readFile(join(ROOT,'src/scoring.mjs'),'utf8');
  assert.doesNotMatch(scoring,/performance/i,'scoring does not read performance data in v1');
});

test('boundaries: new modules and the report script make no network, model, Etsy, Telegram or production call',async()=>{
  for(const f of ['src/relevance.mjs','src/scoring.mjs','src/positioning.mjs','src/performance.mjs','src/report.mjs','src/brief.mjs','src/listing.mjs','scripts/opportunity-report.mjs']){
    const text=(await readFile(join(ROOT,f),'utf8')).replace(/^\s*\/\/.*$/gm,'');
    for(const m of text.matchAll(/(?:from\s+|import\(\s*)['"]([^'"]+)['"]/g))assert.ok(/^node:(crypto|fs\/promises|path)$/.test(m[1])||/^\.\.?\/(src\/)?[a-z-]+\.mjs$/.test(m[1]),`${f} imports ${m[1]}`);
    assert.doesNotMatch(text,/\bfetch\(|https?:\/\/|openai|telegram|etsy\.com|api\.etsy|child_process|Date\.now\(\)/i,f);
  }
  // Seasonality is never read from the clock: the scorer has no clock at all.
  assert.doesNotMatch(await readFile(join(ROOT,'src/scoring.mjs'),'utf8'),/new Date|Date\.now/);
  const profiles=await readdir(join(ROOT,'fixtures/profiles'));
  assert.equal(profiles.length,6);
  for(const f of profiles)assert.equal(validateProfile(await json(`fixtures/profiles/${f}`)).ok,true,f);
  const ps=await json('schemas/relevance-profile.schema.json');
  assert.deepEqual([...ps.required].sort(),Object.keys(await json('fixtures/profiles/cozy-autumn-colouring-adults.json')).sort());
});
