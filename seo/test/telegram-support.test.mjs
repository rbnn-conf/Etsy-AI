// Engine support for the Telegram SEO panel (ADR-036): Etsy value parsing,
// profile-from-idea, the file-backed ResearchWorkspace, the recommendation from
// an existing result, and the deterministic revision. No network, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEtsyCount, parseTrend, parseDailyCounts, parseRelatedTerms, parseConversionText, observationFromEntry, validateObservation, profileFromIdea, validateIdea,
  validateProfile, ResearchWorkspace, createListingRecommendation, listingRecommendationFromResult, scoreOpportunities, proposeRevision, createResearchSet, MODES } from '../src/index.mjs';

const ROOT=join(import.meta.dirname,'..');
const json=async p=>JSON.parse(await readFile(join(ROOT,p),'utf8'));
const NOW=new Date('2026-09-30T10:00:00Z');

test('Etsy display values: exact vs rounded (never presented as exact), daily counts, trend, conversion, related-term lines',()=>{
  assert.deepEqual(parseEtsyCount('4,345'),{ok:true,value:4345,exact:true,displayed:'4345'});
  assert.deepEqual(parseEtsyCount('4.3k'),{ok:true,value:4300,exact:false,displayed:'4.3k'});
  assert.deepEqual(parseEtsyCount('2.6M'),{ok:true,value:2600000,exact:false,displayed:'2.6M'});
  for(const bad of ['4.5','abc','','-3'])assert.equal(parseEtsyCount(bad).ok,false,bad);
  assert.deepEqual(parseTrend('+3.2%'),{ok:true,value:3.2});assert.deepEqual(parseTrend('-1.5 %'),{ok:true,value:-1.5});assert.equal(parseTrend('up').ok,false);
  assert.equal(parseConversionText('Very high'),'very_high');assert.equal(parseConversionText('great'),null);
  const d=parseDailyCounts('4,13,9,14,18,42,15,19,26,30,29,32,12,44,19,31,23,19,26,18,7,17,20,25,7,29,7,11,56,19');
  assert.equal(d.sum,641);assert.equal(parseDailyCounts('1 2 3').ok,false);
  const r=parseRelatedTerms('Coloring Pages for Adults | 1.6k | 133.4k | High\nfall mandala\n\ncoloring pages for adults');
  assert.deepEqual(r.terms,[{term:'coloring pages for adults',searches_30d:1600,search_results:133400,conversion_label:'high'},{term:'fall mandala',searches_30d:null,search_results:null,conversion_label:null}]);
  assert.equal(r.rounded,true);assert.match(parseRelatedTerms('x | lots').errors[0],/line 1/);
});

