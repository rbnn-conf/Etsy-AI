// Stage 3 for colouring books (ADR-037): an approved Stage 2 book -> the
// colouring-book Stage 3 adapter -> listing + AI scenes + AI coloured example
// (an image EDIT of a real page) -> real rendering and QC -> Telegram review.
// Reproduces the Product #014 situation: Stage 2 approved, Stage 3 failed;
// RETRY (after the paid-step confirmation) resumes at Stage 3 only.
// Fake OpenAI and Telegram: ZERO real OpenAI calls, ZERO Etsy calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, cp, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { msg, press, lastKeyboard } from './helpers.mjs';
import { deriveFacts, stage3AdapterFor, STAGE3_ADAPTERS } from '../../marketing/src/stage3/index.mjs';
import { N, sha, lineArt, LISTING, lastScreen, snapshot, productionApproved } from './colouring-fixture.mjs';

test('colouring-book Stage 3: the #014 failure state -> Retry (confirmed) -> Stage 3 only -> real pages + labelled AI examples -> QC -> Telegram PNG review',async()=>{
  const {h,ws}=await productionApproved({failListingOnce:true});
  try{
    // The colouring-book format resolves to its own Stage 3 adapter; greeting cards keep theirs.
    assert.equal(stage3AdapterFor('colouring-book'),STAGE3_ADAPTERS['colouring-book']);
    assert.notEqual(stage3AdapterFor('colouring-book'),stage3AdapterFor('greeting-card'));
    assert.throws(()=>stage3AdapterFor('activity-book'),/No Stage 3 marketing support for "activity-book" yet \(available: greeting-card, colouring-book, crochet-pattern-bundle\)/);

    // The Stage 2 handoff is consumed: representative pages are the ones Stage 2 recorded (build record stage3_handoff).
    const record=JSON.parse(await readFile(join(ws,'production/build-record.json')));
    const facts=await deriveFacts(ws);
    assert.equal(facts.product_format,'colouring-book');
    assert.deepEqual(facts.book,{page_count:N,colouring_pages:N-1,cover:true,orientation:'portrait',page_px:[1024,1536],
      non_colouring_pages:[{page_number:1,kind:'cover',title:'Winter Windows'}]});
    assert.deepEqual([record.stage3_handoff.page_count,record.stage3_handoff.colouring_pages],[facts.book.page_count,facts.book.colouring_pages]);
    assert.deepEqual(facts.selection.showcase,record.stage3_handoff.representative_pages.filter(r=>r.role!=='cover').map(r=>r.page_number));
    assert.equal(facts.selection.lead,1);assert.equal(facts.selection.example,facts.selection.showcase[0]);
    assert.ok(facts.pages.every(p=>p.file.startsWith('book/pages/')&&/^[0-9a-f]{64}$/.test(p.sha256)));
    assert.deepEqual(facts.formats.map(f=>f.key),['A4','US-Letter','Colouring-Pages-PNG']);

    // Freeze Stage 2 and Stage 1 artwork: Stage 3 must never change them.
    const production=await snapshot(join(ws,'production')), book=await snapshot(join(ws,'book'));
    const productIds=async()=>(await readdir(join(h.root,'products'))).sort();
    const idsBefore=await productIds();

    // First /market fails in Stage 3 (as #014 did). Record the #014 message; state: FAILED, resumes from PRODUCTION_APPROVED.
    assert.equal((await h.wf.handleUpdate(msg('/market 001'))).outcome,'failed');
    let p=await h.store.load('001');
    assert.deepEqual([p.status,p.resume_state,p.last_error.step],['FAILED','PRODUCTION_APPROVED','marketing']);
    await h.store.save({...p,last_error:{...p.last_error,message:'Stage3Error: No Stage 3 marketing support for "colouring-book" yet. Stage 2 recorded its marketing metadata (build record: stage3_handoff).'}});

    // Retry is a paid step: the first press only shows the confirmation screen, with NO OpenAI call.
    const before=h.calls.length;
    const retry=lastKeyboard(h.telegram).find(b=>b.text==='🔄 Retry (API cost)');
    assert.ok(retry,'paid retry offered');
    await h.wf.handleUpdate(press(retry.callback_data));
    assert.equal(h.calls.length,before,'no OpenAI call before the owner confirms');
    assert.equal((await h.store.load('001')).status,'FAILED');
    const confirm=lastScreen(h).replyMarkup.inline_keyboard.flat().find(b=>b.text==='Confirm');
    const r=await h.wf.handleUpdate(press(confirm.callback_data));
    assert.equal(r.outcome,'awaiting_marketing_approval',JSON.stringify((await h.store.load('001')).last_error));

    // Resumed at Stage 3: no Stage 1/2 call, no Stage 2 rebuild, same product number.
    const made=h.calls.slice(before);
    assert.deepEqual(made.map(c=>c.schemaName??c.step),['listing','marketing-copy','marketing-scene','marketing-scene','marketing-example']);
    assert.deepEqual(await productIds(),idsBefore);
    p=await h.store.load('001');
    assert.equal(p.status,'AWAITING_MARKETING_APPROVAL');
    assert.ok(!p.status_history.slice(-6).some(s=>/PRODUCTION_(BUILDING|QC)|BOOK_/.test(s.to)),'Stage 2 did not rerun');
    assert.deepEqual(await snapshot(join(ws,'production')),production,'Stage 2 outputs unchanged');
    assert.deepEqual(await snapshot(join(ws,'book')),book,'approved book pages unchanged');

    // The coloured example is an image EDIT of the exact approved page (never a text-to-image redraw).
    const edit=made.find(c=>c.kind==='imageEdit'), exPage=facts.pages.find(x=>x.page_number===facts.selection.example);
    assert.equal(edit.image_sha,exPage.sha256);assert.equal(edit.size,'1024x1536');
    assert.match(edit.prompt,/Keep every black line exactly as it is/);
    // Scenes are environments only.
    for(const c of made.filter(c=>c.step==='marketing-scene'))assert.match(c.prompt,/Do NOT include: colouring pages, colouring books, books/);

    // Outputs: marketing/ only, never inside the customer deliverables or ZIPs.
    const plan=JSON.parse(await readFile(join(ws,'marketing/plan.json')));
    assert.equal(plan.format,'colouring-book');
    assert.deepEqual(plan.slides.map(s=>s.template),['hero','interior','collage','coloured','before-after','included','printable','features','lifestyle','bundle']);
    assert.deepEqual(plan.examples.map(e=>[e.id,e.file]),[[`example-p${exPage.page_number}`,`marketing/examples/example-p${exPage.page_number}.png`]]);
    const render=JSON.parse(await readFile(join(ws,'marketing/images/render.json')));
    assert.equal(render.length,10);
    const manifest=JSON.parse(await readFile(join(ws,'marketing/work/art-manifest.json')));
    const traced=new Set(manifest.map(a=>a.sha256)), exampleSha=plan.examples[0].sha256;
    for(const x of render){assert.ok(x.artwork.length,`${x.slide} shows real artwork`);for(const a of x.artwork){assert.ok(traced.has(a.sha256));assert.notEqual(a.sha256,exampleSha);}}
    assert.ok(manifest.filter(a=>a.key.startsWith('page-')).every(a=>facts.pages.some(p=>p.file===a.source.file&&p.sha256===a.source.sha256)));
    for(const z of record.zip_parts)for(const e of z.entries)assert.doesNotMatch(e,/marketing|example|listing/i,`${e} is not a marketing file`);
    assert.ok(Object.keys(production).every(f=>!/marketing/.test(f)));

    // QC passed, including the example checks.
    const qc=JSON.parse(await readFile(join(ws,'marketing/qc.json')));
    assert.equal(qc.passed,true,JSON.stringify(qc.checks.filter(c=>!c.ok)));
    for(const name of ['coloured examples generated','coloured examples never used as product artwork','coloured examples labelled as examples','production package unchanged'])
      assert.ok(qc.checks.find(c=>c.name===name)?.ok,name);

    // Telegram: the listing, the thumbnail sheet and the 10 listing PNGs; no customer PDF or ZIP.
    const media=h.telegram.sent.filter(s=>s.type==='photo'||s.type==='album').flatMap(s=>s.type==='album'?s.items:[s]);
    assert.ok(media.some(m=>m.fileName==='001-thumbnails.png'));
    assert.equal(media.filter(m=>/^001-\d\d-.+\.png$/.test(m.fileName)).length,10);
    assert.ok(media.every(m=>/\.png$/.test(m.fileName)),'previews are PNGs only');
    const summary=h.telegram.sent.filter(s=>s.type==='message').map(s=>s.text).find(t=>/ETSY LISTING READY/.test(t));
    assert.match(summary,/AI coloured examples: 1 \(labelled as examples; the product is the line art\)/);
    assert.match(summary,/Nothing is published/);
  }finally{await h.cleanup();}
});

