// Crochet pattern bundle format (ADR-040): canonical id and aliases, where it
// is supported, the source schema, and that existing formats are unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { repoRoot } from '../src/config.mjs';
import { resolveFormat, normaliseFormat, formatSupport, CANONICAL_FORMATS, FORMAT_ALIASES } from '../src/orchestrator/formats.mjs';
import { PAGE_RULES } from '../src/orchestrator/page-rules.mjs';
import { loadSchema, validate } from '../src/orchestrator/schema.mjs';
import { CROCHET_FORMAT, BUNDLE_REQUIRED, PATTERN_REQUIRED, validateCrochetBundle, ADAPTERS } from '../../production/src/index.mjs';
import { STAGE3_ADAPTERS } from '../../marketing/src/stage3/adapters/index.mjs';
import { crochetBundle } from '../../production/test/crochet-fixture.mjs';

test('canonical id: crochet-pattern-bundle resolves from its id and every alias',()=>{
  assert.equal(CROCHET_FORMAT,'crochet-pattern-bundle');
  assert.ok(CANONICAL_FORMATS.includes(CROCHET_FORMAT));
  for(const t of ['crochet-pattern-bundle','crochet pattern bundle','Crochet Pattern Bundle','crochet_pattern_bundle',
    'crochet pattern','crochet-pattern','crochet bundle','crochet flower pattern','crochet flower bouquet pattern',
    'Crochet Patterns','crochet flower patterns','  CROCHET   Bundle  '])
    assert.equal(resolveFormat(t),CROCHET_FORMAT,t);
  assert.deepEqual([...FORMAT_ALIASES[CROCHET_FORMAT]],['crochet pattern','crochet-pattern','crochet bundle','crochet pattern bundle','crochet flower pattern','crochet flower bouquet pattern']);
});

test('resolution never guesses: unrelated or partial words resolve to null',()=>{
  for(const t of ['crochet','knitting pattern','crochet hook','flower pattern','amigurumi','pattern','',null,undefined,'sewing pattern bundle'])
    assert.equal(resolveFormat(t),null,String(t));
});

test('no regression: every existing canonical format resolves to itself, in the same order',()=>{
  assert.deepEqual(CANONICAL_FORMATS,Object.keys(PAGE_RULES));
  assert.equal(CANONICAL_FORMATS.at(-1),CROCHET_FORMAT,'crochet is added after the existing formats (ADR-041)');
  for(const f of Object.keys(PAGE_RULES)){
    assert.equal(resolveFormat(f),f);
    assert.equal(resolveFormat(f.replace(/-/g,' ')),f);
  }
  assert.equal(resolveFormat('Greeting Cards'),'greeting-card');
  assert.equal(normaliseFormat('Colouring-Books'),'colouring book');
});

test('support (ADR-041/042): offered to Stage 1, produced by Stage 2, marketed by Stage 3; other formats unchanged',async()=>{
  assert.deepEqual(formatSupport('crochet flower pattern'),{format:CROCHET_FORMAT,known:true,stage1:true,stage2:true});
  assert.deepEqual(formatSupport('colouring-book'),{format:'colouring-book',known:true,stage1:true,stage2:true});
  assert.deepEqual(formatSupport('activity-book'),{format:'activity-book',known:true,stage1:true,stage2:false});
  assert.deepEqual(formatSupport('knitting'),{format:null,known:false,stage1:false,stage2:false});
  assert.deepEqual(PAGE_RULES[CROCHET_FORMAT],{min:1,max:3});
  const concepts=await loadSchema('concepts');
  assert.ok(concepts.properties.concepts.items.properties.product_format.enum.includes(CROCHET_FORMAT));
  assert.match(await readFile(join(repoRoot,'automation','prompts','creative-director.md'),'utf8'),/crochet-pattern-bundle: 1–3 artwork pages only/);
  assert.deepEqual(Object.keys(ADAPTERS),['greeting-card','colouring-book',CROCHET_FORMAT]);
  assert.deepEqual(Object.keys(STAGE3_ADAPTERS),['greeting-card','colouring-book',CROCHET_FORMAT],'crochet marketing adapter (ADR-042)');
});

test('source schema: valid fixture passes; structural failures are rejected; required lists match the validator',async()=>{
  const schema=JSON.parse(await readFile(join(repoRoot,'production','schemas','crochet-pattern-bundle.schema.json'),'utf8'));
  // Only keywords the repository validator enforces (it would silently ignore others).
  const KNOWN=new Set(['$schema','$id','title','description','type','enum','const','required','properties','additionalProperties','items','minItems','maxItems','minLength','maxLength','pattern','minimum','maximum','format']);
  const walk=(s,p)=>{if(!s||typeof s!=='object')return;for(const k of Object.keys(s))assert.ok(KNOWN.has(k),`${p}: ${k}`);
    for(const [k,v] of Object.entries(s.properties??{}))walk(v,`${p}/${k}`);if(typeof s.items==='object')walk(s.items,`${p}/items`);
    if(typeof s.additionalProperties==='object')walk(s.additionalProperties,`${p}/additionalProperties`);};
  walk(schema,'#');
  assert.deepEqual(schema.required,[...BUNDLE_REQUIRED]);
  assert.deepEqual(schema.properties.patterns.items.required,[...PATTERN_REQUIRED]);
  const ok=crochetBundle({patterns:33});
  assert.deepEqual(validate(schema,ok),[]);assert.ok(validateCrochetBundle(ok).ok);
  // The same structural failures are rejected by both.
  const breaks=[b=>{delete b.terminology;},b=>{b.patterns[0].instructions=[];},b=>{b.patterns[0].yarn=[];},b=>{b.patterns[0].pattern_id='Bad Id';},
    b=>{b.patterns[0].extra=1;},b=>{b.patterns[0].hook_size={mm:0};},b=>{b.format='colouring-book';}];
  for(const br of breaks){
    const b=crochetBundle();br(b);
    assert.ok(validate(schema,b).length>0,`schema accepts: ${br}`);
    assert.ok(!validateCrochetBundle(b).ok,`validator accepts: ${br}`);
  }
});

test('boundary: the SEO engine does not import production or automation to know this format',async()=>{
  const { readdir }=await import('node:fs/promises');
  const dir=join(repoRoot,'seo','src');
  for(const f of await readdir(dir)){
    const text=await readFile(join(dir,f),'utf8');
    assert.ok(!/from\s+['"][^'"]*(production|automation)\//.test(text),`seo/src/${f}`);
  }
});
