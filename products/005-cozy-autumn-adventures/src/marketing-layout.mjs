import {createRequire} from 'node:module';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {root} from './config.mjs';
const require=createRequire(new URL('../../../marketing/package.json',import.meta.url));
const {chromium}=require('playwright');
const browser=await chromium.launch();
const results=[];
try{
 for(const name of (await readdir(join(root,'listing/html'))).filter(n=>n.endsWith('.html'))){
  const page=await browser.newPage({viewport:{width:2000,height:2000}});
  await page.route('http://**',r=>r.abort());await page.route('https://**',r=>r.abort());
  await page.setContent(await readFile(join(root,'listing/html',name),'utf8'));
  await page.evaluate(()=>document.fonts.ready);
  const errors=await page.evaluate(()=>{
   const errors=[];
   const intersects=(a,b)=>a.left<b.right-2&&a.right>b.left+2&&a.top<b.bottom-2&&a.bottom>b.top+2;
   const blocks=[...document.querySelectorAll('.pos')].filter(el=>!el.matches('.rule,.pencil'));
   const texts=blocks.filter(el=>!el.matches('.art,.paper'));
   for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++)if(intersects(texts[i].getBoundingClientRect(),texts[j].getBoundingClientRect()))errors.push(`Text overlap: ${texts[i].textContent} / ${texts[j].textContent}`);
   for(const img of document.images)if(!img.complete||!img.naturalWidth)errors.push('Image failed to load');
   const footer=document.querySelector('.footer').getBoundingClientRect();
   for(const el of blocks)if(intersects(el.getBoundingClientRect(),footer))errors.push('Footer overlap: '+(el.textContent||el.querySelector('img')?.alt));
   if(!document.fonts.check('600 140px Spectral')||!document.fonts.check('400 42px Inter'))errors.push('Font missing');
   return errors;
  });
  results.push({name,errors});await page.close();
 }
}finally{await browser.close();}
await writeFile(join(root,'qc/marketing-layout.json'),JSON.stringify(results,null,2));
if(results.some(r=>r.errors.length)){console.error(JSON.stringify(results.filter(r=>r.errors.length)));process.exitCode=1;}
else console.log('10/10 marketing text-overlap, footer clearance, image and font checks PASS.');
