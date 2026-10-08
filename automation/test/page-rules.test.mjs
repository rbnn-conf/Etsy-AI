// Product-type-aware page counts: cards are small, books are not. Offline:
// OpenAI and Telegram are mocked, so no credits are spent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_RULES, pageCountProblems } from '../src/orchestrator/page-rules.mjs';
import { selectProofPages } from '../src/orchestrator/proofs.mjs';
import { loadSchema, validate } from '../src/orchestrator/schema.mjs';
import { harness, msg, photo, press, button, concept, previewCalls, proofCalls, PNG, pressRetry } from './helpers.mjs';

const card=(id,page_count,extra={})=>concept(id,{proposed_name:`Christmas Card ${id}`,product_type:'christmas greeting card',product_format:'greeting-card',
  target_customer:'families sending Christmas cards',page_count,deliverable_components:['front design','inside message','back design','printing and folding guide'],...extra});
const book=(id,format,type,page_count)=>concept(id,{proposed_name:`Book ${id}`,product_type:type,product_format:format,page_count});
const cardSpec=n=>({name:'Cozy Christmas Card',slug:'cozy-christmas-card',season:'Christmas',product_type:'christmas greeting card',target_customer:'families',page_count:n,
  canvas:{orientation:'portrait',background:'illustrated',edge:'full-bleed',format_notes:'Reads as a finished card front.'},
  pages:['card-front','card-inside','card-back'].slice(0,n).map((t,i)=>({page_number:i+1,page_type:t,title:`Card ${t}`,concept:'c',instructions:null,
    artwork_description:'a cozy Christmas scene',generation_prompt:`${t} artwork`,production_notes:'fold guide in the printing guide'}))});
const ok=c=>assert.deepEqual(pageCountProblems({...c,name:c.proposed_name}),[]);
const bad=(c,re)=>assert.match(pageCountProblems({...c,name:c.proposed_name}).join('; '),re);

test('page rules: cards and single printables may be small, books may not',()=>{
  ok(card('A',1));                                              // flat single card
  ok(card('A',3));                                              // folded: front, inside, back
  ok(concept('A',{product_type:'gift tag set',product_format:'printable-set',page_count:2}));
  bad(concept('A',{product_type:'gift tag set',product_format:'printable-set',page_count:1}),/1 is below 2 for printable-set/);
  bad(book('A','activity-book','activity book',3),/3 is below 10/);
  bad(book('A','colouring-book','colouring book',5),/5 is below 10/);
  ok(book('A','activity-book','activity book',20));
  ok(book('A','colouring-book','coloring book',30));
  bad(card('A',5),/5 is above 4 for greeting-card/);            // a card is not a 5-page product
  bad(concept('A',{product_type:'planner',product_format:'planner',page_count:3}),/3 is below 5 for planner/);
});

test('page rules: a book cannot dodge the minimum with a small product_format',()=>{
  bad(book('A','greeting-card','Christmas colouring book',3),/greeting-card contradicts product_type "Christmas colouring book"/);
  bad(book('A','printable-set','kids activity book',8),/8 is below 10 for a book/);
  // Card wording that merely mentions colour is not a book.
  ok(card('A',1,{product_type:'colour-in greeting card'}));
});

test('page rules: concepts stored before product_format keep the old minimum of 5',()=>{
  assert.deepEqual(pageCountProblems({product_type:'party kit',page_count:5}),[]);
  assert.match(pageCountProblems({product_type:'party kit',page_count:4}).join(),/4 is below 5 for a product without product_format/);
  assert.match(pageCountProblems({product_format:'zine',page_count:4}).join(),/unknown format "zine"/);
});

test('page rules table and concepts schema enum stay in sync; schema floor is 1, not 5',async()=>{
  const s=await loadSchema('concepts'), item=s.properties.concepts.items;
  assert.deepEqual([...item.properties.product_format.enum].sort(),Object.keys(PAGE_RULES).sort());
  assert.equal(item.properties.page_count.minimum,1);
  assert.deepEqual(validate(s,{concepts:['A','B','C'].map(id=>card(id,1))}),[]);
  // Strict validation is otherwise intact.
  assert.match(validate(s,{concepts:['A','B','C'].map(id=>card(id,0))}).join(),/page_count: below 1/);
  const {product_format:_,...noFormat}=card('A',3);
  assert.match(validate(s,{concepts:[noFormat,card('B',3),card('C',3)]}).join(),/missing product_format/);
  assert.match(validate(s,{concepts:['A','B','C'].map(id=>card(id,3,{deliverable_components:[]}))}).join(),/deliverable_components: fewer than 1/);
  const spec=await loadSchema('specification');
  assert.equal(spec.properties.page_count.minimum,1);assert.equal(spec.properties.pages.minItems,1);
});

