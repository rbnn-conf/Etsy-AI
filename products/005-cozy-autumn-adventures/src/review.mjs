import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {TelegramClient} from '../../../services/src/telegram/telegram-client.ts';
import {hash,assert} from '../../004-cozy-spooky-coloring/src/core.mjs';
import {root} from './config.mjs';
try{
 assert(process.env.TELEGRAM_NOTIFICATIONS_ENABLED==='true','Telegram notifications are disabled. Local PNG previews remain available.');
 assert(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_CHAT_ID,'Telegram credentials are not configured. Local PNG previews remain available.');
 const report=JSON.parse(await readFile(join(root,'qc/production-report.json'),'utf8'));
 assert(report.ready===true,'Final production review has not passed');
 const build=JSON.parse(await readFile(join(root,'qc/build-report.json'),'utf8'));
 for(const source of build.sources)assert(hash(await readFile(join(root,'source',source.name)))===source.sha256,'Source changed after QC');
 for(const a of [...build.artifacts,...report.artifacts])assert(hash(await readFile(join(root,a.path)))===a.sha256,'Artifact changed after QC');
 const client=new TelegramClient({botToken:process.env.TELEGRAM_BOT_TOKEN});
 const chatId=process.env.TELEGRAM_CHAT_ID;
 const receiptPath=join(root,'qc/telegram-review.json');
 const fingerprint=hash(Buffer.from(JSON.stringify(report.artifacts)));
 const previous=JSON.parse(await readFile(receiptPath,'utf8').catch(()=>'null'));
 const receipt=previous?.fingerprint===fingerprint?previous:{status:'PARTIAL',fingerprint,at:new Date().toISOString(),assets:[]};
 if(!receipt.messageSent){
  await client.sendMessage({chatId,text:'PRODUCT #005 — Cozy Autumn Adventures\n20/20 approved pages · A4 + US Letter · 40 PNGs · 10 listing images\nAutomated QC and visual inspection PASS. Resolution: PASS WITH NOTICE (180 PPI placement; no 300-DPI claim).\nFive customer ZIPs below 19 MB each. Ready for your Etsy review; nothing published. PNG previews follow.'});
  receipt.messageSent=true;await writeFile(receiptPath,JSON.stringify(receipt,null,2));
 }
 const assets=['qc/A4-pdf-contact-sheet.png','qc/marketing-contact-sheet.png','listing/source-previews/heroes/P001.png','listing/source-previews/heroes/P014.png','output/marketing/01-hero.png','output/marketing/02-whats-included.png','output/marketing/06-paper-sizes.png'];
 for(const path of assets){
  if(receipt.assets.includes(path))continue;
  assert(path.endsWith('.png'),'Review sends PNG previews only');
  await client.sendPhoto({chatId,bytes:await readFile(join(root,path)),fileName:path.split('/').at(-1),caption:`Product #005 · ${path.split('/').at(-1)}`});
  receipt.assets.push(path);await writeFile(receiptPath,JSON.stringify(receipt,null,2));
 }
 receipt.status='SENT';await writeFile(receiptPath,JSON.stringify(receipt,null,2));
 console.log('Telegram review sent: status + seven PNG previews.');
}catch(error){
 // Never log network exception text that might include a bot-token URL.
 const safe=/^(Telegram notifications|Telegram credentials|Final production|Source changed|Artifact changed|Review sends)/.test(error.message);
 console.error(safe?error.message:'Telegram review could not complete; local previews remain available. Credentials were not logged.');
 process.exitCode=1;
}
