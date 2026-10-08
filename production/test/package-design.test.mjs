// APPROVE PRODUCTION design guard: a package may be approved only when its
// RECORDED build metadata (format, design, version) equals the live adapter for
// its format. Generic for every format and every future design upgrade.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { approvedProduct, CROCHET_PAGES } from './fixtures.mjs';
import { crochetBundle } from './crochet-fixture.mjs';
import { writeHandoff, buildProduction, BUILD_RECORD, ADAPTERS, packageDesignCheck, packageDesign, describePackage, designLabel } from '../src/index.mjs';
import { crochetPatternBundle, crochetPatternBundleMoonlit } from '../src/adapters/crochet-pattern-bundle.mjs';

const C='crochet-pattern-bundle';
const rec=adapter=>({adapter});

test('classic v1 package against live Moonlit v2: refused, named Classic v1 vs Moonlit v2',()=>{
  const r=rec({format:C,design:'classic',design_name:'Classic',version:1}), c=packageDesignCheck(r,C);
  assert.equal(c.ok,false);
  assert.equal(designLabel(c.built),'Classic v1');assert.equal(designLabel(c.live),'Moonlit v2');
});

test('Moonlit v2 package against live Moonlit v2: allowed',()=>{
  assert.equal(packageDesignCheck(rec({format:C,design:'moonlit',design_name:'Moonlit',version:2}),C).ok,true);
});

test('missing design metadata is refused safely; a legacy record is still named for the owner',()=>{
  for(const r of [null,{},rec(null),rec({format:C,version:2}),rec({format:C,design:'',version:2}),rec({format:C,design:'moonlit'}),rec({format:C,design:'moonlit',version:'2'})])
    assert.equal(packageDesignCheck(r,C).ok,false,JSON.stringify(r));
  // A package built before design metadata existed (format + version only): refused, but named by what that version was.
  const legacy=rec({format:C,version:1});
  assert.equal(packageDesign(legacy),null);assert.equal(packageDesignCheck(legacy,C).ok,false);
  assert.equal(designLabel(describePackage(legacy)),'Classic v1');
  assert.equal(designLabel(describePackage(rec({format:C,version:99}))),'Unknown design');
});

test('same design id, different version: refused (and the reverse)',()=>{
  assert.equal(packageDesignCheck(rec({format:C,design:'moonlit',design_name:'Moonlit',version:1}),C).ok,false);
  assert.equal(packageDesignCheck(rec({format:C,design:'classic',design_name:'Classic',version:2}),C).ok,false);
  assert.equal(packageDesignCheck(rec({format:'greeting-card',design:'moonlit',version:2}),C).ok,false,'a package of another format');
  assert.equal(packageDesignCheck(rec({format:'no-such-format',design:'x',version:1}),'no-such-format').ok,false,'no live adapter');
});

test('other formats compare against their own live adapter',()=>{
  for(const [format,a] of Object.entries(ADAPTERS)){
    assert.equal(typeof a.design,'string');assert.equal(typeof a.designName,'string');
    assert.equal(packageDesignCheck(rec({format,design:a.design,design_name:a.designName,version:a.version}),format).ok,true,format);
    assert.equal(packageDesignCheck(rec({format,design:a.design,design_name:a.designName,version:a.version+1}),format).ok,false,format);
  }
  assert.equal(packageDesignCheck(rec({format:'greeting-card',design:'standard',design_name:'Standard',version:2}),'greeting-card').ok,true);
});

test('build records carry format, design and version; a rebuild replaces a classic package with the live design',async()=>{
  const f=await approvedProduct({format:C,pages:CROCHET_PAGES,crochet:crochetBundle({patterns:2})});
  try{
    const {handoff,sha256}=await writeHandoff(f.product,f.dir);
    const old=await buildProduction({productDir:f.dir,handoff,handoffSha:sha256,adapter:crochetPatternBundle});
    assert.deepEqual(old.record.adapter,{format:C,design:'classic',design_name:'Classic',version:1});
    assert.equal(packageDesignCheck(JSON.parse(await readFile(join(f.dir,BUILD_RECORD),'utf8')),C).ok,false,'the classic package cannot be approved');
    // REBUILD (force) through the live registry.
    const now=await buildProduction({productDir:f.dir,handoff,handoffSha:sha256,force:true});
    assert.deepEqual(now.record.adapter,{format:C,design:crochetPatternBundleMoonlit.design,design_name:'Moonlit',version:2});
    assert.equal(now.skipped.length,0,'nothing reused from the classic package');
    assert.equal(packageDesignCheck(JSON.parse(await readFile(join(f.dir,BUILD_RECORD),'utf8')),C).ok,true);
  }finally{await f.cleanup();}
});

test('refusal screen names: never the same as the live design',async()=>{
  const { refusalLabels } = await import('../src/index.mjs');
  const legacyClassic=rec({format:C,version:1});
  assert.deepEqual(refusalLabels(legacyClassic,packageDesignCheck(legacyClassic,C)),{built:'Classic v1',live:'Moonlit v2'});
  const unrecordedCurrent=rec({format:C,version:2});
  assert.deepEqual(refusalLabels(unrecordedCurrent,packageDesignCheck(unrecordedCurrent,C)),{built:'Unknown design',live:'Moonlit v2'});
  assert.deepEqual(refusalLabels(null,packageDesignCheck(null,C)),{built:'Unknown design',live:'Moonlit v2'});
});
