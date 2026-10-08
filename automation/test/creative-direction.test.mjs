// Stage 3 Creative Director, model side (ADR-058): one structured text call under
// the shared Creative Director instruction directs every creative card; code
// validates it (catalogue, vocabulary, claims, environment limit). The model client
// is a fake: zero real OpenAI calls, no image calls, nothing published.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateArtDirection, creativeEnvironmentPrompt } from '../src/stage3/engines.mjs';
import { loadSchema, validate } from '../src/orchestrator/schema.mjs';
import { STAGE3_ADAPTERS, BUYER_JOBS, deriveStrategy } from '../../marketing/src/stage3/index.mjs';
import { creativeFacts, creativeArt } from '../../marketing/test/creative-fixture.mjs';

const C=STAGE3_ADAPTERS['crochet-pattern-bundle'];
const fakeAi=reply=>{const calls=[];return {calls,textModel:'fake-text',imageModel:'fake-image',
  client:{json:async req=>{calls.push(req);return {data:reply(req),model:'fake-text',usage:{}};},image:async()=>{throw new Error('no image call may be made here');}}};};
/** The model returns each card's baseline, with per-card overrides. */
const answer=(slides,over={})=>()=>({campaign:{mood:'calm moonlit crafting',palette:'ivory, blush, sage',lighting:'soft window light'},
  slides:slides.map(s=>({id:s.id,purpose:s.creative.purpose,buyer_message:s.creative.buyer_message,emotional_goal:s.creative.emotional_goal,headline:'',
    focal_asset:s.creative.focal_asset,supporting_assets:s.creative.supporting_assets,composition:s.creative.composition,hierarchy:s.creative.hierarchy,
    background:s.creative.background,props:s.creative.props,crop:s.creative.crop??{asset:'',focus:[.5,.5],zoom:1},text_zone:s.creative.text_zone,
    scene_brief:s.creative.scene_brief,avoid:[],...over[s.id]})),
  lines:slides.filter(s=>s.tone).map(s=>({id:s.id,text:'A calm hour with your hook and a cup of tea.'}))});
const setup=async()=>{const facts=creativeFacts(), art=await creativeArt(facts), plan=C.creative.plan(facts,{});return {facts,art,plan,slides:plan.slides,tone:plan.slides.filter(s=>s.tone)};};

test('one creative-direction call directs every card: the Creative Director prompt, the niche direction, the asset catalogue and the baseline; no image call',async()=>{
  const {facts,art,slides,tone}=await setup(), ai=fakeAi(answer(slides,{'03-quality':{background:'dusk',headline:'A Rose, Up Close'}}));
  const r=await generateArtDirection(ai,{engine:'ai-creative',facts,strategy:deriveStrategy(facts),slides,toneSlides:tone,artwork:null,art});
  assert.equal(ai.calls.length,1);
  const [c]=ai.calls;
  assert.equal(c.schemaName,'marketing-creative-direction');
  assert.equal(c.system,await readFile(join(import.meta.dirname,'..','prompts','marketing-creative-director.md'),'utf8'));
  for(const s of ['NICHE CREATIVE DIRECTION','I want to make these.','ASSET CATALOGUE','- render-bouquet:','- page-garden-rose:','COMPOSITIONS code can build','BASELINE:','07-desire [desire]'])assert.ok(c.user.includes(s),s);
  assert.doesNotMatch(c.user,/proofs\/|production\/deliverables|[0-9a-f]{64}/,'no file paths or hashes reach the model');
  assert.deepEqual(Object.keys(r.data.slides),slides.map(s=>s.id));
  assert.equal(r.data.slides['03-quality'].background,'dusk');assert.equal(r.data.slides['03-quality'].headline,'A Rose, Up Close');
  assert.ok(Object.values(r.data.slides).every(d=>d.source==='model'));
});