test('colouring-book Stage 3 fails clearly, before any OpenAI call, when required approved artwork is missing or changed',async()=>{
  const {h,ws}=await productionApproved();
  try{
    const facts=await deriveFacts(ws), n=facts.selection.showcase[0], p=facts.pages.find(x=>x.page_number===n);
    const copy=join(h.root,'copy');await cp(ws,copy,{recursive:true});
    await unlink(join(copy,p.file));
    await assert.rejects(deriveFacts(copy),new RegExp(`Stage 3 needs the approved artwork of page ${n} \\("${p.title}"\\), but ${p.file} is missing`));
    await writeFile(join(copy,p.file),await lineArt(999));
    await assert.rejects(deriveFacts(copy),new RegExp(`The approved artwork of page ${n} changed since production approval: ${p.file}`));
    // Through the workflow: a clear failure, no OpenAI call, nothing written into Stage 2.
    const production=await snapshot(join(ws,'production'));
    await unlink(join(ws,p.file));
    const before=h.calls.length;
    assert.equal((await h.wf.handleUpdate(msg('/market 001'))).outcome,'failed');
    assert.equal(h.calls.length,before,'no OpenAI call');
    const q=await h.store.load('001');
    assert.match(q.last_error.message,/Stage 3 needs the approved artwork of page/);
    assert.equal(q.resume_state,'PRODUCTION_APPROVED');
    assert.deepEqual(await snapshot(join(ws,'production')),production);
  }finally{await h.cleanup();}
});

