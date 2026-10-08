// SCRATCH Stage 3 run on a THROWAWAY COPY of a production-approved product (ADR-060 dry run).
//
//   node --env-file=.env automation/scripts/scratch-marketing-run.mjs --source products/<NNN-slug> --out <scratch dir>          # preflight: FREE
//   node --env-file=.env automation/scripts/scratch-marketing-run.mjs --source products/<NNN-slug> --out <scratch dir> --live   # the paid run
//   ... --resume (with --out of an earlier run): reuse that copy; valid cached assets make zero calls.
//
// Safety, enforced in code (not by convention):
//   - the source is only READ (hashed before and after; any change is reported and the run fails);
//   - the copy lives in --out, which must be outside the repository's products/ folder; product id 901;
//   - no Telegram network (an in-memory stub records what the bot would have sent), no Stage 4 / Etsy object;
//   - the copy has no marketing/ folder, so the run takes the colouring-book Creative Director path;
//   - a hard call budget: at most 2 text + 4 image calls; a 3rd text or 5th image call throws BEFORE it is made;
//   - the run stops where the bot stops: AWAITING_MARKETING_APPROVAL (QC) or FAILED. Nothing is approved or published.
import { cp, mkdir, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { loadAutomationConfig, repoRoot } from '../src/config.mjs';
import { ProductStore, Registry } from '../src/orchestrator/store.mjs';
import { Workflow } from '../src/orchestrator/workflow.mjs';
import { transition } from '../src/orchestrator/state.mjs';
import { deriveFacts, adapterOf, planColouringCreative, deriveStrategy, usesCreativeEnvironment } from '../../marketing/src/stage3/index.mjs';

const BUDGET={text:2,image:4}, ID='901', ACTOR='@scratch';
const arg=k=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:undefined;};
const live=process.argv.includes('--live'), resume=process.argv.includes('--resume');
const say=(...a)=>console.log(...a), fail=m=>{console.error(`STOP: ${m}`);process.exit(1);};
const sha=b=>createHash('sha256').update(b).digest('hex');
async function hashTree(dir){const out={};const walk=async(d)=>{for(const e of await readdir(d,{withFileTypes:true})){const p=join(d,e.name);
  if(e.isDirectory())await walk(p);else out[relative(dir,p)]=sha(await readFile(p));}};await walk(dir);return out;}

const source=resolve(repoRoot,arg('--source')??''), out=resolve(arg('--out')??'');
if(!arg('--source')||!arg('--out'))fail('usage: --source products/<NNN-slug> --out <scratch dir> [--live] [--resume]');
const realProducts=resolve(repoRoot,'products'), inside=(a,b)=>{const r=relative(b,a);return r===''||(!r.startsWith('..')&&!isAbsolute(r));};
if(inside(out,realProducts))fail(`--out must be outside ${realProducts}`);
const product=JSON.parse(await readFile(join(source,'product.json'),'utf8').catch(()=>fail(`no product.json in ${source}`)));
if(!product.production?.approved_at)fail(`${product.product_id} is not production-approved (no production.approved_at; status ${product.status}).`);
const productsDir=join(out,'products'), stateDir=join(out,'state'), ws=`${ID}-scratch-${product.slug??'copy'}`, copy=join(productsDir,ws);

