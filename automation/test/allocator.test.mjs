import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProductStore } from '../src/orchestrator/store.mjs';
import { loadReservedIds, repoRoot } from '../src/config.mjs';

test('reserved ids set a floor even when their folders are absent',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'lumiumx-alloc-'));
  try{
    // A checkout like main: products up to 006 exist, 007 is not present.
    for(const n of ['001-a','003-b','006-c'])await mkdir(join(dir,n));
    const store=new ProductStore({productsDir:dir,reservedIds:['007']});
    assert.equal(await store.nextProductId(),'008');
    const p=await store.create({requestText:'halloween kids activity book',chatId:1,requestedBy:'@owner'});
    assert.equal(p.product_id,'008');assert.equal(p.workspace,'008-halloween-kids-activity-book');
    assert.equal(await store.nextProductId(),'009','numbers are never reused');
    await mkdir(join(dir,'010-hand-built'));
    assert.equal(await store.nextProductId(),'011','existing folders above the reserve win');
    assert.throws(()=>new ProductStore({productsDir:dir,reservedIds:['7']}),/Invalid reserved/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('LIVE (read-only): the real products/ + committed reserve allocate 008 or later, and nothing is created',async()=>{
  const productsDir=join(repoRoot,'products');
  const before=(await readdir(productsDir)).sort();
  const reserved=await loadReservedIds();
  assert.ok(reserved.includes('007'),'007 (Cute Ghost activity book) is reserved');
  const next=await new ProductStore({productsDir,reservedIds:reserved}).nextProductId();
  assert.ok(Number(next)>=8,`next id ${next} must be >= 008`);
  console.log(`LIVE next product id: ${next}`);
  assert.deepEqual((await readdir(productsDir)).sort(),before,'allocation check is read-only');
});
