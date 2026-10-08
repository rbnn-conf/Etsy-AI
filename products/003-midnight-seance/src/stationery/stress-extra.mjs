import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import {loadStationeryResources,reviewPath,artworkMasks} from './resources.mjs';
import {startRenderServer} from './local-server.mjs';
import {renderStationery} from './document.mjs';
import {probeDocument} from './preflight.mjs';
const resources=await loadStationeryResources(),server=await startRenderServer(resources),checks=[];
resources.fonts=resources.fontEvidence.map(f=>`@font-face{font-family:'${f.family}';src:url(${server.origin}/fonts/${f.file});font-style:${f.style};font-weight:${f.weight};${f.family==='Bodoni Moda'?'ascent-override:95%;descent-override:25%;line-gap-override:0%;':''}}`).join('');
for(const a of resources.artworkManifest.assets)resources.artwork[a.treatment][a.id].src=`${server.origin}/artwork/${a.file}`;
const browser=await chromium.launch({headless:true});
try{
  for(const item of resources.inventory.pages)for(const theme of resources.inventory.treatments)for(const scenario of ['maximum-wide','default','maximum']){
    const values=structuredClone(resources.stationeryDefaults[item.id]);
    if(scenario==='maximum-wide')for(const [key,rule] of Object.entries(resources.stationerySchemas[item.id]))values[key]=rule.maxEntry?Array.from({length:rule.maxLines},()=> 'W'.repeat(rule.maxEntry)).join('\n'):'W'.repeat(rule.max);
    if(scenario==='maximum')for(const [key,rule] of Object.entries(resources.stationerySchemas[item.id]))values[key]=rule.maxEntry?Array.from({length:rule.maxLines},()=>('Alexandra Beatrice Laurent ').repeat(2).slice(0,rule.maxEntry)).join('\n'):('Velvet midnight garden ').repeat(Math.ceil(rule.max/23)).slice(0,rule.max);
    const page=await browser.newPage();await page.goto(server.origin);await page.setContent(renderStationery({id:item.id,theme,format:item.formats[0],values},resources));
    const probe=await page.evaluate(`(${probeDocument.toString()})(document,${JSON.stringify(resources.catalogue)},${JSON.stringify(artworkMasks(resources))})`);
    if(scenario!=='maximum-wide'&&probe.issues.length)throw Error(JSON.stringify({id:item.id,theme,scenario,issues:probe.issues}));
    let collisions=[];
    if(!probe.issues.length)collisions=await page.evaluate(()=>{
      const results=[];
      for(const root of document.querySelectorAll('.design')){
        const words=[];
        for(const field of root.querySelectorAll('.field')){
          if(!field.firstChild||field.firstChild.nodeType!==Node.TEXT_NODE)continue;
          for(const match of field.textContent.matchAll(/\S+/gu)){
            const range=document.createRange();range.setStart(field.firstChild,match.index);range.setEnd(field.firstChild,match.index+match[0].length);
            for(const r of range.getClientRects())words.push({label:field.dataset.field,r});
          }
        }
        for(const image of root.querySelectorAll('img[data-artwork-id]')){
          const r=image.getBoundingClientRect();if(r.width<1||r.height<1)continue;
          const intersect=words.filter(({r:q})=>q.left<r.right&&q.right>r.left&&q.top<r.bottom&&q.bottom>r.top);if(!intersect.length)continue;
          const canvas=document.createElement('canvas');canvas.width=Math.ceil(r.width*2);canvas.height=Math.ceil(r.height*2);const ctx=canvas.getContext('2d');
          const scale=Math.min(image.clientWidth/image.naturalWidth,image.clientHeight/image.naturalHeight);
          const angle=Math.atan2(new DOMMatrix(getComputedStyle(image).transform).b,new DOMMatrix(getComputedStyle(image).transform).a);
          ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(angle);ctx.drawImage(image,-image.naturalWidth*scale,-image.naturalHeight*scale,image.naturalWidth*scale*2,image.naturalHeight*scale*2);
          const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
          for(const word of intersect){
            const x0=Math.max(0,Math.floor((word.r.left-r.left)*2)),x1=Math.min(canvas.width,Math.ceil((word.r.right-r.left)*2)),y0=Math.max(0,Math.floor((word.r.top-r.top)*2)),y1=Math.min(canvas.height,Math.ceil((word.r.bottom-r.top)*2));
            let occupied=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(pixels[(y*canvas.width+x)*4+3]>100)occupied++;
            if(occupied>4&&occupied/((x1-x0)*(y1-y0))>.02)results.push({master:root.dataset.master,field:word.label,asset:image.dataset.artworkId,occupied});
          }
        }
      }
      return results;
    });
    if(collisions.length){await page.screenshot({path:reviewPath('reports',`${item.id}-${theme}-${scenario}-clearance.png`),fullPage:true});}
    checks.push({id:item.id,theme,scenario,result:probe.issues.length?'REJECTED_BY_FIT_CHECK':'FITS',issues:probe.issues,artworkClearance:collisions});
    await page.close();console.log(`${item.id}/${theme}/${scenario}: ${checks.at(-1).result}; clearance warnings ${collisions.length}`);
  }
}finally{await browser.close();await server.close();}
await writeFile(reviewPath('reports','wide-content-and-clearance-qc.json'),JSON.stringify({checks},null,2));