test('proof selection: 1- and 2-page products still get exactly 3 proofs',()=>{
  const one=selectProofPages(cardSpec(1).pages), two=selectProofPages(cardSpec(2).pages), three=selectProofPages(cardSpec(3).pages);
  assert.deepEqual(one.map(s=>[s.page_number,s.role]),[[1,'primary'],[1,'composition-variation'],[1,'treatment-variation']]);
  assert.deepEqual(two.map(s=>[s.page_number,s.role]),[[1,'primary'],[2,'different-composition'],[1,'composition-variation']]);
  assert.deepEqual(three.map(s=>s.page_number).sort(),[1,2,3]);
  assert.throws(()=>selectProofPages([]),/at least 1 page/);
});

for(const n of [1,3])test(`end to end: a ${n}-page greeting card reaches AWAITING_CREATIVE_APPROVAL with 3 proofs`,async()=>{
  const h=await harness({plan:{concepts:()=>({concepts:[card('A',n),card('B',n),card('C',n)]}),specification:()=>cardSpec(n)}});
  try{
    await h.wf.handleUpdate(msg('/newproduct christmas greetings card'));
    assert.equal((await h.wf.handleUpdate(msg('/go'))).outcome,'awaiting_concept_selection');
    const captions=h.telegram.sent.filter(s=>s.type==='photo').map(s=>s.caption);
    assert.equal(captions.length,3);
    assert.match(captions[0],new RegExp(`^A — Christmas Card A\\n.+\\n${n} designed page${n===1?'':'s'}$`));
    assert.equal((await h.store.load('001')).concepts.batches[0].concepts[0].deliverable_components.length,4,'full concept text kept in JSON');
    const r=await h.wf.handleUpdate(press(button(h.telegram,'A')));
    assert.equal(r.outcome,'awaiting_creative_approval');
    const p=await h.store.load(r.productId);
    assert.equal(p.page_count,n);assert.equal(p.pages.length,n);assert.equal(p.proofs.selected_pages.length,3);
    assert.equal(proofCalls(h.calls).length,3,'still exactly three proofs');assert.equal(previewCalls(h.calls).length,3);
    assert.equal(h.telegram.sent.filter(s=>s.type==='album').at(-1).items.length,3,'album of 3 is actually sent (Telegram needs >= 2)');
  }finally{await h.cleanup();}
});

test('end to end: 3-page activity book and 5-page colouring book concepts are rejected; RETRY resumes ideation',async()=>{
  let round=0;
  const h=await harness({files:{ref1:PNG},plan:{concepts:()=>(++round===1
    ?{concepts:[book('A','activity-book','activity book',3),book('B','colouring-book','colouring book',5),book('C','activity-book','activity book',24)]}
    :{concepts:[book('A','activity-book','activity book',24),book('B','colouring-book','colouring book',20),book('C','activity-book','activity book',30)]})}});
  try{
    await h.wf.handleUpdate(msg('/newproduct halloween kids activity book'));await h.wf.handleUpdate(photo('ref1'));
    const r=await h.wf.handleUpdate(msg('/go'));
    assert.equal(r.outcome,'failed');assert.equal(r.step,'ideation');
    let p=await h.store.load('001');
    assert.equal(p.status,'FAILED');assert.equal(p.resume_state,'REFERENCES_RECEIVED');assert.equal(p.last_error.retryable,true);
    assert.match(p.last_error.message,/InvalidModelOutputError: ideas: model output rejected: \$\.concepts\[0\]\.page_count: 3 is below 10/);
    assert.match(p.last_error.message,/\$\.concepts\[1\]\.page_count: 5 is below 10/);
    assert.equal(p.concepts.batches.length,0,'rejected concepts are not stored');
    // Same shape as live Product #009: FAILED at ideation after analysis + direction.
    const retry=await pressRetry(h);
    assert.equal(retry.outcome,'awaiting_concept_selection');
    p=await h.store.load('001');
    assert.equal(p.status,'AWAITING_CONCEPT_SELECTION');assert.deepEqual(p.concepts.batches[0].concepts.map(c=>c.page_count),[24,20,30]);
    assert.equal(h.calls.filter(c=>c.schemaName==='reference-analysis').length,1,'analysis not repeated on retry');
    assert.equal(h.calls.filter(c=>c.schemaName==='creative-direction').length,1,'direction not repeated on retry');
  }finally{await h.cleanup();}
});

test('end to end: the specification cannot turn a greeting-card concept into a 12-page book',async()=>{
  const bookSpec={...cardSpec(1),product_type:'activity book',page_count:12,
    pages:Array.from({length:12},(_,i)=>({...cardSpec(1).pages[0],page_number:i+1}))};
  const h=await harness({plan:{concepts:()=>({concepts:[card('A',3),card('B',3),card('C',3)]}),specification:()=>bookSpec}});
  try{
    await h.wf.handleUpdate(msg('/newproduct christmas greetings card'));await h.wf.handleUpdate(msg('/go'));
    const r=await h.wf.handleUpdate(press(button(h.telegram,'A')));
    assert.equal(r.outcome,'failed');assert.equal(r.step,'specification');
    const p=await h.store.load('001');
    assert.equal(p.resume_state,'CONCEPT_SELECTED');assert.equal(p.pages.length,0);
    assert.match(p.last_error.message,/greeting-card contradicts product_type "activity book"/);
  }finally{await h.cleanup();}
});
