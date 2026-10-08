import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import {readFile,writeFile} from 'node:fs/promises';
import {loadStationeryResources,reviewPath} from './resources.mjs';
import {regionalFixture} from './content.mjs';
const resources=await loadStationeryResources(),checks=[];
const editor=reviewPath('editable/midnight-seance-stationery-editor.html');
for(const channel of [undefined,'msedge']){
  const browser=await chromium.launch({headless:true,...(channel?{channel}:{})});
  try{
    for(const item of resources.inventory.pages){
      const page=await browser.newPage(),external=[],errors=[];
      await page.route(/https?:\/\//,route=>{external.push(route.request().url());route.abort();});page.on('pageerror',e=>errors.push(e.message));
      await page.goto(pathToFileURL(editor).href);await page.selectOption('#item',item.id);await page.waitForFunction(()=>window.stationeryReady(),{},{timeout:30000});
      const first=Object.keys(resources.stationerySchemas[item.id])[0],expected=structuredClone(resources.stationeryDefaults[item.id]);
      await page.locator(`[data-key="${first}"]`).focus();await page.keyboard.press('Tab');
      const focused=await page.evaluate(()=>document.activeElement.tagName);if(!['TEXTAREA','BUTTON'].includes(focused))throw Error(`${item.id}: keyboard focus skipped editing controls`);
      await page.locator(`[data-key="${first}"]`).fill('W'.repeat(resources.stationerySchemas[item.id][first].max+1));
      if(!await page.locator('#print').isDisabled())throw Error(`${item.id}: invalid content left print enabled`);
      await page.click('#reset');await page.waitForFunction(()=>window.stationeryReady());
      const downloadPromise=page.waitForEvent('download');await page.click('#save');const download=await downloadPromise;
      const savedPath=reviewPath('reports',`${item.id}-${channel??'chromium'}-wording.json`);await download.saveAs(savedPath);
      const saved=JSON.parse(await readFile(savedPath,'utf8'));if(JSON.stringify(saved.values)!==JSON.stringify(expected))throw Error(`${item.id}: saved wording changed`);
      saved.values=regionalFixture(resources.stationeryDefaults,item.id,'us');saved.theme='economy';saved.format='us-letter';
      await page.locator('#load').setInputFiles({name:'my-wording.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
      await page.waitForFunction(expected=>window.stationeryReady()&&window.stationeryState.theme==='economy'&&window.stationeryState.format==='us-letter'&&JSON.stringify(window.stationeryState.values)===expected,JSON.stringify(saved.values));
      // Check rejection of unsupported input and corrupted saved files, without clearing valid wording.
      await page.locator(`[data-key="${first}"]`).fill('🦇');if(!await page.locator('#print').isDisabled())throw Error('Unsupported input was printable');
      await page.click('#reset');await page.waitForFunction(()=>window.stationeryReady());
      await page.locator('#load').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{')});
      await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Could not load')&&document.getElementById('print').disabled);
      await page.click('#reset');await page.waitForFunction(()=>window.stationeryReady());
      if(external.length||errors.length)throw Error(JSON.stringify({id:item.id,external,errors}));
      checks.push({id:item.id,browser:channel??'chromium',version:browser.version(),offline:true,keyboard:true,save:true,load:true,reset:true,overflowRejected:true,unsupportedRejected:true,corruptFileRejected:true,economyLetterRegionalFixture:true});
      await page.close();console.log(`Editor PASS ${channel??'chromium'} ${item.id}`);
    }
  }finally{await browser.close();}
}
await writeFile(reviewPath('reports','editor-browser-qc.json'),JSON.stringify({status:'PASS',checks},null,2));
