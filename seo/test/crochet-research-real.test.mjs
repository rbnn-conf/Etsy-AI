// The REAL owner-captured crochet research (Crochet Flower Bouquet Pattern Bundle,
// 2026-09-29): the crochet search shape (ADR-041 amendment to ADR-033) puts the
// owner's real searches in the plan; nothing is invented. Local files only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ResearchWorkspace, MODES, createResearchPlan, validateIdea, SEARCH_SHAPES } from '../src/index.mjs';

const ROOT=join(import.meta.dirname,'..'), DIR='fixtures/research-cycle/crochet-flower-bouquet-real';
const json=async p=>JSON.parse(await readFile(join(ROOT,p),'utf8'));

test('crochet search shape: theme queries read "crochet <theme> pattern"; other families are unchanged',async()=>{
  assert.deepEqual(SEARCH_SHAPES,{'crochet pattern':'crochet {theme} pattern'});
  const idea=validateIdea(await json(`${DIR}/idea.json`)).idea, p=createResearchPlan({idea,now:new Date('2026-09-29')});
  const p1=p.queries.filter(q=>q.priority==='P1').map(q=>q.query);
  for(const q of ['crochet flower pattern','crochet flower bouquet pattern','crochet rose pattern','crochet sunflower pattern','crochet leaf pattern'])assert.ok(p1.includes(q),q);
  assert.ok(!p.queries.some(q=>/crochet crochet|roses crochet pattern bundle/.test(q.query)));
  const cozy=createResearchPlan({idea:validateIdea(await json('fixtures/ideas/cozy-autumn-colouring-adults-structured.json')).idea,now:new Date('2026-09-29')});
  assert.ok(cozy.queries.some(q=>q.query==='autumn coloring pages'),'unshaped families keep "<theme> <format>"');
});

test('real capture: 8 owner observations stored; planned ones are captured; off-plan ones stay stored but unscored; nothing guessed',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'crochet-seo-'));
  try{
    const cap=await json(`${DIR}/capture-1.json`);
    assert.equal(cap.rows.length,8);
    assert.ok(cap.rows.every(r=>r.trend_percent===null&&r.captured_at===null),'no trend or capture date was supplied');
    const ws=await ResearchWorkspace.create({dir,mode:MODES.NEW_PRODUCT,idea:await json(`${DIR}/idea.json`),profile:await json(`${DIR}/profile.json`),research_id:'crochet-real',now:new Date('2026-09-29')});
    await ws.importCapture({rows:cap.rows,recorded_at:cap.recorded_at,recorded_by:'owner',note:cap.note},{now:new Date('2026-09-29')});
    const again=await ResearchWorkspace.open(dir), st=again.state();
    assert.equal(again.research.observations.length,8);
    const captured=st.ledger.filter(e=>e.state==='captured').map(e=>e.term).sort();
    assert.deepEqual(captured,['crochet flower bouquet pattern','crochet flower pattern','crochet rose pattern','crochet sunflower pattern']);
    assert.ok(st.ledger.filter(e=>e.state==='captured').every(e=>e.relevance_class==='EXACT'));
    // The owner still decides: capture or mark unavailable the other P1 searches, or finish (ADR-035).
    assert.equal(st.readiness.status,'RESEARCH_INCOMPLETE');
    assert.equal(st.readiness.counts.p1_pending,10);
  }finally{await rm(dir,{recursive:true,force:true});}
});
