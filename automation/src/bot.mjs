// Stage 1 creative orchestrator — long-polling Telegram bot.
//   npm --prefix automation start               # run until Ctrl-C
//   npm --prefix automation run check-config    # validate configuration only
// Uses its own bot token (AUTOMATION_TELEGRAM_BOT_TOKEN) so it never competes
// with the production review bot for updates.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TelegramClient, TelegramApiError } from '../../services/src/telegram/telegram-client.ts';
import { isTelegramActorAuthorized } from '../../services/src/config/env.ts';
import { existsSync } from 'node:fs';
import { loadAutomationConfig, configProblems, authConfig, loadReservedIds, imageQualities, repoRoot } from './config.mjs';
import { loadPricing, CostLedger } from './costs/index.mjs';
import { createLogger, describeError } from './log.mjs';
import { OpenAIClient } from './openai/client.mjs';
import { ProductStore, Registry } from './orchestrator/store.mjs';
import { Workflow } from './orchestrator/workflow.mjs';
import { OwnerStatus } from './orchestrator/owner-status.mjs';
import { validationDiagnostic } from './orchestrator/page-rules.mjs';

const config=loadAutomationConfig();
const log=createLogger({secrets:[config.telegram.botToken,config.telegram.reviewBotToken,config.openai.apiKey]});
const store=new ProductStore({productsDir:config.productsDir,reservedIds:await loadReservedIds()});
log(`Next product ID: ${await store.nextProductId()} (products in ${config.productsDir}).`);
for(const line of await validationDiagnostic())log(line);
const problems=configProblems(config);
if(problems.length){for(const p of problems)log(`CONFIG: ${p}`);process.exit(1);}
if(config.telegram.botToken===config.telegram.reviewBotToken)log('WARNING: AUTOMATION_TELEGRAM_BOT_TOKEN equals TELEGRAM_BOT_TOKEN. Never run another poller on that token.');
if(config.openai.legacyImageSize)log('WARNING: OPENAI_IMAGE_SIZE is ignored. The proof size now follows each product\'s orientation (see automation/docs/STAGE_1_README.md).');
if(!config.telegram.allowedUserIds.length)log('WARNING: no allowed-user list; anyone in the configured chat can drive Stage 1.');
log(`Image settings: model ${config.openai.imageModel}; concept previews quality ${imageQualities(config).preview} (3 images per concept batch, max ${config.maxConceptBatches} batches); creative proofs quality ${imageQualities(config).proof} (3 images per attempt).`);
if(process.argv.includes('--check-config')){log('Configuration OK.');process.exit(0);}

/** Existing products, for the ideation prompt (avoid near-duplicates). */
async function catalogue(){
  const out=[];
  for(const d of (await readdir(config.productsDir,{withFileTypes:true})).filter(d=>d.isDirectory()&&/^\d{3}-/.test(d.name))){
    const json=await readFile(join(config.productsDir,d.name,'product.json'),'utf8').then(JSON.parse).catch(()=>null);
    const readme=await readFile(join(config.productsDir,d.name,'README.md'),'utf8').catch(()=>'');
    const title=json?.name??/^#\s+(.+)$/m.exec(readme)?.[1]??d.name.slice(4).replace(/-/g,' ');
    out.push({id:d.name.slice(0,3),title});
  }
  return out;
}