test('#014 regression: a listing that calls the book "one page" is rejected (nothing saved, Stage 2 untouched); the model saw the page-quantity contract; the confirmed retry makes exactly one new listing call',async()=>{
  // First listing: the #014 failure mode. Second: truthful quantities.
  const onePage=()=>({...LISTING(),description:'Settle in with a warm drink and one page of calm winter colouring.\n\nThis is a digital download. No physical item is shipped.'});
  const {h,ws}=await productionApproved({listing:n=>n===1?onePage():LISTING()});
  try{
    const production=await snapshot(join(ws,'production')), book=await snapshot(join(ws,'book'));
    assert.equal((await h.wf.handleUpdate(msg('/market 001'))).outcome,'failed');
    let p=await h.store.load('001');
    assert.deepEqual([p.status,p.resume_state,p.last_error.step],['FAILED','PRODUCTION_APPROVED','marketing']);
    assert.match(p.last_error.message,/listing: rejected: description: "one page" \(production has 10 pages \(9 colouring pages\)\)/);
    // The rejected output is never saved or reused; the call is still recorded (and billed) as rejected.
    await assert.rejects(readFile(join(ws,'marketing/listing.json')));
    assert.deepEqual(p.api_usage.filter(u=>u.step==='listing').map(u=>u.outcome),['rejected']);
    // What the model was told: authoritative page quantities and the colouring-book contract.
    const user=h.calls.find(c=>c.schemaName==='listing').user;
    const facts=JSON.parse(user.split('PRODUCTION FACTS (the only claims you may make):\n')[1].split('\n\nMARKETING STRATEGY')[0]);
    assert.deepEqual(facts.product_quantity.colouring_pages,9);assert.deepEqual(facts.product_quantity.total_document_pages,10);
    assert.deepEqual(facts.product_quantity.non_colouring_pages,[{page:1,kind:'cover',title:'Winter Windows'}]);
    assert.match(facts.reference_images,/ONE page from this book/);
    assert.match(user,/FORMAT RULES \(colouring-book; authoritative/);
    assert.match(user,/State the quantity as "9 colouring pages"/);
    assert.match(user,/Never describe the product, or what the buyer gets, as "one page", "a single page", "1 page"/);
    assert.match(user,/Never infer a quantity by counting images, page titles or files/);
    // Confirmed retry: one new listing call (nothing valid to reuse), then the rest of Stage 3.
    const before=h.calls.length;
    await h.wf.handleUpdate(press(lastKeyboard(h.telegram).find(b=>b.text==='🔄 Retry (API cost)').callback_data));
    assert.equal(h.calls.length,before,'no call before Confirm');
    const r=await h.wf.handleUpdate(press(lastScreen(h).replyMarkup.inline_keyboard.flat().find(b=>b.text==='Confirm').callback_data));
    assert.equal(r.outcome,'awaiting_marketing_approval',JSON.stringify((await h.store.load('001')).last_error));
    assert.deepEqual(h.calls.slice(before).map(c=>c.schemaName??c.step),['listing','marketing-copy','marketing-scene','marketing-scene','marketing-example']);
    assert.deepEqual(await snapshot(join(ws,'production')),production);
    assert.deepEqual(await snapshot(join(ws,'book')),book);
  }finally{await h.cleanup();}
});
