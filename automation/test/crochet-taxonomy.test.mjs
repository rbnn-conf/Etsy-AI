// Etsy taxonomy for crochet pattern bundles (ADR-059, extends ADR-039/041): the FORMAT resolves to one fixed
// owner-approved taxonomy ID, never to the listing's free-text category. The ID is re-checked against Etsy's
// live seller taxonomy on every run and everything else fails closed. No Etsy call: the taxonomy is a fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveTaxonomy, loadFormatMappings, FORMAT_MAPPINGS, UNRESOLVED_FORMATS, TAXONOMY_MAP } from '../src/stage4/taxonomy.mjs';
import { CROCHET_PATTERN_CATEGORY, crochetPatternBundle } from '../../marketing/src/stage3/adapters/crochet-pattern-bundle.mjs';
import { colouringBook } from '../../marketing/src/stage3/adapters/colouring-book.mjs';
import { knownFailureText, knownFailure, retrySafety } from '../src/telegram/ui.mjs';

const PATH='Craft Supplies & Tools > Patterns & How To > Patterns & Blueprints';
const nodes=[{id:1,name:'Craft Supplies & Tools',parentId:null},{id:2,name:'Patterns & How To',parentId:1},{id:3,name:'Crochet',parentId:2},{id:6343,name:'Patterns & Blueprints',parentId:2},
  {id:86,name:'Fiber Arts',parentId:null},{id:87,name:'Crochet',parentId:86},
  {id:10,name:'Books, Movies & Music',parentId:null},{id:11,name:'Books',parentId:10},{id:339,name:'Coloring Books',parentId:11},
  {id:20,name:'Paper & Party Supplies',parentId:null},{id:21,name:'Paper',parentId:20},{id:1296,name:'Greeting Cards',parentId:21}];
const C='crochet-pattern-bundle';

test('the committed config fixes crochet-pattern-bundle to 6343; it is no longer unresolved; the adapter writes the same canonical path',()=>{
  assert.deepEqual(FORMAT_MAPPINGS.map(m=>[m.format,m.path,m.taxonomy_id]),[[C,PATH,6343]]);
  assert.deepEqual(UNRESOLVED_FORMATS,[]);
  assert.equal(CROCHET_PATTERN_CATEGORY,PATH);assert.equal(crochetPatternBundle.etsyCategory,PATH,'Stage 3 sets listing.category_suggestion to the mapped path');
  assert.ok(!TAXONOMY_MAP.some(m=>/crochet|pattern/i.test(m.path)),'the path-based mappings are unchanged (colouring books only)');
  const m=FORMAT_MAPPINGS[0];assert.match(m.approved,/owner/);assert.deepEqual(m.rejected_candidates.map(c=>c.taxonomy_id),[86]);
});

test('crochet resolves to 6343 whatever the listing text suggests: a free-text category can never override or redirect the fixed mapping',()=>{
  for(const text of [PATH,'Craft Supplies & Tools > Patterns & How To > Crochet Patterns','Art & Collectibles > Fiber Arts > Crochet','Craft Supplies & Tools > Patterns & How To > Crochet','nonsense',''])
    assert.deepEqual(resolveTaxonomy({categoryPath:text,nodes,format:C}),
      {id:6343,path:PATH,source:'owner-approved crochet-pattern-bundle mapping (automation/config/etsy-taxonomy-map.json), verified in Etsy seller taxonomy'},text);
  // Even a free-text path that matches another Etsy node EXACTLY ("Crochet" under Patterns & How To) is ignored for this format.
  assert.equal(resolveTaxonomy({categoryPath:'Craft Supplies & Tools > Patterns & How To > Crochet',nodes,format:C}).id,6343);
  // Without a format the same text is matched by exact path, as before (callers without a format are unchanged).
  assert.equal(resolveTaxonomy({categoryPath:'Craft Supplies & Tools > Patterns & How To > Crochet',nodes}).id,3);
});

