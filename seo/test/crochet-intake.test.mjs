// A crochet pattern bundle idea through SEO intake (ADR-040). The example
// configuration is a fixture, not a global default. No network, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateIdea, profileFromIdea, validateProfile, resolveIdea, createResearchPlan, FORMAT_FAMILIES } from '../src/index.mjs';

const ROOT=join(import.meta.dirname,'..');
const json=async p=>JSON.parse(await readFile(join(ROOT,p),'utf8'));
const crochet=async()=>validateIdea(await json('fixtures/ideas/crochet-flower-pattern-bundle.json'));
const REF={profile_id:'crochet-unit',describes:{mode:'NEW_PRODUCT',ref:'x'}};

test('the example crochet idea is accepted as-is: format, themes, audiences, delivery, styles and item count',async()=>{
  const v=await crochet();
  assert.ok(v.ok,v.errors.join('; '));
  const i=v.idea;
  assert.deepEqual(i.formats,['crochet pattern bundle']);assert.equal(i.item_count,33);
  assert.deepEqual(i.delivery,['digital','printable']);
  assert.equal(i.themes.length,10);assert.equal(i.audiences.length,4);assert.equal(i.styles.length,5);
  const r=resolveIdea(i);
  assert.equal(r.idea_completeness,'complete');assert.deepEqual(r.warnings,[]);
});

test('profile keeps the format when a theme shares its word ("crochet flowers" vs "crochet pattern bundle")',async()=>{
  const {profile,dropped}=profileFromIdea((await crochet()).idea,REF);
  assert.equal(validateProfile(profile).ok,true);
  assert.deepEqual(profile.formats,['crochet pattern bundle','crochet pattern']);
  assert.ok(!profile.central_themes.includes('crochet flowers'));
  assert.ok(profile.central_themes.includes('roses')&&profile.central_themes.includes('sunflowers'));
  assert.deepEqual(dropped.map(d=>d.phrase).sort(),['crochet flowers','handmade gift makers','realistic crochet']);
  assert.ok(dropped.every(d=>/already a/.test(d.reason)));
});

test('no regression: ideas whose format survives keep the documented themes-first order',async()=>{
  const idea=validateIdea(await json('fixtures/ideas/cozy-autumn-colouring-adults-structured.json')).idea;
  const {profile}=profileFromIdea({...idea,styles:['cozy']},REF);
  assert.deepEqual(profile.central_themes,['autumn','cozy']);   // the theme keeps "cozy"; the style is dropped
  assert.ok(!profile.attributes.includes('cozy'));
});

test('crochet format family: research plans propose crochet pattern searches only from the idea\'s own words',async()=>{
  assert.ok(FORMAT_FAMILIES.some(f=>f.includes('crochet pattern')&&f.includes('crochet pattern bundle')));
  const plan=createResearchPlan({idea:(await crochet()).idea,now:new Date('2026-09-29T00:00:00Z')});
  const qs=plan.queries.map(q=>q.query);
  assert.ok(qs.length>0);
  assert.ok(qs.some(q=>/crochet pattern bundle/.test(q))&&qs.some(q=>/crochet pattern(?! bundle)/.test(q)));
  assert.ok(qs.every(q=>!/coloring|colouring|planner|card/.test(q)),'no unrelated format');
});
