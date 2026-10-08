import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Flow, drawPages, addFolios } from '../src/crochet/layout.mjs';
import { loadFonts, PAPERS, TYPE } from '../src/crochet/design.mjs';
import { sourceTextProblems, renderedTextProblems, instructionBoundsProblems, normalText } from '../src/crochet/text-qc.mjs';
import { newPdf, savePdf, fontkit, renderPdf } from '../src/lib.mjs';

const labels=['Preparation','Foundation','Each stamen','Prepare wire'];
const fonts=await loadFonts();
const make=paper=>{const f=new Flow({paper:PAPERS[paper],fonts,running:{left:'Fixture bundle'}});f.newPage('pattern',{pattern_id:'fixture'});
  f.cont=g=>{g.text('Fixture (continued)',{style:TYPE.small});g.space(4);};return f;};
const source=j=>field=>({pattern_id:'fixture',field:`instructions[0].steps[${j}].${field}`});

for(const paper of Object.keys(PAPERS)){
  test(`${paper}: labels wrap, row height grows, near-bottom whole step moves, long step splits without loss`,()=>{
    const f=make(paper);
    labels.forEach((label,i)=>f.instruction({label,text:'Ch 2, then sc in the next stitch. Turn.'},{src:source(i)}));
    const before=f.y;
    f.instruction({label:'Prepare wire for each stamen',text:'Ch 2.'},{src:source(4)});
    assert.ok(before-f.y>TYPE.body.leading*2,'multi-line label grows the whole row');
    const labelOps=f.pages.flatMap(p=>p.ops).filter(o=>o.src?.field==='instructions[0].steps[4].label');
    assert.ok(labelOps.length>1);assert.equal(normalText(labelOps.map(o=>o.text).join(' ')),'Prepare wire for each stamen');
    f.y=f.bottom+TYPE.body.leading+1;
    f.instruction({label:'Foundation',text:'Ch 2, then sc in the next stitch. '.repeat(8),stitch_count:12},{src:source(5)});
    assert.ok(!f.pages[0].ops.some(o=>o.src?.field==='instructions[0].steps[5].text'));
    assert.ok(f.pages[1].ops.some(o=>o.src?.field==='instructions[0].steps[5].text'));
    const long='Rep 7 times: sc in next stitch, then hdc in next stitch. '.repeat(180);
    f.instruction({label:'Each stamen',text:long},{src:source(6)});
    const ops=f.pages.flatMap(p=>p.ops).filter(o=>o.src?.field==='instructions[0].steps[6].text');
    assert.equal(normalText(ops.map(o=>o.text).join(' ')),normalText(long));
    assert.ok(f.pages.filter(p=>p.ops.some(o=>o.src?.field==='instructions[0].steps[6].text')).length>1);
    assert.deepEqual(instructionBoundsProblems(f),[]);
    for(const pg of f.pages)for(const o of pg.ops.filter(o=>o.t==='text')){
      assert.ok(o.width<=o.maxWidth+0.01,o.text);assert.ok(o.y>=f.bottom&&o.y+o.size<=f.top,o.text);
      for(const q of pg.ops.filter(q=>q.t==='text'&&q!==o&&Math.abs(q.y-o.y)<0.5))assert.ok(o.x+o.width<=q.x||q.x+q.width<=o.x,'no column overlap');
    }
    const op=f.pages[0].ops.find(o=>o.src?.field?.endsWith('.text'));
    const saved=op.y;op.y=10;assert.ok(instructionBoundsProblems(f).some(p=>p.includes('overflow')));op.y=saved;
    f.pages[0].ops.push({...op,src:null,text:'Header collision'});
    assert.ok(instructionBoundsProblems(f).some(p=>p.includes('overlaps')));
  });

  test(`${paper}: actual PDF preserves every step and assembly across pages; positioned QC rejects missing, changed or displaced text`,async()=>{
    const f=make(paper), pattern={pattern_id:'fixture',instructions:[{heading:'Fixture instructions',steps:labels.map((label,i)=>({label,text:[
      'Working in the FLO, ch 12, sc in next 2 ch, hdc in next 3 ch, dc in next 3 ch. ',
      'Ch 2, hdc dec over first 2 stitches, hdc in each of the next 3 stitches. Turn. ',
      'Rep 7 times: In the next back bump, sl st, ch 5, sc in 2nd ch from hook. ',
      'Wrap the wire from its join to its tip, covering all exposed wire. '
    ][i].repeat(i===2?160:4)}))}],assembly:['Wrap each branch from its join to its tip, covering all exposed wire.'],finishing:[]};
    f.text(pattern.instructions[0].heading,{src:{pattern_id:'fixture',field:'instructions[0].heading'}});
    pattern.instructions[0].steps.forEach((st,i)=>f.instruction(st,{src:source(i)}));
    f.y=f.bottom+TYPE.body.leading+1;
    f.text(pattern.assembly[0],{width:90,src:{pattern_id:'fixture',field:'assembly[0]'}});
    addFolios(f);
    assert.deepEqual(sourceTextProblems(f,pattern),[]);
    const pdf=await newPdf({title:'Layout fixture',date:new Date(0)});pdf.registerFontkit(fontkit);
    const embedded={};for(const[k,font]of Object.entries(fonts))embedded[k]=await pdf.embedFont(font.bytes,{subset:true});
    drawPages(pdf,f,{fonts:embedded,images:new Map()});
    const dir=await mkdtemp(join(tmpdir(),'crochet-layout-test-'));
    try{
      const path=join(dir,'fixture.pdf');await writeFile(path,await savePdf(pdf));const pages=await renderPdf(path,{dpi:24});
      assert.deepEqual(renderedTextProblems(f,pages),[]);
      assert.ok(!normalText(pages.map(p=>p.text).join(' ')).includes(normalText(pattern.instructions[0].steps[2].text)),'flat extraction is interrupted by page furniture');
      const itemIndex=pages[0].textItems.findIndex(t=>t.text.includes('Working in the FLO'));
      assert.ok(itemIndex>=0);
      for(const mutate of [p=>p[0].textItems.splice(itemIndex,1),p=>{p[0].textItems[itemIndex].text='Wrong instruction';},p=>{p[0].textItems[itemIndex].y-=10;}]){
        const bad=structuredClone(pages);mutate(bad);assert.ok(renderedTextProblems(f,bad).length);
      }
      const bad=structuredClone(pattern);bad.instructions[0].steps[0].text+=' Missing sentence.';
      assert.ok(sourceTextProblems(f,bad).length);
      const op=f.pages[0].ops.find(o=>o.src?.field==='instructions[0].steps[0].text');op.line=99;
      assert.ok(sourceTextProblems(f,pattern).some(p=>p.includes('out of order')));
    }finally{await rm(dir,{recursive:true,force:true});}
  });
}
