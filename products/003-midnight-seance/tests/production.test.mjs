import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { loadResources } from '../src/resources.mjs';
import { contained,PRODUCT_ROOT } from '../src/paths.mjs';
import { generatePuzzle, verifyPuzzle, blockedHits } from '../src/games/word-search.mjs';
import { validateFields,fixtureValues } from '../src/edit/validation.mjs';
import { renderDocument } from '../src/render/document.mjs';
const r=await loadResources();
test('puzzle is reproducible and all 18 unique answers are independently readable',()=>{
  assert.deepEqual(generatePuzzle(r.game,r.qc.blockedStrings),r.puzzle);
  const words=new Set();
  for(const answer of r.puzzle.solutions){
    assert.equal(answer.cells.length,answer.word.length);
    const [first,second]=answer.cells,dx=second[0]-first[0],dy=second[1]-first[1];
    assert.ok(Math.abs(dx)<=1&&Math.abs(dy)<=1&&(dx||dy));
    answer.cells.forEach(([x,y],i)=>assert.deepEqual([x,y],[first[0]+dx*i,first[1]+dy*i]));
    words.add(answer.cells.map(([x,y])=>r.puzzle.grid[y][x]).join(''));
  }
  assert.deepEqual([...words].sort(),[...r.game.words].sort());
  assert.equal(blockedHits(r.puzzle.grid,r.qc.blockedStrings).length,0);
});
test('tampered keys and invalid word lists fail instead of publishing an incorrect game',()=>{
  const bad=structuredClone(r.puzzle);bad.solutions[0].cells[0]=[0,0];
  assert.throws(()=>verifyPuzzle(bad,r.game.words,r.qc.blockedStrings));
  assert.throws(()=>generatePuzzle({...r.game,words:['ROSE','ROSE']},[]));
  assert.throws(()=>generatePuzzle({...r.game,words:['X'.repeat(17)]},[]));
});
test('finite blocked-string screening finds backwards and diagonal strings',()=>{
  assert.ok(blockedHits([['T','I','H','S'],['A','A','A','A'],['A','A','A','A'],['A','A','A','A']],['SHIT']).length);
  assert.ok(blockedHits([['S','A','A','A'],['A','H','A','A'],['A','A','I','A'],['A','A','A','T']],['SHIT']).length);
});
test('editing fixtures are valid at each exact character limit',()=>{
  for(const kind of ['invitation','welcome'])for(const scenario of ['default','maximum','maximum-wide','us','special','optional-empty']){
    const values=fixtureValues(r.schemas,kind,scenario,r.defaults);
    assert.deepEqual(validateFields(kind,values,r.schemas).errors,[]);
    if(scenario.startsWith('maximum'))for(const [key,rule] of Object.entries(r.schemas[kind]))assert.equal([...values[key]].length,rule.max);
  }
});
test('editor rejects oversized, unsupported, missing and unexpected input without truncating it',()=>{
  const values=structuredClone(r.defaults.invitation);
  for(const patch of [{eventTitle:'X'.repeat(37)},{eventTitle:'👻'},{date:''},{eventTitle:'\u0000'},{unknown:'surprise'},{eventTitle:'<script>alert(1)</script>'}])assert.equal(validateFields('invitation',{...values,...patch},r.schemas).valid,false);
  assert.equal(validateFields('missing',values,r.schemas).valid,false);
  const text='X'.repeat(37);validateFields('invitation',{...values,eventTitle:text},r.schemas);assert.equal(text.length,37);
});
test('rendered customer content is escaped and native size is deterministic',()=>{
  const html=renderDocument({kind:'invitation',theme:'full-colour',size:'5x7',values:{...r.defaults.invitation,host:'<img src=x onerror=alert(1)>'}},r);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('@page{size:127mm 177.8mm'));
  assert.ok(!html.includes('<img src=x'));
});
test('output containment rejects traversal and outside absolute paths',()=>{
  assert.throws(()=>contained(PRODUCT_ROOT,'../006-minimalist-budget-and-goals-planner/file'));
  assert.throws(()=>contained(PRODUCT_ROOT,'C:/Windows/outside'));
});
test('every actual proof glyph exists in the new bundled font families',async()=>{
  const utility=fontkit.create(await readFile(join(PRODUCT_ROOT,'fonts/SourceSans3-Regular.otf')));
  const display=fontkit.create(await readFile(join(PRODUCT_ROOT,'fonts/BodoniModa-Regular.ttf')));
  for(const kind of ['invitation','welcome'])for(const scenario of ['default','maximum','us','special']){
    const values=fixtureValues(r.schemas,kind,scenario,r.defaults);
    for(const [key,text] of Object.entries(values))for(const character of text){
      if(/\s/.test(character))continue;
      assert.ok((key==='eventTitle'||key==='dressCode'||key==='motto'?display:utility).hasGlyphForCodePoint(character.codePointAt(0)),`${key}: ${character}`);
    }
  }
});
test('product source has no legacy visual imports, runtime AI, Telegram or Etsy calls',async()=>{
  async function walk(path){const files=[];for(const e of await readdir(path,{withFileTypes:true}))e.isDirectory()?files.push(...await walk(join(path,e.name))):files.push(join(path,e.name));return files;}
  for(const path of await walk(join(PRODUCT_ROOT,'src'))){const text=await readFile(path,'utf8');assert.doesNotMatch(text,/(?:from|import\()\s*['"][^'"]*(?:marketing\/src|spreadsheet|design\/brand|products\/00[156]|services\/)/);assert.doesNotMatch(text,/api\.(?:anthropic|openai)\.com|api\.telegram\.org|api\.etsy\.com/);}
});