test('observation from an owner entry: rounded values are noted as rounded; the daily sum is exact; related terms stay discovery metadata',()=>{
  const row=observationFromEntry({keyword:'Cozy Coloring Pages',searches:parseEtsyCount('1.4k'),daily:{sum:1359},results:parseEtsyCount('38.4k'),conversion_label:'high',trend:3.8,
    related:{terms:[{term:'kids coloring pages',searches_30d:2600,search_results:231200,conversion_label:'high'}],rounded:true}},{captured_at:'2026-09-29',captured_by:'@owner'});
  const v=validateObservation(row);assert.ok(v.ok,v.errors.join());
  assert.equal(v.observation.searches_30d,1359);assert.equal(v.observation.search_results,38400);
  assert.match(v.observation.source.note,/exact sum of Etsy's 30 daily counts \(headline shown as "1\.4k"\)\. search_results: Etsy displayed the rounded value "38\.4k"\. 1 related search term recorded as discovery metadata only \(not evidence\); their figures are Etsy-rounded\./);
  const rounded=observationFromEntry({keyword:'x y',searches:parseEtsyCount('4.3k'),results:parseEtsyCount('9000'),conversion_label:'low'},{captured_at:null,captured_by:'o'});
  assert.equal(rounded.searches_30d,4300);assert.match(rounded.source.note,/rounded value "4\.3k"; the exact count is unknown/);assert.ok(!('related_terms' in rounded));
});

test('profile from a structured idea: themes, formats (+ family), audiences, styles + delivery; one facet per word; nothing inferred',async()=>{
  const idea=validateIdea(await json('fixtures/ideas/cozy-autumn-colouring-adults-structured.json')).idea;
  const {profile,dropped}=profileFromIdea(idea,{profile_id:'tg-unit',describes:{mode:'NEW_PRODUCT',ref:'x'}});
  assert.deepEqual([profile.central_themes,profile.formats,profile.audiences,profile.attributes,profile.components,profile.tangential,profile.seasonality],
    [['autumn','cozy'],['coloring pages','coloring book'],['adults'],['digital','printable'],[],[],null]);
  assert.deepEqual(dropped,[]);assert.equal(validateProfile(profile).ok,true);
  const clash=profileFromIdea(validateIdea({...idea,styles:['cozy','cute'],audiences:['adults','general']}).idea,{profile_id:'tg-unit',describes:{mode:'NEW_PRODUCT',ref:'x'}});
  assert.deepEqual(clash.profile.attributes,['cute','digital','printable']);assert.deepEqual(clash.profile.audiences,['adults']);
  assert.match(clash.dropped[0].reason,/"cozy" is already a central themes word/);
  assert.throws(()=>profileFromIdea(validateIdea({...idea,themes:[]}).idea,{profile_id:'tg-unit',describes:{mode:'NEW_PRODUCT',ref:'x'}}),/central_themes needs at least one word/);
});

test('ResearchWorkspace (shared by CLI and Telegram): write-once versions, terms with keys, progress, reuse keeps the observation id',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'seo-ws-'));
  try{
    const idea=validateIdea(await json('fixtures/ideas/cozy-autumn-colouring-adults-structured.json')).idea;
    const profile=await json('fixtures/profiles/cozy-autumn-colouring-adults-structured.json');
    const ws=await ResearchWorkspace.create({dir:join(dir,'a'),mode:MODES.NEW_PRODUCT,idea,profile,research_id:'unit-a',now:NOW});
    assert.deepEqual(ws.terms().slice(0,4).map(t=>[t.key,t.term,t.required]),[['p01','autumn coloring pages',true],['p02','fall coloring pages',true],['p03','cozy coloring pages',true],['p04','adult coloring pages',true]]);
    assert.deepEqual(ws.progress(),{done:0,total:4});
    const c=await json('fixtures/research-cycle/cozy-autumn-real/capture-1.json');
    await ws.importCapture({rows:c.rows,recorded_by:'owner'},{now:NOW});
    await ws.markUnavailable('cozy coloring pages',{now:NOW});
    assert.deepEqual(ws.progress(),{done:3,total:4});assert.equal(ws.pendingRequired()[0].term,'autumn coloring pages');
    const reopened=await ResearchWorkspace.open(join(dir,'a'));assert.equal(reopened.research.version,1);
    // Reuse in another workspace: the same observation (id, capture date, source), not a new one.
    const adult=ws.research.observations.find(o=>o.keyword==='adult coloring pages'), {observation_id,...row}=adult;
    const b=await ResearchWorkspace.create({dir:join(dir,'b'),mode:MODES.NEW_PRODUCT,idea,profile,research_id:'unit-b',now:NOW});
    await b.importCapture({rows:[row],note:'reused'},{now:NOW});
    assert.deepEqual(b.research.observations[0],adult);
    assert.deepEqual((await ws.researchVersions()).map(v=>v.version),[1]);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('recommendation from an existing result equals createListingRecommendation; the revision is deterministic, readable and never stuffed',async()=>{
  const f=await json('fixtures/marketplace-insights/manual-capture-01.json');
  const research=createResearchSet({research_id:f.research_id,rows:f.rows,recorded_at:f.recorded_at,recorded_by:f.recorded_by});
  const snapshot=await json('fixtures/listings/005-cozy-autumn-adventures.json'), profile=validateProfile(await json('fixtures/profiles/005-cozy-autumn-adventures.json')).profile;
  const a=createListingRecommendation({snapshot,profile,research,now:NOW});
  const b=listingRecommendationFromResult({snapshot,profile,result:scoreOpportunities({profile,research}),now:NOW});
  assert.deepEqual(b,a);
  const r=proposeRevision({snapshot,description:'Make a little time for autumn creativity.',recommendation:a,result:a.opportunity});
  assert.equal(r.title.proposed,'20 Fall Coloring Pages | A4 & US Letter');
  assert.equal(r.description.proposed,'Fall Coloring Pages.\n\nMake a little time for autumn creativity.');
  assert.equal(r.model_calls,0);assert.equal(r.generated_by,'deterministic');
  const words=r.title.proposed.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  assert.equal(new Set(words).size,words.length,'no word repeated in the title');
  assert.ok(r.title.length<=140);
  assert.deepEqual(r.tags.remove.map(x=>x.tag),['pumpkin coloring','printable activity']);
  assert.equal(proposeRevision({snapshot,recommendation:a,result:{...a.opportunity,primary_keyword:null}}).available,false,'research required: nothing is proposed');
});
