import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {impose,trimSegments} from '../src/stationery/imposition.mjs';
const inventory=JSON.parse(await readFile(new URL('../content/prompt-04-inventory.json',import.meta.url)));

test('Prompt 4 reconciles exactly eighteen approved stationery masters',()=>{
  assert.deepEqual(inventory.pages.map(p=>p.id),Array.from({length:18},(_,i)=>`S${String(i+1).padStart(2,'0')}`));
  assert.equal(inventory.pages.filter(p=>p.digital).length,1);
  assert.equal(inventory.pages.find(p=>p.id==='S15').designCount,6);
  assert.equal(inventory.pages.find(p=>p.id==='S14').foldAtMm,50.8);
  assert.deepEqual(inventory.pages.find(p=>p.id==='S17').formats,['a4','us-letter']);
  for(const [ids,inchSize] of [
    [['S01','S09','S10','S11','S12'],[5,7]],
    [['S02','S18'],[4,6]],
    [['S03','S04','S05','S06','S07','S08'],[8,10]],
    [['S13'],[3.5,2]],[['S14'],[3.5,4]],[['S15'],[3,2]],[['S16'],[2,3.5]]
  ])for(const id of ids){
    const measured=inventory.pages.find(p=>p.id===id).nativeMm;
    measured.forEach((mm,i)=>assert.ok(Math.abs(mm-inchSize[i]*25.4)<1e-8,`${id}: finished inch dimensions`));
  }
});

test('Multi-up cards retain finished dimensions, safe margins and gaps on both carriers',()=>{
  for(const paper of Object.values(inventory.carrierSizesMm)) for(const item of inventory.pages.filter(p=>p.multiUp)) {
    const sheets=impose({paper,finished:item.nativeMm,count:17});
    assert.equal(sheets.flatMap(s=>s.placements).length,17);
    for(const sheet of sheets) for(const p of sheet.placements) {
      assert.deepEqual([p.widthMm,p.heightMm],item.nativeMm);
      assert.ok(p.xMm>=10-1e-8 && p.yMm>=10-1e-8);
      assert.ok(p.xMm+p.widthMm<=paper[0]-10+1e-8);
      assert.ok(p.yMm+p.heightMm<=paper[1]-10+1e-8);
      for(const q of sheet.placements.filter(q=>q.item!==p.item))
        assert.ok(p.xMm+p.widthMm+4<=q.xMm+1e-8 || q.xMm+q.widthMm+4<=p.xMm+1e-8 ||
          p.yMm+p.heightMm+4<=q.yMm+1e-8 || q.yMm+q.heightMm+4<=p.yMm+1e-8);
      for(const [x1,y1,x2,y2] of trimSegments(p))
        assert.ok((x1===x2 && (y1<=p.yMm || y1>=p.yMm+p.heightMm) && (y2<=p.yMm || y2>=p.yMm+p.heightMm)) ||
          (y1===y2 && (x1<=p.xMm || x1>=p.xMm+p.widthMm) && (x2<=p.xMm || x2>=p.xMm+p.widthMm)));
    }
  }
});

test('Oversized signs require reflow rather than shrinking; invalid geometry is rejected',()=>{
  assert.throws(()=>impose({paper:[210,297],finished:[203.2,254],count:1}),/reflowed/);
  assert.throws(()=>impose({paper:[210,297],finished:[88.9,50.8],count:0}),/Invalid/);
});
