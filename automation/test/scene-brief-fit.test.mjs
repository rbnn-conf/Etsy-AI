// A model-written scene_brief over the schema limit (400) must never reject a whole paid direction call again
// (#019 hero comparison: "$.slides[0].scene_brief: longer than 400"). Briefs are compressed BEFORE validation,
// keeping whole sentences or clauses, never cut mid-sentence. Fake model: no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fitBrief, fitSceneBriefs, generateArtDirection, overLongCreative, CREATIVE_BRIEF_MAX } from '../src/stage3/engines.mjs';
import { loadSchema } from '../src/orchestrator/schema.mjs';
import { STAGE3_ADAPTERS, planSlides, deriveStrategy, ENGINE_LIGHTING } from '../../marketing/src/stage3/index.mjs';
import { book } from '../../marketing/test/colouring-fixture.mjs';

const S1='Premium cosy autumn tabletop in warm cinematic light: rich walnut wood, a chunky cream knitted throw at one edge, a ceramic mug of spiced tea and a few scattered maple leaves, soft golden bokeh behind.';
const S2='Keep the lower centre of the table clear, even and softly lit for objects placed later, with the top left calm and slightly darker.';
const S3='Shallow depth of field, editorial still-life styling, warm cream, brown and burnt orange tones, restrained and highly giftable, never cluttered.';
const LONG=`${S1} ${S2} ${S3} (A premium Etsy hero look.)`;

test('fitBrief: under the limit is unchanged; over it keeps whole leading sentences; ends cleanly; never cuts a word',()=>{
  assert.deepEqual(fitBrief(S1,400),{text:S1,changed:false});
  assert.ok(LONG.length>400);
  const f=fitBrief(LONG,400);
  assert.ok(f.changed&&f.text.length<=400);
  assert.equal(f.text,`${S1} ${S2}`,'the first two whole sentences survive; the parenthetical and the last sentence go');
  // One very long sentence: trailing clauses are dropped, never mid-clause; it still ends with a full stop.
  const one=`${S1.slice(0,-1)}, ${'with a softly glowing lamp, a jar of coloured pencils, '.repeat(6)}and a quiet window.`;
  const g=fitBrief(one,400);
  assert.ok(g.text.length<=400&&g.text.endsWith('.'));
  assert.ok(one.startsWith(g.text.slice(0,-1).replace(/[,;:]$/,'')),'a leading part of the original, cut at a clause boundary');
  // Pathological: a single clause longer than the limit is cut at a word boundary.
  const h=fitBrief(`${'cosy '.repeat(120)}desk`,400);assert.ok(h.text.length<=400&&!/cos$/.test(h.text.slice(0,-1)));
});

test('fitSceneBriefs: compresses only over-long briefs and records each one',()=>{
  const r=fitSceneBriefs({slides:[{id:'a',scene_brief:LONG},{id:'b',scene_brief:S1}],campaign:{}},400);
  assert.equal(r.data.slides[0].scene_brief,`${S1} ${S2}`);assert.equal(r.data.slides[1].scene_brief,S1);
  assert.deepEqual(r.changes.map(c=>[c.id,c.action]),[['a','compressed']]);
});

test('the #019 failure: an art-direction answer with a 400+ character hero scene_brief is accepted (compressed), not rejected',async()=>{
  const {facts}=await book('portrait');facts.claims=STAGE3_ADAPTERS['colouring-book'].claimIndex(facts);
  const hero=planSlides(facts,{maxScenes:0,strategy:deriveStrategy(facts)}).slides[0];
  const data={campaign:{mood:'warm',palette:'amber',lighting:'golden'},lines:[],
    slides:[{id:hero.id,archetype:'editorial-right',product_scale:0.5,rotation:0,perspective:0,lighting:ENGINE_LIGHTING[0],decor:'none',scene_brief:LONG}]};
  const ai={textModel:'fake',client:{async json(){return {data:structuredClone(data),usage:{total_tokens:1},model:'fake'};}}};
  const d=await generateArtDirection(ai,{engine:'ai-creative',facts,strategy:deriveStrategy(facts),slides:[hero],toneSlides:[],artwork:null});
  assert.ok(d.data.slides[hero.id].scene_brief.length<=400);
  assert.equal(d.data.slides[hero.id].scene_brief,`${S1} ${S2}`);
  assert.deepEqual(d.normalized.map(c=>[c.id,c.field,c.action]),[[hero.id,'scene_brief','compressed']]);
});

test('creative directions: an over-long scene_brief is compressed and recorded (no longer cleared to the baseline); the limit matches the schema',async()=>{
  const s=await loadSchema('marketing-creative-direction');
  assert.equal(CREATIVE_BRIEF_MAX,s.properties.slides.items.properties.scene_brief.maxLength);
  const r=overLongCreative({slides:[{id:'01-hero',scene_brief:LONG,purpose:'x'}]});
  assert.equal(r.data.slides[0].scene_brief,`${S1} ${S2}`);assert.deepEqual(r.changes,[{id:'01-hero',field:'scene_brief (compressed)'}]);
  const a=await loadSchema('art-direction');assert.equal(a.properties.slides.items.properties.scene_brief.maxLength,400);
});

test('both direction prompts tell the model the scene_brief limit',async()=>{
  for(const f of ['art-direction.md','marketing-creative-director.md'])
    assert.match(await readFile(new URL(`../prompts/${f}`,import.meta.url),'utf8'),/scene_brief`? \(at most 400 characters/,f);
});
