// Owner review via the existing Telegram client: status text + PNG previews
// only (no PDFs, no ZIPs). Nothing is published to Etsy.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TelegramClient } from '../../../services/src/telegram/telegram-client.ts';
import { hash, assert } from '../../004-cozy-spooky-coloring/src/core.mjs';
import { root, config } from './config.mjs';
try{
  assert(process.env.TELEGRAM_NOTIFICATIONS_ENABLED==='true','Telegram notifications are disabled. Local PNG previews remain available.');
  assert(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_CHAT_ID,'Telegram credentials are not configured. Local PNG previews remain available.');
  const qc=JSON.parse(await readFile(join(root,'qc/production-report.json'),'utf8'));
  assert(qc.status==='AUTOMATED QC PASS','Production QC has not passed');
  const build=JSON.parse(await readFile(join(root,'qc/build-report.json'),'utf8'));
  for(const s of build.sources)assert(hash(await readFile(join(root,'source',s.source)))===s.sha256,'Source changed after QC');
  for(const a of [...build.artifacts,...qc.artifacts])assert(hash(await readFile(join(root,a.path)))===a.sha256,'Artifact changed after QC');
  const visual=await readFile(join(root,'qc/VISUAL_QA.md'),'utf8');
  const blockers=[...visual.matchAll(/^- BLOCKER: (.+)$/gm)].map(m=>m[1]);
  const bundles=qc.bundles.map(b=>`${b.mb} MB`).join(', ');
  const text=[
    `PRODUCT #${config.productId} — ${config.title}`,`(handoff ID #${config.handoffId})`,'',
    'STATUS: automated QC PASS · visual inspection done',
    `30/30 source pages · A4 PDF ${qc.pdfPages.A4}p · US Letter PDF ${qc.pdfPages['US-Letter']}p · 30 PNG pages · guide`,
    `${qc.bundles.length} customer ZIPs: ${bundles}`,
    '10 listing images (2000×2000)','',
    'NOTICES:',
    '• Resolution: PASS WITH NOTICE, ~152 PPI on paper; no 300-DPI claim ("high-quality printable digital files").',
    '• "30 pages" = cover + 28 activities + certificate; cover art says "30 fun activities", listing says 30 pages.',
    '• Mazes P002/P003/P029: please test-solve (not machine-verifiable).',
    '• Licence line (home + own classroom): please confirm.','',
    blockers.length?`RECOMMENDATION: NOT READY\n${blockers.map(b=>'✗ '+b).join('\n')}`:'RECOMMENDATION: READY FOR OWNER ETSY REVIEW',
    '','Nothing published to Etsy. PNG previews follow.'
  ].join('\n');
  const client=new TelegramClient({botToken:process.env.TELEGRAM_BOT_TOKEN});
  const chatId=process.env.TELEGRAM_CHAT_ID;
  const receiptPath=join(root,'qc/telegram-review.json');
  const fingerprint=hash(Buffer.from(JSON.stringify(qc.artifacts)+text));
  const previous=JSON.parse(await readFile(receiptPath,'utf8').catch(()=>'null'));
  const receipt=previous?.fingerprint===fingerprint?previous:{status:'PARTIAL',fingerprint,at:new Date().toISOString(),assets:[]};
  if(!receipt.messageSent){await client.sendMessage({chatId,text});receipt.messageSent=true;await writeFile(receiptPath,JSON.stringify(receipt,null,2));}
  for(const path of qc.telegramPackage){
    if(receipt.assets.includes(path))continue;
    assert(path.endsWith('.png'),'Review sends PNG previews only');
    await client.sendPhoto({chatId,bytes:await readFile(join(root,path)),fileName:path.split('/').at(-1),caption:`#${config.productId} · ${path.split('/').slice(-2).join('/')}`});
    receipt.assets.push(path);await writeFile(receiptPath,JSON.stringify(receipt,null,2));
  }
  receipt.status='SENT';await writeFile(receiptPath,JSON.stringify(receipt,null,2));
  console.log(`Telegram review sent: status + ${receipt.assets.length} PNG previews.`);
}catch(error){
  // Never log network error text that could include the bot-token URL.
  const safe=/^(Telegram notifications|Telegram credentials|Production QC|Source changed|Artifact changed|Review sends)/.test(error.message);
  console.error(safe?error.message:'Telegram review could not complete; local previews remain available. Credentials were not logged.');
  process.exitCode=1;
}
