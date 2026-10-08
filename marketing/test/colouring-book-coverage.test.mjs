// Colouring-book Stage 3 images: the real pages must stay the hero for BOTH page orientations.
// Landscape books used to get portrait-sized layouts, so the real page rendered as a small thumbnail and
// five slides failed the product-share QC. The floors themselves are the planner's and are asserted unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planSlides, renderSlides, productShare, deriveStrategy, stage3AdapterFor } from '../src/stage3/index.mjs';
import { rendererAvailable } from '../src/render.mjs';
import { sharp } from '../../production/src/lib.mjs';
import { book } from './colouring-fixture.mjs';

const SLOTS={coloured:.08,'before-after':.2,included:.12,features:.3,bundle:.3};

test('planner floors for the five slots are unchanged (the fix is layout, not thresholds)',async()=>{
  const {facts}=await book('landscape'), plan=planSlides(facts,{strategy:deriveStrategy(facts)});
  for(const [t,min] of Object.entries(SLOTS))assert.equal(plan.slides.find(s=>s.template===t).min_product_share,min,t);
});

for(const orientation of ['landscape','portrait'])test(`${orientation} colouring book: every slot meets its own product-share floor`,async t=>{
  if(!await rendererAvailable())return t.skip('no renderer');
  const {facts,A}=await book(orientation), plan=planSlides(facts,{strategy:deriveStrategy(facts)});
  const dir=await mkdtemp(join(tmpdir(),'dpf-cb-')), ex=join(dir,'example.png');
  t.after(()=>rm(dir,{recursive:true,force:true}));   // never leave renders in the temp folder
  await writeFile(ex,await sharp({create:{width:1400,height:orientation==='landscape'?933:1400*1.5|0,channels:3,background:'#d9a'}}).png().toBuffer());
  plan.slides=plan.slides.filter(s=>SLOTS[s.template]!==undefined);
  assert.deepEqual(plan.slides.map(s=>s.template),Object.keys(SLOTS).sort((a,b)=>Object.keys(SLOTS).indexOf(a)-Object.keys(SLOTS).indexOf(b)));
  const res=await renderSlides({facts,plan,art:A,examples:{'example-p2':ex},outDir:dir});
  for(const r of res){
    const s=plan.slides.find(x=>x.id===r.slide), got=productShare(r.artwork,r.width);
    assert.ok(got>=s.min_product_share,`${orientation} ${r.slide}: ${(got*100).toFixed(1)}% >= ${s.min_product_share*100}%`);
    // Landscape pages are actually large, not merely over the floor.
    if(orientation==='landscape')assert.ok(got>=s.min_product_share+.03,`${r.slide} has headroom (${(got*100).toFixed(1)}%)`);
    assert.ok(r.artwork.every(a=>a.complete&&Math.abs((a.boxW/a.boxH)/(a.naturalW/a.naturalH)-1)<=0.005),`${r.slide}: artwork whole and unstretched`);
  }
});

test('no product-specific logic in the colouring-book compositions',async()=>{
  const {readFile}=await import('node:fs/promises');
  const src=await readFile(new URL('../src/stage3/colouring-book.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(src,/017|autumn-colouring|Railway|Ticket Booth/i);
  assert.ok(stage3AdapterFor('colouring-book'));
});