const before=await hashTree(source);
if(!resume){
  if(await stat(out).then(()=>true,()=>false)&&(await readdir(out)).length)fail(`${out} is not empty (use a new folder, or --resume)`);
  await mkdir(productsDir,{recursive:true});await mkdir(stateDir,{recursive:true});
  // Everything except marketing/ (and any Etsy state): Stage 1 + Stage 2 records and files, byte for byte.
  await cp(source,copy,{recursive:true,filter:src=>{const r=relative(source,src).split(/[\\/]/)[0];return r!=='marketing'&&r!=='etsy';}});
  const {marketing,etsy,...rest}=product;
  // product.json keeps the strict product schema; the provenance note lives beside the copy.
  await writeFile(join(copy,'product.json'),JSON.stringify({...rest,product_id:ID,workspace:ws,status:'PRODUCTION_APPROVED',resume_state:null,last_error:null,lock:null},null,2)+'\n');
  await writeFile(join(out,'SCRATCH.json'),JSON.stringify({source:product.product_id,source_dir:source,copy,copied_at:new Date().toISOString(),note:'Throwaway copy for a scratch Stage 3 run. Never publish.'},null,2)+'\n');
}else{
  // A copy made by an earlier version of this script carried a `scratch` field the product schema rejects: drop it (copy only).
  const cp_=JSON.parse(await readFile(join(copy,'product.json'),'utf8'));
  if('scratch' in cp_){const {scratch,...clean}=cp_;await writeFile(join(copy,'product.json'),JSON.stringify(clean,null,2)+'\n');
    await writeFile(join(out,'SCRATCH.json'),JSON.stringify({...scratch,copy},null,2)+'\n');}
}

// Preflight (free): the copy derives the same facts, takes the creative path, and plans exactly the budgeted calls.
const facts=await deriveFacts(copy), ad=adapterOf(facts);
if(facts.product_format!=='colouring-book')fail(`expected a colouring book, got ${facts.product_format}`);
if(!ad.creative?.concept)fail('the colouring-book Creative Director path is not available in this code');
const base=planColouringCreative(facts,{strategy:deriveStrategy(facts)});
const backplates=base.slides.filter(s=>usesCreativeEnvironment(s)&&!s.creative.scene_of).length, examples=base.examples.length;
say(`Copy: ${copy}`);
say(`Facts: ${facts.product_name}, ${facts.book.page_count} pages (${facts.book.colouring_pages} colouring), ${facts.book.orientation}; formats ${facts.formats.map(f=>f.label).join(', ')}.`);
say(`Plan: ${base.slides.length} creative cards; ${backplates} backplates (${base.slides.filter(s=>s.creative.scene_of).map(s=>`${s.id} shares ${s.creative.scene_of}`).join(', ')}); ${examples} coloured example(s).`);
say(`Expected calls: 2 text (listing + Creative Director) + ${backplates+examples} image. Budget: ${BUDGET.text} text + ${BUDGET.image} image.`);
if(backplates+examples>BUDGET.image)fail('the plan would exceed the image budget');
if(!live){say('Preflight only: no OpenAI call was made. Add --live to run.');process.exit(0);}

// LIVE: the real OpenAI client, wrapped in a hard budget. No Telegram network, no Etsy.
const config=loadAutomationConfig();
if(!config.openai.apiKey||!config.openai.textModel||!config.openai.imageModel)fail('OPENAI_API_KEY / OPENAI_TEXT_MODEL / OPENAI_IMAGE_MODEL are not set (run with --env-file=.env)');
const { OpenAIClient }=await import('../src/openai/client.mjs');
const { imageQualities }=await import('../src/config.mjs');
// The budget is CUMULATIVE for this scratch folder: calls already spent by earlier runs (REPORT.json) count.
// --overall-text / --overall-image raise the whole-experiment ceiling only when the owner approved it.
const prior=JSON.parse(await readFile(join(out,'REPORT.json'),'utf8').catch(()=>'null'));
const spent=prior?.total??prior?.used??{text:0,image:0};
const overall={text:Number(arg('--overall-text')??BUDGET.text),image:Number(arg('--overall-image')??BUDGET.image)};
const allow={text:Math.min(BUDGET.text,overall.text-spent.text),image:Math.min(BUDGET.image,overall.image-spent.image)};
say(`Budget: already spent ${spent.text} text + ${spent.image} image; ceiling ${overall.text} text + ${overall.image} image; this run may make ${allow.text} text + ${allow.image} image.`);
if(allow.text<2||allow.image<backplates+examples)fail('the remaining budget cannot cover a full run (listing + Creative Director + images); nothing was called');
const real=new OpenAIClient({apiKey:config.openai.apiKey,baseUrl:config.openai.baseUrl}), used={text:0,image:0}, calls=[];
const guard=(kind,fn)=>async a=>{if(used[kind]>=allow[kind])throw new Error(`scratch budget: refusing a ${kind} call beyond ${allow[kind]} this run (${a.step??a.schemaName})`);
  used[kind]++;calls.push({kind,step:a.step??a.schemaName,at:new Date().toISOString()});return fn(a);};
