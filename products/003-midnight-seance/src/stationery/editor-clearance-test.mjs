import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {reviewPath} from './resources.mjs';
const checks=[];
for(const channel of [undefined,'msedge']){
  const browser=await chromium.launch({headless:true,...(channel?{channel}:{})});
  try{
    const page=await browser.newPage();await page.goto(pathToFileURL(reviewPath('editable/midnight-seance-stationery-editor.html')).href);
    await page.selectOption('#item','S03');await page.waitForFunction(()=>window.stationeryReady());
    for(const [key,max] of Object.entries({eventTitle:48,host:64,subtitle:80,motto:80}))await page.locator(`[data-key=${key}]`).fill('W'.repeat(max));
    await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Shorten the wording'));
    const message=await page.locator('#status').textContent();
    if(!await page.locator('#print').isDisabled()||!message.includes('touches decoration')||/A0[1-9]|Text outside|host \/|artworkId/.test(message))throw Error(`Unclear or ineffective decoration fit rejection: ${message}`);
    await page.click('#reset');await page.waitForFunction(()=>window.stationeryReady());
    await page.locator('[data-key=host]').fill('Amélie & Eva-Marie');await page.waitForFunction(()=>window.stationeryReady());
    checks.push({browser:channel??'chromium',wideHostDecorationOverlapBlocked:true,customerFacingMessage:message,accentedHostRecovery:true});
  }finally{await browser.close();}
}
await writeFile(reviewPath('reports/editor-clearance-qc.json'),JSON.stringify({status:'PASS',checks},null,2));
console.log('Decoration overlap blocked with clear customer wording in both browsers.');
