import { readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TelegramClient } from '../../../services/src/telegram/telegram-client.ts';
import { assert, hash } from './core.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
try {
  assert(process.env.TELEGRAM_NOTIFICATIONS_ENABLED==='true','Telegram disabled; set TELEGRAM_NOTIFICATIONS_ENABLED=true to send review previews.');
  assert(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID,'Telegram token/chat configuration missing.');
  const report=JSON.parse(await readFile(join(root,'qc','build-report.json'),'utf8'));
  const client=new TelegramClient({botToken:process.env.TELEGRAM_BOT_TOKEN});
  const chatId=process.env.TELEGRAM_CHAT_ID;
  if(report.status!=='READY FOR ETSY REVIEW') {
    await client.sendMessage({chatId,text:`PRODUCT #004 QC: NOT READY\n${report.errors.join('\n')}`.slice(0,4000)});
  } else {
    // A successful historical report is insufficient if inputs/outputs changed.
    for(const source of report.sources) assert(hash(await readFile(join(root,'source',source.name)))===source.sha256,'Source changed since QC; rebuild before Telegram review.');
    for(const artifact of report.artifacts) assert(hash(await readFile(join(root,artifact.path)))===artifact.sha256,'Artifact changed since QC; rebuild before Telegram review.');
    await client.sendMessage({chatId,text:await readFile(join(root,'qc','build-report.txt'),'utf8')});
    for(const {path,sha256} of report.reviewAssets) {
      const bytes=await readFile(join(root,path));
      assert(hash(bytes)===sha256,'Review preview changed since QC; rebuild before sending.');
      await client.sendPhoto({chatId,bytes,fileName:path.split('/').at(-1),caption:`Product #004: ${path.split('/').at(-1)}`});
    }
  }
  console.log('Telegram review status/previews sent.');
} catch(e) {console.error(e.message);process.exitCode=1;}
