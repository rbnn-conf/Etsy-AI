// Regression: the Telegram pattern review printed "1.5 mm (US US 8 steel)" for
// an approved hook value that already names the US system. It now shares the
// documents' hook rule (production/src/crochet/hook.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewDocument } from '../src/telegram/crochet.mjs';
import { crochetBundle } from '../../production/test/crochet-fixture.mjs';

test('pattern review document: hook values are printed once, as approved',()=>{
  const b=crochetBundle({patterns:2});
  b.patterns[0].hook_size={mm:1.5,us:'US 8 steel'};
  b.patterns[1].hook_size={mm:3,us:'D-3'};
  const text=reviewDocument(b,{validation:{ok:true,errors:[]}});
  assert.match(text,/Hook: 1\.5 mm \(US 8 steel\)/);
  assert.match(text,/Hook: 3 mm \(US D-3\)/,'a value without the prefix still gains it');
  assert.doesNotMatch(text,/US US/);
});
