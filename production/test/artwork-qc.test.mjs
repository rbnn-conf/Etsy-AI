// Deterministic colouring-page QC shared by Stage 1 (creative QC) and Stage 2
// (the approved-book handoff). Synthetic line art only: no model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sharp } from '../src/lib.mjs';
import { inspectArtwork, pageProblems, bookArtworkQc, bookPagesDigest, bookContactSheet, PAGE_ID, LIMITS } from '../src/artwork-qc.mjs';
import { ADAPTERS } from '../src/index.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
async function page(seed,{w=600,h=900,blank=false,colour=false,clip=false,grey=false}={}){
  const shapes=Array.from({length:8},(_,i)=>`<circle cx="${120+((seed*37+i*61)%360)}" cy="${140+((seed*53+i*97)%620)}" r="${25+i*4}" fill="${colour?'#d02020':grey?'#888':'none'}" stroke="#111" stroke-width="5"/>`).join('');
  const art=blank?'':`<rect x="40" y="40" width="${w-80}" height="${h-80}" fill="none" stroke="#111" stroke-width="6"/>${shapes}${clip?`<rect width="${w}" height="${h}" fill="none" stroke="#000" stroke-width="30"/>`:''}`;
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#fff"/>${art}</svg>`)).png().toBuffer();
}
const expected={count:4,width:600,height:900,orientation:'portrait'};
const manifest=n=>({pages:Array.from({length:n},(_,i)=>({page_id:PAGE_ID(i+1),page_number:i+1,title:`Page ${i+1}`}))});
const entries=async list=>Promise.all(list.map(async([n,b])=>({page_id:PAGE_ID(n),page_number:n,bytes:b,sha256:b?sha(b):null})));

test('a clean book passes every check, with a fingerprint equal to the approval digest',async()=>{
  const pages=await entries(await Promise.all([1,2,3,4].map(async n=>[n,await page(n)])));
  const qc=await bookArtworkQc({manifest:manifest(4),pages,expected});
  assert.equal(qc.passed,true,JSON.stringify(qc.checks.filter(c=>!c.ok)));
  assert.equal(qc.fingerprint,bookPagesDigest(pages));
  assert.deepEqual(Object.values(qc.pages).map(p=>p.status),['ok','ok','ok','ok']);
});

test('each failure is named per page: missing, blank, duplicate, colour, clipping, wrong size',async()=>{
  const p1=await page(1);
  const pages=await entries([[1,p1],[2,await page(2,{blank:true})],[3,await sharp(p1).png({compressionLevel:1}).toBuffer()],[4,await page(4,{colour:true})],[5,await page(5,{clip:true})],[6,await page(6,{w:900,h:600})],[7,null]]);
  const qc=await bookArtworkQc({manifest:manifest(7),pages,expected:{...expected,count:7}});
  assert.equal(qc.passed,false);
  const failed=Object.fromEntries(qc.checks.filter(c=>!c.ok).map(c=>[c.name,c.detail]));
  assert.equal(failed['all page files present'],'missing P007');
  assert.match(failed['no blank pages'],/P002 is blank/);
  assert.match(failed['no exact duplicates'],/P003 duplicates P001/,'same pixels, different bytes');
  assert.match(failed['black-and-white colouring-page characteristics'],/P004 contains colour/);
  assert.match(failed['safe margins: no clipping at the page edges'],/P005 artwork runs off the page edge/);
  assert.match(failed['expected dimensions and orientation'],/P006 is 900x600 px, expected 600x900.*P006 is landscape, the book is portrait/);
});

test('warnings never fail QC: grey shading and style drift from the approved proofs',async()=>{
  const g=await inspectArtwork(await page(1,{grey:true}));
  const {fails,warns}=pageProblems({...g,grey:LIMITS.greyWarn+0.05});
  assert.deepEqual(fails,[]);assert.match(warns.join(),/grey tonal shading/);
  const pages=await entries(await Promise.all([1,2,3,4].map(async n=>[n,await page(n)])));
  const ref=[{ink:0.5}];   // proofs far denser than these pages
  const qc=await bookArtworkQc({manifest:manifest(4),pages,expected,reference:ref});
  assert.equal(qc.passed,true);assert.ok(qc.warnings.some(w=>/linework density differs from the approved style proofs/.test(w)));
});

test('contact sheet: labelled grid readable on a phone',async()=>{
  const list=await Promise.all([1,2,3,4,5,6,7,8].map(async n=>({page_id:PAGE_ID(n),title:`Page ${n}`,bytes:await page(n),status:n===3?'fail':'ok'})));
  const m=await sharp(await bookContactSheet(list,{title:'#001 · pages 1–8'})).metadata();
  assert.equal(m.width,4*360+5*18);assert.ok(m.height>2*540);
});

test('contract: the colouring-book adapter takes its artwork from the approved full book',()=>{
  assert.equal(ADAPTERS['colouring-book'].artwork,'full-book');
  assert.equal(ADAPTERS['greeting-card'].artwork,undefined,'greeting cards keep the style-proof assets');
});
