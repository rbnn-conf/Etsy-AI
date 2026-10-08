import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stationeryDefaults,stationerySchemas,validateStationery,regionalFixture} from '../src/stationery/content.mjs';
const oldDefaults=JSON.parse(await readFile(new URL('../content/stationery.json',import.meta.url)));
const oldSchemas=JSON.parse(await readFile(new URL('../content/editable-fields.json',import.meta.url)));
const defaults={S01:oldDefaults.invitation,S03:oldDefaults.welcome,...stationeryDefaults};
const schemas={S01:oldSchemas.invitation,S03:oldSchemas.welcome,...stationerySchemas};

test('Every stationery master has labelled editable defaults and rejects over-limit content',()=>{
  assert.equal(Object.keys(schemas).length,18);
  for(const [id,values] of Object.entries(defaults)){
    assert.ok(validateStationery(id,values,schemas).valid,id);
    assert.deepEqual(Object.keys(values).sort(),Object.keys(schemas[id]).sort());
    for(const [key,rule] of Object.entries(schemas[id])){
      assert.ok(rule.label&&rule.max>0);
      assert.equal(validateStationery(id,{...values,[key]:'W'.repeat(rule.max+1)},schemas).valid,false);
      assert.equal(validateStationery(id,{...values,[key]:'🦇'},schemas).valid,false);
      if(!rule.required)assert.ok(validateStationery(id,{...values,[key]:''},schemas).valid);
    }
  }
});

test('Names, punctuation and menu line breaks survive customer JSON without truncation',()=>{
  const value={names:'Amélie & Jean-Luc\nChloë O’Neill\nEva-Marie Clark'};
  assert.ok(validateStationery('S13',value,schemas).valid);
  assert.deepEqual(JSON.parse(JSON.stringify(value)),value);
  assert.ok(validateStationery('S11',{...defaults.S11,mainDetail:'Wild mushrooms & thyme\nParmesan served separately'},schemas).valid);
  assert.equal(validateStationery('S11',{...defaults.S11,mainDetail:'One\nTwo\nThree'},schemas).valid,false);
  assert.equal(validateStationery('S13',{names:'A\n'.repeat(13)},schemas).valid,false);
  assert.equal(validateStationery('S13',{names:'A\n\nB'},schemas).valid,false);
});

test('Regional fixtures use explicit UK or US spelling and support long addresses',()=>{
  for(const region of ['uk','us']){
    assert.ok(validateStationery('S01',regionalFixture(defaults,'S01',region),schemas).valid);
    const favor=regionalFixture(defaults,'S08',region);
    assert.ok(validateStationery('S08',favor,schemas).valid);
    assert.ok(favor.message.includes(region==='uk'?'favour':'favor'));
  }
  assert.equal(validateStationery('S01',{...defaults.S01,unexpected:'ignored'},schemas).valid,false);
  assert.equal(validateStationery('S01',null,schemas).valid,false);
});