const client={json:guard('text',a=>real.json(a)),image:guard('image',a=>real.image(a)),imageEdit:guard('image',a=>real.imageEdit(a))};
const sent=[];let mid=1;
// Image buffers at any depth (photos, albums) are recorded as their size only.
const clean=v=>v instanceof Uint8Array?`<${v.length} bytes>`:Array.isArray(v)?v.map(clean):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clean(x)])):v;
const telegram=new Proxy({},{get:(_,k)=>async(...a)=>{sent.push({method:String(k),args:a.map(clean)});return {messageId:++mid};}});
let costs=null;
try{const { loadPricing, CostLedger }=await import('../src/costs/index.mjs');const pricing=loadPricing();costs={ledger:new CostLedger({dir:join(stateDir,'costs'),pricing}),pricing};}catch{}
const store=new ProductStore({productsDir});
const wf=new Workflow({store,registry:new Registry({stateDir}),telegram,
  ai:{client,textModel:config.openai.textModel,imageModel:config.openai.imageModel,imageQuality:imageQualities(config).proof,previewQuality:imageQualities(config).preview},
  auth:()=>true,marketingScenes:config.marketingScenes,log:m=>say(`  ${m}`),costs});   // no stage4: Etsy is not reachable from this run

// A FAILED copy is resumed exactly as the bot's Retry does: the 'retry' transition first (to its resume state), then the step.
const cur=await store.load(ID);
if(cur.status==='FAILED'){if(cur.resume_state!=='PRODUCTION_APPROVED')fail(`the copy failed outside Stage 3 (resume state ${cur.resume_state})`);
  await store.save(transition(cur,'retry',{actor:ACTOR,now:new Date()}));say(`Resumed the FAILED copy (retry -> ${cur.resume_state}).`);}
const result=await wf.runMarketing(ID,ACTOR,{engine:'ai-creative',chosenBy:ACTOR});
const after=await hashTree(source), changed=Object.keys({...before,...after}).filter(k=>before[k]!==after[k]);
const p=JSON.parse(await readFile(join(copy,'product.json'),'utf8')), qc=JSON.parse(await readFile(join(copy,'marketing/qc.json'),'utf8').catch(()=>'null'));
await writeFile(join(out,'telegram-would-have-sent.json'),JSON.stringify(sent,null,2));
const total={text:spent.text+used.text,image:spent.image+used.image};
await writeFile(join(out,'REPORT.json'),JSON.stringify({result,status:p.status,last_error:p.last_error,calls:[...(prior?.calls??[]).map(c=>({...c,run:c.run??'earlier'})),...calls.map(c=>({...c,run:'this'}))],used,total,overall,budget:BUDGET,source_changed:changed,
  qc:qc?{passed:qc.passed,failed:qc.checks.filter(c=>!c.ok),warnings:qc.warnings??[]}:null},null,2));
say(`Outcome: ${result.outcome}; status ${p.status}. Calls this run: ${used.text} text + ${used.image} image (${calls.map(c=>c.step).join(', ')}). Whole experiment: ${total.text} text + ${total.image} image.`);
if(qc)say(`QC: ${qc.passed?'PASSED':'FAILED'}${qc.passed?'':` (${qc.checks.filter(c=>!c.ok).map(c=>c.name).join('; ')})`}; warnings: ${(qc.warnings??[]).length}.`);
say(`Review: ${join(copy,'marketing','images')} (contact sheet: thumbs/contact-sheet.png); plan + concept: marketing/plan.json; QC: marketing/qc.json; ${join(out,'REPORT.json')}.`);
if(changed.length)fail(`the SOURCE product changed during the run: ${changed.join(', ')}`);
say('Source product unchanged. Nothing was approved, sent to Telegram, or sent to Etsy.');