test('the owner setting (etsy/settings.json) still wins; the mapping fails closed when Etsy no longer has that exact node; nothing is guessed',()=>{
  assert.equal(resolveTaxonomy({categoryPath:PATH,nodes,overrideId:3,format:C}).id,3);
  assert.throws(()=>resolveTaxonomy({categoryPath:PATH,nodes,overrideId:999,format:C}),/not in Etsy's seller taxonomy/);
  assert.throws(()=>resolveTaxonomy({categoryPath:PATH,nodes:nodes.filter(n=>n.id!==6343),format:C}),
    e=>e.code==='TAXONOMY_UNRESOLVED'&&/6343 is not in Etsy's seller taxonomy/.test(e.message)&&/Nothing was created/.test(e.message)&&e.retryable===false);
  const renamed=nodes.map(n=>n.id===6343?{...n,name:'Blueprints'}:n);
  assert.throws(()=>resolveTaxonomy({categoryPath:PATH,nodes:renamed,format:C}),e=>e.code==='TAXONOMY_UNRESOLVED'&&/6343 is now "Craft Supplies & Tools > Patterns & How To > Blueprints"/.test(e.message));
  // The finished-items crochet node (86 > 87) is never chosen for a pattern.
  assert.notEqual(resolveTaxonomy({categoryPath:'Art & Collectibles > Fiber Arts > Crochet',nodes,format:C}).id,87);
  assert.throws(()=>resolveTaxonomy({categoryPath:PATH,nodes:[],format:C}),/unavailable/);
  // The dry run's simulated taxonomy has no real IDs: the mapping is not applied and nothing is invented.
  assert.throws(()=>resolveTaxonomy({categoryPath:PATH,nodes:nodes.filter(n=>n.id!==6343&&n.id!==3),format:C,simulated:true}),e=>e.code==='TAXONOMY_UNRESOLVED');
});

test('other formats are unchanged: colouring-book -> 339 by its mapping, greeting-card by exact path, an unknown format fails closed, an explicitly unresolved format still stops',()=>{
  const CANON='Books, Movies & Music > Books > Coloring Books';
  assert.equal(colouringBook.etsyCategory,CANON);
  assert.deepEqual(resolveTaxonomy({categoryPath:CANON,nodes,format:'colouring-book'}),{id:339,path:CANON,source:'owner-approved mapping (automation/config/etsy-taxonomy-map.json), verified in Etsy seller taxonomy'});
  assert.equal(resolveTaxonomy({categoryPath:'Paper & Party Supplies > Paper > Greeting Cards',nodes,format:'greeting-card'}).id,1296);
  // A colouring book is not redirected by the crochet mapping, and a crochet path cannot resolve another format.
  assert.equal(resolveTaxonomy({categoryPath:PATH,nodes,format:'something-new'}).id,6343,'an unmapped format still matches by exact Etsy path (existing rule)');
  assert.throws(()=>resolveTaxonomy({categoryPath:'Home & Living > Made Up > Category',nodes,format:'something-new'}),e=>e.code==='TAXONOMY_UNRESOLVED'&&/not an exact Etsy seller-taxonomy path/.test(e.message));
  const open=[{format:'future-format',category:'A future category',reason:'Not verified.'}];
  assert.throws(()=>resolveTaxonomy({categoryPath:PATH,nodes,format:'future-format',unresolved:open}),e=>e.code==='TAXONOMY_UNRESOLVED'&&/future-format is unresolved: "A future category"/.test(e.message));
});

test('malformed or missing taxonomy IDs and duplicate or contradictory format entries are rejected as CONFIG errors',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'dpf-taxmap-'));
  try{
    const load=async(format_mappings,unresolved=[])=>{const f=join(dir,`m${Math.random()}.json`);await writeFile(f,JSON.stringify({schema_version:1,mappings:[],unresolved,format_mappings}));return loadFormatMappings(pathToFileURL(f));};
    const ok={format:C,path:PATH,taxonomy_id:6343};
    assert.deepEqual((await load([ok])).map(m=>m.taxonomy_id),[6343]);
    assert.deepEqual(await load([]),[]);
    for(const bad of [{...ok,taxonomy_id:0},{...ok,taxonomy_id:-5},{...ok,taxonomy_id:6343.5},{...ok,taxonomy_id:'6343'},{...ok,taxonomy_id:null},{format:C,path:PATH},{...ok,format:''},{path:PATH,taxonomy_id:1},{...ok,path:'Patterns'},{...ok,path:5}])
      await assert.rejects(load([bad]),e=>e.code==='CONFIG'&&/invalid format mapping/.test(e.message),JSON.stringify(bad));
    await assert.rejects(load([ok,{...ok,taxonomy_id:7}]),e=>e.code==='CONFIG'&&/twice/.test(e.message));
    await assert.rejects(load([ok],[{format:C,category:'x'}]),e=>e.code==='CONFIG'&&/twice \(or also lists it as unresolved\)/.test(e.message));
    await assert.rejects(load('6343'),e=>e.code==='CONFIG'&&/must be a list/.test(e.message));
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('Telegram: an unresolved Etsy category is two short plain lines of next steps; the long category and the raw error stay in the log',()=>{
  const p=(message,step='etsy')=>({product_id:'016',status:'FAILED',last_error:{step,message,retryable:false}});
  const setup=p('Stage4Error: [TAXONOMY_UNRESOLVED] The Etsy category for crochet-pattern-bundle is unresolved: "Digital crochet pattern (downloadable PDF crochet patterns)" has no owner-approved Etsy taxonomy ID. Nothing was created on Etsy.');
  assert.equal(knownFailureText(setup),['⚠️ Etsy category needs setup','','Crochet patterns do not have an approved Etsy category yet.','','Nothing was lost.','Fix the category mapping, then Retry.','','Retry is free.'].join('\n'));
  assert.deepEqual(knownFailure(setup),{stage:'Etsy',lines:['Crochet patterns do not have an approved Etsy category yet.']});
  assert.match(knownFailureText(p('[TAXONOMY_UNRESOLVED] The Etsy category for something-new is unresolved: "x"')),/^⚠️ Etsy category needs setup\n\nThis product type do not have/);
  const drift=knownFailureText(p('Stage4Error: [TAXONOMY_UNRESOLVED] The approved crochet-pattern-bundle category mapping "Craft Supplies & Tools > Patterns & How To > Patterns & Blueprints" -> 6343 no longer matches Etsy'));
  assert.equal(drift,['⚠️ Etsy category needs checking','',"The approved Etsy category does not match Etsy's current categories.",'','Nothing was created on Etsy.','Check the category mapping, then Retry.','','Retry is free.'].join('\n'));
  for(const t of [knownFailureText(setup),drift])assert.doesNotMatch(t,/Craft Supplies|Stage4Error|TAXONOMY_UNRESOLVED|6343|Digital crochet/);
  assert.equal(knownFailureText(p('[TAXONOMY_UNRESOLVED] x','production')),null,'only the Etsy step');
  assert.deepEqual(retrySafety(setup),{safe:true,paid:false,reason:'Free: completed work is kept and skipped.'},'Retry is offered and free');
});