// OpenAI cost accounting (append-only ledger in the git-ignored state dir). A pricing problem disables
// cost tracking with a log line; it never stops the bot or touches product state.
let costs=null;
try{
  const pricing=loadPricing();
  const ledger=new CostLedger({dir:join(config.stateDir,'costs'),pricing});
  log(`Cost tracking: pricing ${pricing.version}; USD->GBP ${pricing.fx?`${pricing.fx.rate} (${pricing.fx.as_of})`:'NOT CONFIGURED (GBP values will be unpriced)'}; tracked since ${ledger.trackingStartedAt()}.`);
  costs={ledger,pricing};
}catch(err){log(`Cost tracking disabled: ${describeError(err)}`);}
// Etsy "connected" for the status screen: the encrypted token file exists (local check, no API call).
const etsyTokenFile=process.env.ETSY_TOKEN_FILE?.trim()||join(process.env.ETSY_STATE_DIR?.trim()||join(repoRoot,'services','.secrets','etsy'),'token.enc.json');
const telegram=new TelegramClient({botToken:config.telegram.botToken});
const registry=new Registry({stateDir:config.stateDir});
// Owner status / progress messages and the one reminder per waiting state (presentation only; state/owner-status.json).
const ownerStatus=new OwnerStatus({telegram,stateDir:config.stateDir,log});
const workflow=new Workflow({
  store,registry,telegram,
  ai:{client:new OpenAIClient({apiKey:config.openai.apiKey,baseUrl:config.openai.baseUrl}),textModel:config.openai.textModel,
    imageModel:config.openai.imageModel,imageQuality:imageQualities(config).proof,previewQuality:imageQualities(config).preview},
  auth:(chatId,userId)=>isTelegramActorAuthorized(authConfig(config),{chatId,userId}),
  maxReferences:config.maxReferences,maxConceptBatches:config.maxConceptBatches,marketingScenes:config.marketingScenes,catalogue,log,
  // Stage 4. The live Etsy client is loaded only when real draft writes are explicitly enabled.
  stage4:{config:config.etsy,connected:()=>existsSync(etsyTokenFile),
    liveClient:config.etsy.mode==='live'?async()=>(await import('./stage4/etsy-live.mjs')).createLiveEtsy({shopId:config.etsy.shopId}):undefined},
  costs,ownerStatus
});
log(`Stage 4 (Etsy): ${config.etsy.mode==='live'?'LIVE draft writes enabled':config.etsy.mode==='dry-run'?'DRY RUN (no Etsy requests)':'BLOCKED (dry run off, draft writes not enabled)'}; publishing ${config.etsy.publishEnabled?'ENABLED (still needs PUBLISH + CONFIRM PUBLISH)':'disabled'}.`);

// Native "/" command menu (owner-facing commands only). A failure is logged and never stops the bot.
const registered=await workflow.registerCommands();
log(`Telegram command menu: ${registered.outcome}${registered.count?` (${registered.count} commands)`:''}.`);

const recovered=await workflow.recover();
if(recovered.length)log(`recovered interrupted products: ${recovered.join(', ')}`);

// Elapsed-time refresh and owner reminders. Runs beside the poll loop (which awaits long steps); it only
// reads products and edits/sends status messages, never starts or retries work. A failure is logged only.
const statusTimer=setInterval(()=>{workflow.statusTick().catch(err=>log(`owner status tick: ${describeError(err)}`));},15_000);
statusTimer.unref();

let running=true;
process.on('SIGINT',()=>{log('stopping after the current update…');running=false;});
log(`Stage 1 bot up. Chat ${config.telegram.chatId}. Products in ${config.productsDir}.`);
while(running){
  let updates=[];
  const {telegram_offset:offset}=await registry.read();
  try{updates=await telegram.getUpdates({offset:offset??undefined,timeoutSeconds:25});}
  catch(err){
    if(err instanceof TelegramApiError&&err.status===409){log('Telegram 409: another process is polling this bot token. Stop it or use a separate AUTOMATION_TELEGRAM_BOT_TOKEN.');process.exit(1);}
    log(`getUpdates failed: ${describeError(err)}; retrying in 5 s`);await new Promise(r=>setTimeout(r,5000));continue;
  }
  for(const u of updates){
    // Persist the offset BEFORE handling: a crash mid-step is recovered via
    // product state (recover()), never by replaying a button press.
    await registry.update(r=>{r.telegram_offset=u.update_id+1;});
    const result=await workflow.handleUpdate(u);
    log(`update ${u.update_id}: ${result.outcome}${result.productId?` #${result.productId}`:''}`);
  }
}