test('invalid model choices fall back to the baseline (recorded); extra environments are limited; a scene brief with a product substitute is refused',async()=>{
  const {facts,art,slides,tone}=await setup();
  const env={composition:'lifestyle',background:'environment',focal_asset:'render-detail',supporting_assets:['doc-index','page-garden-rose'],text_zone:'top-left',scene_brief:'A linen table with yarn skeins.'};
  const r=await generateArtDirection(fakeAi(answer(slides,{'01-stop-scroll':{focal_asset:'ai-photo-of-bouquet',headline:'33 Tested Patterns'},'02-what-you-get':env,'04-variety':env,'05-useful':env})),
    {engine:'hybrid',facts,strategy:deriveStrategy(facts),slides,toneSlides:tone,artwork:null,art});
  assert.deepEqual(r.data.slides['01-stop-scroll'].fallbacks.sort(),['focal_asset','headline']);
  assert.equal(r.data.slides['01-stop-scroll'].focal_asset,'render-bouquet');
  assert.equal(Object.values(r.data.slides).filter(d=>d.background==='environment').length,1,'never more AI scenes than the baseline (1)');
  // A scene brief naming a product substitute, text or people (even negated) is never used: the baseline brief is kept, recorded.
  for(const brief of ['An open booklet of patterns on a table.','A warm oak table with yarn; no text, no people, no flowers.']){
    const x=await generateArtDirection(fakeAi(answer(slides,{'07-desire':{scene_brief:brief}})),{engine:'hybrid',facts,strategy:deriveStrategy(facts),slides,toneSlides:tone,artwork:null,art});
    assert.equal(x.data.slides['07-desire'].scene_brief,slides[6].creative.scene_brief);assert.ok(x.data.slides['07-desire'].fallbacks.includes('scene_brief'),brief);
  }
  // Over-long creative fields keep the baseline, recorded; the direction is not rejected. An over-long scene brief is
  // COMPRESSED instead (ADR-060: the model's direction survives; repeated sentences dropped), and recorded.
  const long=await generateArtDirection(fakeAi(answer(slides,{'07-desire':{scene_brief:'A warm oak table with soft light. '.repeat(16)},'02-what-you-get':{purpose:'x'.repeat(300),avoid:['y'.repeat(90)]}})),
    {engine:'hybrid',facts,strategy:deriveStrategy(facts),slides,toneSlides:tone,artwork:null,art});
  assert.equal(long.data.slides['07-desire'].scene_brief,'A warm oak table with soft light.');assert.deepEqual(long.data.slides['07-desire'].fallbacks,['scene_brief (compressed)']);
  assert.equal(long.data.slides['02-what-you-get'].purpose,slides[1].creative.purpose);assert.deepEqual(long.data.slides['02-what-you-get'].fallbacks.sort(),['avoid','purpose']);
  const fine=await generateArtDirection(fakeAi(answer(slides,{'07-desire':{scene_brief:'A sunlit oak table, linen, cream yarn skeins and a hook.'}})),{engine:'hybrid',facts,strategy:deriveStrategy(facts),slides,toneSlides:tone,artwork:null,art});
  assert.equal(fine.data.slides['07-desire'].scene_brief,'A sunlit oak table, linen, cream yarn skeins and a hook.');
  await assert.rejects(generateArtDirection(fakeAi(()=>({...answer(slides)(),slides:answer(slides)().slides.slice(1)})),{engine:'hybrid',facts,strategy:deriveStrategy(facts),slides,toneSlides:tone,artwork:null,art}),
    /slides must be exactly the given ids/);
});

test('the creative environment prompt: environment only, a clear area for the product, every exclusion; the schema and prompt carry the eight buyer jobs',async()=>{
  const {facts,slides}=await setup(), d=slides.find(s=>s.creative.background==='environment').creative;
  const p=creativeEnvironmentPrompt({direction:d,facts,strategy:{},campaign:{mood:'calm',palette:'ivory, sage',lighting:'window light'}});
  assert.match(p,/Environment-only background photograph/);assert.match(p,/keep the centre and lower half clear/);
  for(const x of ['flowers of any kind','crocheted or knitted items','paper','text','people','hands'])assert.ok(p.includes(x),x);
  assert.match(p,/Props \(plain materials only\): yarn skeins, wooden crochet hook, tea cup, linen cloth, window light/);
  for(const x of ['flowers of any kind','bouquets','crocheted or knitted items','finished handmade objects','patterns','printed pages','text','people','hands'])assert.ok(p.includes(x),`excludes ${x}`);
  assert.match(p,/neutral linen cloth/);assert.match(p,/quiet premium crafting mood/);
  const schema=await loadSchema('marketing-creative-direction');
  assert.deepEqual(validate(schema,answer(slides)()),[]);
  const prompt=await readFile(join(import.meta.dirname,'..','prompts','marketing-creative-director.md'),'utf8');
  for(const j of Object.values(BUYER_JOBS))assert.ok(prompt.includes(j.replace(/\?$/,'')),j);
  assert.match(prompt,/never call it a photograph/);assert.match(prompt,/At most 7 words|at most 7 words/);
});
