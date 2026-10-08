import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import {loadStationeryResources,reviewPath,artworkMasks} from './resources.mjs';
import {renderStationery} from './document.mjs';
import {probeDocument} from './preflight.mjs';
const resources=await loadStationeryResources(),checks=[];
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage();
  await page.addInitScript({content:`window.probeDocument=${probeDocument.toString()}`});
  for(const id of ['S01','S03','S11','S14','S15','S18']){
    await page.setContent(renderStationery({id},resources));
    await page.addScriptTag({content:`window.probeDocument=${probeDocument.toString()}`});
    const probe=()=>page.evaluate(({catalogue,masks})=>window.probeDocument(document,catalogue,masks),{catalogue:resources.catalogue,masks:artworkMasks(resources)});
    const normal=await probe();if(normal.issues.length)throw Error(`${id}: default rejected`);
    const original=await page.locator('.field').first().getAttribute('style');
    await page.locator('.field').first().evaluate(el=>el.style.fontSize='8.5pt');
    const rejected=await probe();if(!rejected.issues.some(i=>i.startsWith('Text is too small:')))throw Error(`${id}: type minimum is ineffective`);
    await page.locator('.field').first().evaluate((el,original)=>original===null?el.removeAttribute('style'):el.setAttribute('style',original),original);
    if((await probe()).issues.length)throw Error('Typography recovery failed');
    checks.push({id,defaultPass:true,belowCategoryMinimumRejected:true,recoveryPass:true});
  }
}finally{await browser.close();}
await writeFile(reviewPath('reports/typography-qc.json'),JSON.stringify({status:'PASS',checks,captionMinimumPt:9,policy:'Fixed category-specific print floors; overflow rejected without truncating wording.'},null,2));
console.log('Six category-floor mutation and recovery checks passed.');
