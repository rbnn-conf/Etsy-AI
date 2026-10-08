// Load a completed Marketplace Insights research cycle into the bot's SEO state
// and attach it to a product, so the Telegram SEO audit shows it (ADR-036).
// Local files only: no Telegram, no Etsy, no OpenAI. Engine rules only.
//
//   npm --prefix automation run seo:import-cycle -- --product 005 --name "Cozy Autumn Adventures" \
//     --idea ../seo/fixtures/ideas/cozy-autumn-colouring-adults-structured.json \
//     --profile ../seo/fixtures/profiles/cozy-autumn-colouring-adults-structured.json \
//     --capture ../seo/fixtures/research-cycle/cozy-autumn-real/capture-1.json \
//     --capture ../seo/fixtures/research-cycle/cozy-autumn-real/capture-2.json \
//     --finish ../seo/fixtures/research-cycle/cozy-autumn-real/owner-finish.json
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadAutomationConfig } from '../src/config.mjs';
import { SeoState } from '../src/seo/state.mjs';
import { importResearchCycle } from '../src/seo/panel.mjs';

const args=process.argv.slice(2), all=k=>args.flatMap((a,i)=>a===`--${k}`?[args[i+1]]:[]), one=k=>all(k)[0]??null;
const json=async p=>JSON.parse(await readFile(resolve(p),'utf8'));
try{
  const config=loadAutomationConfig();
  const product=one('product'), name=one('name');
  if(!/^\d{3}$/.test(product??'')||!name||!one('idea')||!one('profile')||!all('capture').length)throw new Error('usage: --product NNN --name <name> --idea <file> --profile <file> --capture <file> [--capture <file>…] [--finish <file>]');
  if(!config.telegram.chatId)throw new Error('AUTOMATION_TELEGRAM_CHAT_ID (or TELEGRAM_CHAT_ID) is required: sessions belong to the owner chat');
  const state=new SeoState({stateDir:config.stateDir});
  const existing=await state.sessionForProduct(product);
  if(existing&&existing.status!=='cancelled')throw new Error(`product #${product} already has SEO research (${existing.id}, ${existing.status}); cancel it in Telegram first`);
  // The engine validates the idea and profile when the session is created.
  const r=await importResearchCycle(state,{idea:await json(one('idea')),profile:await json(one('profile')),captures:await Promise.all(all('capture').map(json)),
    finish:one('finish')?await json(one('finish')):null,product_id:product,name,chat_id:config.telegram.chatId});
  console.log(`SEO research ${r.id} attached to #${product}: ${r.readiness}. Open 🔎 SEO → 🏪 Audit Existing Product in Telegram.`);
}catch(e){console.error(`seo:import-cycle: ${e.message}`);process.exitCode=1;}
