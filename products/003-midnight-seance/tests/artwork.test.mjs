import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
const root=new URL('../artwork/',import.meta.url);
const hash=b=>createHash('sha256').update(b).digest('hex');
test('complete original library has 35 independently generated pairs and hash-bound individual inspection',async()=>{
 const {assets}=JSON.parse(await readFile(new URL('records/measured-assets.json',root)));
 const inspections=JSON.parse(await readFile(new URL('records/visual-inspections.json',root))).assets;
 const accepted=JSON.parse(await readFile(new URL('records/asset-manifest.json',root))).assets;
 assert.equal(accepted.length,70);
 assert.equal(assets.length,70);assert.equal(new Set(assets.map(a=>a.id)).size,35);
 for(const a of assets){assert.equal(assets.filter(b=>b.id===a.id).length,2);assert.equal(a.visualQc,'pass');assert.ok(inspections.some(v=>v.id===a.id&&v.treatment===a.treatment&&v.sourceSha256===a.sourceSha256&&v.productionSha256===a.sha256));const record=accepted.find(v=>v.id===a.id&&v.treatment===a.treatment);assert.equal(record.sourceSha256,a.sourceSha256);assert.equal(record.sha256,a.sha256);assert.ok(record.acceptedGeneration.prompt.length>100);assert.match(record.acceptedGeneration.toolPath,/generated_images/);}
 for(const id of new Set(assets.map(a=>a.id))){const pair=assets.filter(a=>a.id===id);assert.notEqual(pair[0].sourceSha256,pair[1].sourceSha256);}
});
test('native production files retain source pixels, real alpha, uncropped bounds and print resolution',async()=>{
 const {assets}=JSON.parse(await readFile(new URL('records/measured-assets.json',root)));
 for(const a of assets){const source=await readFile(new URL(a.source,root)),production=await readFile(new URL(a.file,root));assert.equal(hash(source),a.sourceSha256);assert.equal(hash(production),a.sha256);assert.equal(a.edgeOpaque,0);assert.ok(a.transparentFraction>.08);assert.ok(a.effectivePpiAtMaxBox>=300);const {data,info}=await sharp(production).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.deepEqual([info.width,info.height],a.pixels);for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(x<20||y<20||x>=info.width-20||y>=info.height-20)assert.equal(data[(y*info.width+x)*4+3],0);}
});
test('economy assets have neutral ink rather than colour art relabelled economy',async()=>{
 const {assets}=JSON.parse(await readFile(new URL('records/measured-assets.json',root)));
 for(const a of assets.filter(a=>a.treatment==='economy')){const {data}=await sharp(fileURLToPath(new URL(a.source,root))).ensureAlpha().raw().toBuffer({resolveWithObject:true});let total=0,coloured=0;for(let i=0;i<data.length;i+=4)if(data[i+3]>200){total++;if(Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])>15)coloured++;}assert.ok(coloured/total<.01,`${a.id} contains visible colour`);}
});
