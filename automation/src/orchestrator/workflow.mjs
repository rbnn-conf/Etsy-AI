// Stage 1 creative workflow:
//   /newproduct -> optional references -> /go -> (reference analysis ->
//   creative direction) -> 3 structured concepts -> 3 concept PREVIEW images
//   -> owner chooses A/B/C visually (gate 1) -> specification -> 3 creative
//   proofs -> APPROVE STYLE / REGENERATE / CHANGE DIRECTION / REJECT (gate 2).
//   A full-book format (colouring book, ADR-030) then generates EVERY page from
//   the authoritative page manifest (paid, confirmed, page by page, resumable)
//   -> creative QC -> full book review -> APPROVE FULL BOOK (gate 3).
//   Then Stage 2 (ADR-024), started by /produce <id>: deterministic handoff
//   -> build -> QC -> owner review (APPROVE PRODUCTION / REBUILD / CANCEL).
//   Stage 2 makes no OpenAI call.
//   Then Stage 3 (ADR-025), started by /market <id>: listing copy + marketing
//   images from the approved Stage 2 package -> QC -> owner review. Never calls
//   Etsy and never publishes (Stage 4).
import { createHash } from 'node:crypto';
import { transition, canApply, acquireLock, releaseLock, newNonce, BusyError, TERMINAL, GENERATING, inProduction, inMarketing, inEtsy } from './state.mjs';
import { selectProofPages, proofLabel } from './proofs.mjs';
import { imageSizeFor } from './canvas.mjs';
import { analyseReferences, REFERENCE_OMIT } from '../openai/reference-analysis.mjs';
import { createDirection } from '../openai/direction.mjs';
import { generateConcepts } from '../openai/ideas.mjs';
import { generateSpecification } from '../openai/specification.mjs';
import { buildImagePrompt, generateProofImage, generatePreviewImage } from '../openai/images.mjs';
import { buildPreviewPrompt, orientationOf } from '../openai/concept-preview.mjs';
import { isLegacyDirection, leakedDirectionFields } from './diversity.mjs';
import { parse, conceptKeyboard, proofKeyboard, failureKeyboard, nextStepKeyboard, productionKeyboard, outdatedPackageText, outdatedPackageKeyboard, marketingKeyboard, comparisonKeyboard, etsyReviewKeyboard, etsyConfirmKeyboard, SLIDE_ACTION, BOOK_PAGE_ACTION, VISUAL_PREVIEW_ACTION } from '../telegram/approvals.mjs';
// Stage 1 full book (ADR-030): page manifest, proof reuse, page prompts and creative QC; its Telegram screens.
import { needsFullArtwork, awaitingFullArtwork, bookApproved, inBook, bookProgress, pageId, pageFile, HAVE, BOOK_MANIFEST, BOOK_QC, FULL_ARTWORK_FORMATS } from './book-state.mjs';
import { assessReuse, buildBookManifest, bookPagePrompt, bookQc, pngSize } from './book.mjs';
import { bookGenerateScreen, bookReviewText, bookReviewKeyboard, bookPagesScreen, bookPageScreen, bookRejectScreen, bookNotReadyText } from '../telegram/book.mjs';
// Stage 1 crochet pattern content (ADR-041): candidate patterns, validation, APPROVE PATTERNS; its Telegram screens.
import { needsPatterns, patternsApproved, awaitingPatterns, inPatterns, canReopenPatterns, emptyCrochet, parseBrief, fromModelPattern, assembleBundle, validateCandidate, verificationOf,
  PATTERN_SOURCE, PATTERN_PLAN, draftFile } from './crochet.mjs';
import { restyleProblem, restyledDirection, restyledPages, restyledProduct, restyleConflicts, restyleArchiveDir, restyleVisualSpecs, restyleValuesProblems, RESTYLE_VALUES_FILE, RESTYLE_REASON } from './restyle.mjs';
const VISUAL_SPECS_FILE='creative/visual-specs.json';
import { loadSchema, validate as validateSchema, assertValid } from './schema.mjs';
import { generatePatternPlan, generatePattern } from '../openai/crochet.mjs';
// Stage 1 crochet visual set (ADR-063): collection hero + one finished-item preview per approved pattern.
import { visualsApplicable, visualsApproved, inVisuals, canStartVisuals, emptyAssets, visualsProgress, plannedVisualCalls, restyleTargets } from './crochet-visuals.mjs';
import { promptFor, generateVisual, VISUAL_ORIENTATION } from '../openai/crochet-visuals.mjs';
import { visualsConfirmScreen, visualsReviewText, visualsReviewKeyboard, visualsScreen, visualsNotApprovedText, patternName } from '../telegram/crochet-visuals.mjs';
import { briefPrompt, patternsStartScreen, patternsNotReadyText, visualsNotCheckedText, patternReviewText, patternReviewKeyboard, revisePrompt, reviewDocument } from '../telegram/crochet.mjs';
// Stage 4: the draft/publish engine. It never imports the Etsy HTTP client; the live client is injected (bot.mjs).
import { Stage4, Stage4Error, DryRunEtsy, etsyDirFor, classify, driftLines, verifyFailedMessage, readJsonIf } from '../stage4/index.mjs';
// Stage 2 is the deterministic production package: no model client is ever passed to it.
import { effectiveBookQc, overflowReview, overflowOverride, writeHandoff, buildProduction, withBuildLock, runQc, packageDesignCheck, refusalLabels, ProductionQcError, HANDOFF_FILE, BUILD_RECORD, QC_REPORT, ADAPTERS, bookPagesDigest, crochetProductionReadiness, crochetPrintability, printabilityErrors, rebindVisualSpecs, visualBriefs, visualSetProblems, visualSetQc, assetsDigest, canonSha, historyFile, VISUAL_BRIEFS, VISUAL_MANIFEST, VISUAL_SET_VERSION, HERO_ASSET } from '../../../production/src/index.mjs';
// Stage 3: deterministic core (facts, planner, real-artwork compositions, QC) + the OpenAI copy/scenes.
import { deriveFacts, planSlides, prepareArt, renderSlides, runStage3Qc, CAMPAIGN_VERSION, deriveStrategy, ENGINES, ENGINE_VERSION, usesEnvironment, engineMinShare, slideArtwork, productLikeShapes, engineQc, productShare, representativeArtwork, Stage3Error, imageDirectionFor, adapterOf, usesCreativeEnvironment, creativeSlides, environmentCap, conceptDigest, exampleFidelity, fidelityChecks, backplateDifferentiation, routeContract, routeOf, gateBeforeImage } from '../../../marketing/src/stage3/index.mjs';
import { generateListing, finaliseListing, factsForModel, generateMarketingCopy, generateScene, scenePrompt, examplePrompt, generateColouredExample } from '../stage3/openai.mjs';
// Stage 3 marketing engines (Hybrid, AI Creative): art direction + environments; the real artwork is composited by code.
import { generateArtDirection, environmentPrompt, generateEnvironment, creativeEnvironmentPrompt } from '../stage3/engines.mjs';
import { approvalRecord, approvedHeroFor, approvalLock, approvedHeroSlide, approvalProblems, integrityError } from '../stage3/approved-hero.mjs';
import { parseCommand, imageAttachment, sniffImage, HELP, EXAMPLES, previewHeader, previewCaption, choosePrompt, proofSummary, productionSummary, marketingSummary, etsyDraftSummary, etsySectionLines, etsyConfirmText, etsyPublishedText } from '../telegram/commands.mjs';
import { mkdir, rename, readFile as readFileFs, access as accessFs } from 'node:fs/promises';
import { join as joinPath, dirname } from 'node:path';
// SEO & market research panel (ADR-036): the owner interface over seo/. The only automation code that uses the SEO engine.
import { SeoPanel } from '../seo/panel.mjs';
import { describeError } from '../log.mjs';
import { meteredClient } from '../openai/meter.mjs';
import { stage4Problems } from '../config.mjs';
import { parseMenu, homeScreen, newProductScreen, describePrompt, productsScreen, productScreen, productCostScreen, confirmScreen, etsyDraftsScreen, failureScreen,
  costsScreen, costsUnavailableScreen, costByProductScreen, costByModelScreen, statusScreen, toolsScreen, helpScreen, contextHelpScreen, productCounts, CONFIRM, BOT_COMMANDS, editorUrl,
  marketingModeScreen, compareModesScreen, marketingSlidesScreen, marketingSlideScreen, confirmKey, slideLabel } from '../telegram/menu.mjs';
import { shortError, retrySafety, menuData, STATUS, knownFailureText, patternsEditedText } from '../telegram/ui.mjs';
// Owner status / progress (presentation only): the RUNNING message, its final state and the owner header on actionable messages.
import { actionHeader } from '../telegram/status.mjs';
import { factoryTotals, byProduct, byModel, productCost, estimateCalls, estimateLine, gbp, stepSpend, BOOK_IMAGE_STEPS, VISUAL_IMAGE_STEPS } from '../costs/report.mjs';
const ENGINE_OF_ACTION={mfac:'factory',mhyb:'hybrid',mai:'ai-creative'};
const ENGINE_LABEL=id=>ENGINES[id]?.label??id;

const DIRECTION_FILE='creative/creative-direction.json';
// "Describe a product" waits this long for the owner's next message.
const DESCRIBE_TTL_MS=15*60*1000;
const ADAPTER_LABEL={'greeting-card':'Greeting card','colouring-book':'Colouring book','crochet-pattern-bundle':'Crochet pattern bundle'};
const sha256=b=>createHash('sha256').update(b).digest('hex');
/** ⚠️ needs attention: the short error first, then what is safe to do next. */
function failureText(p){
  const known=knownFailureText(p);
  if(known)return known;
  const s=retrySafety(p);
  return [`${STATUS.warn} Product #${p.product_id} needs attention`,'',shortError(p.last_error?.message),'',
    `Stopped at: ${p.last_error?.step??'unknown step'}. Completed files are kept.`,
    s.safe?(s.paid?'Retry may call OpenAI; you will be asked to confirm.':'Retry is free and safe: finished work is skipped.'):s.reason].join('\n');
}
const ANALYSIS_FILE='creative/reference-analysis.json';
const pad=n=>String(n).padStart(2,'0');
const actorOf=f=>f?.username?`@${f.username}`:`user:${f?.id??'unknown'}`;
// A generating state resumes from the state it was entered from.
// Production build/QC always resume from PRODUCTION_READY (the build itself skips finished outputs).
// Marketing steps resume from PRODUCTION_APPROVED (finished paid artefacts are reused).
// Stage 4 draft steps resume from ETSY_PREPARING (the journal skips finished Etsy work; never back into Stage 3);
// an interrupted publish resumes from AWAITING_ETSY_PUBLISH_APPROVAL (Etsy is read before anything else).
const resumeStateOf=p=>['PRODUCTION_BUILDING','PRODUCTION_QC'].includes(p.status)?'PRODUCTION_READY'
  :['MARKETING_PLANNING','MARKETING_GENERATING','MARKETING_QC'].includes(p.status)?'PRODUCTION_APPROVED'
  :['ETSY_PREPARING','ETSY_DRAFT_CREATED','ETSY_ASSETS_UPLOADING','ETSY_DRAFT_VERIFYING'].includes(p.status)?'ETSY_PREPARING'
  :p.status==='PUBLISHING'?'AWAITING_ETSY_PUBLISH_APPROVAL'
  :GENERATING.includes(p.status)?p.status_history.findLast(h=>h.to===p.status).from:p.status;
const summaryOf=d=>({style:d.illustration_style,linework:`${d.line_weight}; ${d.line_quality}`,detail:d.detail_level,palette:`${d.palette} (${d.colour_mode})`,mood:d.mood});

export class Workflow{
  /**
   * @param stage4 {config:{mode:'dry-run'|'live'|'blocked', publishEnabled, shopId, seller}, liveClient?:()=>Promise<client>, problems?:string[]}
   *   Defaults to a dry run with publishing off. Stage 4 never receives the OpenAI client.
   */
  constructor({store,registry,telegram,ai,auth,maxReferences=6,maxConceptBatches=3,marketingScenes=4,catalogue=async()=>[],log=()=>{},now=()=>new Date(),stage4={},costs=null,seo={},ownerStatus=null}){
    Object.assign(this,{store,registry,telegram,ai,auth,maxReferences,maxConceptBatches,marketingScenes,catalogue,log,now});
    /** OwnerStatus (owner-status.mjs) — optional presentation layer; without it every message is exactly as before. */
    this.status=ownerStatus;
    /** {ledger: CostLedger, pricing} — optional; without it cost screens say "not tracked". */
    this.costs=costs;
    this.stage4={problems:[],...stage4,config:{mode:'dry-run',publishEnabled:false,shopId:undefined,seller:{whoMade:null,whenMade:null,quantity:999},...(stage4.config??{})}};
    // Every OpenAI attempt is metered and flushed into product.json api_usage (see #guarded).
    if(ai?.client){this.meter=meteredClient(ai.client,{now});this.ai={...ai,client:this.meter.client};}
    // SEO panel: its state lives beside the registry (git-ignored); it never receives the OpenAI or Etsy client.
    const seoDir=seo.stateDir??(registry?.path?dirname(registry.path):null);
    this.seo=seoDir&&store?new SeoPanel({productsDir:store.dir,stateDir:seoDir,store,now,log,
      show:(c,m,scr,o)=>this.#showScreen(c,m,scr,o),send:(c,t)=>this.#say(c,t)}):null;
  }

  // ---------- Telegram entry point ----------
  async handleUpdate(update){
    // Steps chained inside one update (ideation -> previews, feedback -> proofs) share one status message.
    this.status?.hold();
    try{
      if(update.callback_query)return await this.onCallback(update.callback_query);
      if(update.message)return await this.onMessage(update.message);
      return {outcome:'ignored'};
    }catch(err){
      this.log(`update ${update.update_id} failed: ${describeError(err)}`);
      return {outcome:'error',detail:describeError(err)};
    }finally{await this.status?.release();}
  }
  /** Periodic owner-status work (bot.mjs timer): elapsed refresh and the one reminder per waiting state. Reads products only. */
  statusTick(){return this.status?this.status.tick({listProducts:()=>this.store.list()}):Promise.resolve();}
  /** Progress the workflow holds outside product.json (presentation only). */
  #progress(productId,note){return this.status?.note(productId,note);}
  /**
   * An actionable message (review buttons, or a failure with Retry). With the
   * status layer on, it starts with the owner state (🟠 ACTION REQUIRED / 🔴
   * FAILED, "Pipeline paused until you respond."); the keyboard is remembered.
   */
  async #sayAction(p,text,keyboard,{label=null}={}){
    const mid=await this.#say(p.request.chat_id,this.status?`${actionHeader(p,{label})}\n\n${text}`.slice(0,4000):text,keyboard);
    if(mid)await this.#rememberKeyboard(p.product_id,mid);
    return mid;
  }

  async #say(chatId,text,replyMarkup){
    try{const r=await this.telegram.sendMessage({chatId:String(chatId),text,...(replyMarkup?{replyMarkup}:{})});return r?.messageId??null;}
    catch(err){this.log(`telegram send failed: ${describeError(err)}`);return null;}
  }
  async #quiet(fn){try{await fn();}catch(err){this.log(`telegram: ${describeError(err)}`);}}
  async #active(chatId){const id=(await this.registry.read()).active_by_chat[String(chatId)];return id?this.store.load(id):null;}
  async #setActive(chatId,id){await this.registry.update(r=>{if(id)r.active_by_chat[String(chatId)]=id;else delete r.active_by_chat[String(chatId)];});}
  /**
   * Append metered OpenAI attempts (successful, failed or rejected) to the product, and
   * price them into the cost ledger. A ledger failure is logged and never touches product state.
   */
  #flushUsage(p){
    const u=this.meter?.drain()??[];
    if(!u.length)return p;
    if(this.costs?.ledger){
      try{this.costs.ledger.record({productId:p.product_id,operation:p.lock?.op??null,records:u});}
      catch(err){this.log(`cost ledger: ${u.length} OpenAI call(s) for #${p.product_id} not recorded: ${describeError(err)}`);}
    }
    return {...p,api_usage:[...p.api_usage,...u.map(({request,...r})=>r)]};
  }

  async onMessage(m){
    const chatId=m.chat?.id, userId=m.from?.id;
    if(chatId===undefined||userId===undefined||!this.auth(chatId,userId)){this.log(`ignored message from unauthorised user:${userId} chat:${chatId}`);return {outcome:'unauthorized'};}
    const actor=actorOf(m.from), cmd=parseCommand(m.text??m.caption), att=imageAttachment(m);
    if(cmd?.name==='newproduct'){
      if(!cmd.args){await this.#say(chatId,`Usage: /newproduct <request>, e.g.\n${EXAMPLES.map(e=>`/newproduct ${e}`).join('\n')}`);return {outcome:'usage'};}
      const prev=await this.#active(chatId);
      let p=await this.store.create({requestText:cmd.args.slice(0,300),chatId,requestedBy:actor});
      await this.#setActive(chatId,p.product_id);
      await this.#say(chatId,[`PRODUCT #${p.product_id} started: ${p.request.text}`,
        prev&&!TERMINAL.includes(prev.status)?`(Product #${prev.product_id} left as ${prev.status}.)`:'',
        `Send reference images now (optional, up to ${this.maxReferences}). Then press Generate Concepts (or send /go) to see three visual concept previews.`].filter(Boolean).join('\n'),
        {inline_keyboard:[[{text:'▶️ Generate Concepts',callback_data:menuData('ask',p.product_id,'go')}],[{text:'📦 Product',callback_data:menuData('prod',p.product_id)},{text:'🏠 Home',callback_data:menuData('home')}]]});
      if(att)p=(await this.addReference(p,att,actor)).product;
      return {outcome:'created',productId:p.product_id};
    }
    if(cmd?.name==='go'){
      const p=await this.#active(chatId);
      if(!p||!['DRAFT','REFERENCES_RECEIVED'].includes(p.status)){await this.#say(chatId,'No product is waiting for /go. Start with /newproduct <request>.');return {outcome:'nothing_to_do'};}
      return this.runIdeation(p.product_id,actor);
    }
    if(cmd?.name==='previews'){
      const p=await this.#active(chatId);
      if(p?.lock){await this.#say(chatId,`Product #${p.product_id} is busy (${p.lock.op}).`);return {outcome:'busy'};}
      if(p?.status==='AWAITING_CONCEPT_SELECTION')return this.#sendPreviews(p.product_id);   // re-send only, never regenerate
      if(p?.status==='IDEAS_READY'&&p.concepts.batches.length)return this.runPreviews(p.product_id,actor);
      await this.#say(chatId,p?.status==='FAILED'?`Product #${p.product_id} failed at ${p.last_error?.step}. Press RETRY on the error message.`:'No concepts are waiting for previews.');
      return {outcome:'nothing_to_do'};
    }
    if(cmd?.name==='produce'){
      const id=cmd.args?cmd.args.trim().padStart(3,'0'):(await this.registry.read()).active_by_chat[String(chatId)];
      const p=id&&/^\d{3}$/.test(id)?await this.store.load(id):null;
      if(!p||p.request.chat_id!==String(chatId)){await this.#say(chatId,'Usage: /produce <product number>, e.g. /produce 009');return {outcome:'usage'};}
      if(p.lock){await this.#say(chatId,`Product #${p.product_id} is busy (${p.lock.op}).`);return {outcome:'busy'};}
      if(p.status==='AWAITING_PRODUCTION_APPROVAL')return this.#sendProductionReview(p.product_id);   // re-send, never rebuild
      if(p.status==='PRODUCTION_APPROVED'){await this.#say(chatId,`Product #${p.product_id} production is already approved.`);return {outcome:'nothing_to_do'};}
      if(p.status==='FAILED'&&inProduction(p)){await this.#say(chatId,`Product #${p.product_id} production failed. Press RETRY or CANCEL on the error message.`);return {outcome:'nothing_to_do'};}
      // Stage 2 accepts a colouring book only after APPROVE FULL BOOK (the style proofs are not the product).
      if(needsFullArtwork(p)&&!bookApproved(p)&&['CREATIVE_APPROVED','BOOK_GENERATING','AWAITING_BOOK_APPROVAL','FAILED'].includes(p.status)){
        await this.#setActive(chatId,p.product_id);
        const plan=await this.#bookPlan(p);
        await this.#showScreen(chatId,null,{text:bookNotReadyText(p,plan),keyboard:(await this.#productScreen(p)).keyboard},'book_not_approved');
        return {outcome:'book_not_approved',productId:p.product_id};
      }
      // Stage 2 accepts a crochet pattern bundle only after APPROVE PATTERNS (creative approval is not pattern approval).
      if(needsPatterns(p)&&!patternsApproved(p)&&['CREATIVE_APPROVED','PATTERNS_GENERATING','AWAITING_PATTERN_APPROVAL','FAILED'].includes(p.status)){
        await this.#setActive(chatId,p.product_id);
        await this.#showScreen(chatId,null,{text:patternsNotReadyText(p),keyboard:(await this.#productScreen(p)).keyboard},'patterns_not_approved');
        return {outcome:'patterns_not_approved',productId:p.product_id};
      }
      // ...and only with its crochet visuals checked against those approved patterns (ADR-047). The same check is the
      // Stage 2 handoff's authority; here it stops early, with no state change, so Restyle stays available.
      if(needsPatterns(p)&&p.status==='CREATIVE_APPROVED'){
        const v=await crochetProductionReadiness(p,this.store.dirOf(p));
        // Edited after approval (ADR-053): not a visuals problem; the free fix is Re-validate + Approve, never Restyle.
        if(!v.ok&&v.reasons.some(r=>/changed after APPROVE PATTERNS/.test(r))){
          this.log(`#${p.product_id} production refused: ${v.reasons.join('; ')}`);
          await this.#setActive(chatId,p.product_id);
          await this.#showScreen(chatId,null,{text:patternsEditedText(p),keyboard:(await this.#productScreen(p)).keyboard},'crochet_patterns_edited');
          return {outcome:'crochet_patterns_edited',productId:p.product_id,reasons:v.reasons};
        }
        if(!v.ok){
          this.log(`#${p.product_id} production refused: crochet visuals not checked against the approved patterns: ${v.reasons.join('; ')}`);
          await this.#setActive(chatId,p.product_id);
          await this.#showScreen(chatId,null,{text:visualsNotCheckedText(p),keyboard:(await this.#productScreen(p)).keyboard},'crochet_visuals_unchecked');
          return {outcome:'crochet_visuals_unchecked',productId:p.product_id,reasons:v.reasons};
        }
      }
      // ...and, once it has a crochet visual set (ADR-063), only with that set approved. The handoff enforces the same.
      if(needsPatterns(p)&&p.status==='CREATIVE_APPROVED'&&p.crochet_visuals&&!visualsApproved(p)){
        await this.#setActive(chatId,p.product_id);
        await this.#showScreen(chatId,null,{text:visualsNotApprovedText(p),keyboard:(await this.#productScreen(p)).keyboard},'crochet_visual_set_unapproved');
        return {outcome:'crochet_visual_set_unapproved',productId:p.product_id};
      }
      if(!['CREATIVE_APPROVED','PRODUCTION_READY'].includes(p.status)){await this.#say(chatId,`Stage 2 needs a creatively approved product. #${p.product_id} is ${p.status}.`);return {outcome:'not_approved',productId:p.product_id};}
      await this.#setActive(chatId,p.product_id);
      await this.#say(chatId,`Product #${p.product_id}: building customer files (Stage 2, no AI calls)…`);
      return this.runProduction(p.product_id,actor);
    }
    if(cmd?.name==='market'){
      const id=cmd.args?cmd.args.trim().padStart(3,'0'):(await this.registry.read()).active_by_chat[String(chatId)];
      const p=id&&/^\d{3}$/.test(id)?await this.store.load(id):null;
      if(!p||p.request.chat_id!==String(chatId)){await this.#say(chatId,'Usage: /market <product number>, e.g. /market 009');return {outcome:'usage'};}
      if(p.lock){await this.#say(chatId,`Product #${p.product_id} is busy (${p.lock.op}).`);return {outcome:'busy'};}
      if(p.status==='AWAITING_MARKETING_APPROVAL')return this.#sendMarketingReview(p.product_id);   // re-send, never regenerate
      if(p.status==='MARKETING_APPROVED'){await this.#say(chatId,`Product #${p.product_id} marketing is already approved. Nothing has been published.`);return {outcome:'nothing_to_do'};}
      if(p.status==='FAILED'&&inMarketing(p)){await this.#say(chatId,`Product #${p.product_id} marketing failed. Press RETRY or CANCEL on the error message.`);return {outcome:'nothing_to_do'};}
      if(p.status!=='PRODUCTION_APPROVED'){await this.#say(chatId,`Stage 3 needs an approved production package. #${p.product_id} is ${p.status}.`);return {outcome:'not_approved',productId:p.product_id};}
      await this.#setActive(chatId,p.product_id);
      const scenes=await this.#plannedScenes(p);
      await this.#say(chatId,`Product #${p.product_id}: writing the Etsy listing and building listing images from the approved production package. OpenAI cost: 2 text calls${scenes?` + ${scenes} image call${scenes>1?'s':''}`:''}.`);
      return this.runMarketing(p.product_id,actor);
    }
    if(cmd?.name==='etsy'){
      const [idArg,sub]=(cmd.args||'').split(/\s+/);
      const id=idArg?idArg.trim().padStart(3,'0'):(await this.registry.read()).active_by_chat[String(chatId)];
      // /etsy with no number and no active product: the Etsy drafts screen.
      if(!id)return this.#showScreen(chatId,null,etsyDraftsScreen(await this.#myProducts(chatId)),'menu_etsy');
      const p=id&&/^\d{3}$/.test(id)?await this.store.load(id):null;
      if(!p||p.request.chat_id!==String(chatId)){await this.#say(chatId,'Usage: /etsy <product number>, e.g. /etsy 009 (creates and verifies an Etsy DRAFT; never publishes)');return {outcome:'usage'};}
      if(p.lock){await this.#say(chatId,`Product #${p.product_id} is busy (${p.lock.op}).`);return {outcome:'busy'};}
      return this.#etsyCommand(p,sub,actor,chatId);
    }
    if(cmd?.name==='status'){
      // /status <number>: that product; /status: the active product, else the factory.
      const id=cmd.args?cmd.args.trim().padStart(3,'0'):null;
      const p=id?(/^\d{3}$/.test(id)?await this.store.load(id).catch(()=>null):null):await this.#active(chatId);
      if(p&&p.request.chat_id===String(chatId)){await this.#showScreen(chatId,null,productScreen(p,{cost:this.#productCost(p)}),'status');return {outcome:'status',productId:p.product_id};}
      if(id){await this.#say(chatId,`Unknown product ${id}. Send /products to browse.`);return {outcome:'usage'};}
      return this.#showScreen(chatId,null,await this.#factoryScreen(chatId),'status');
    }
    if(cmd?.name==='products')return this.#showScreen(chatId,null,productsScreen(await this.#myProducts(chatId)),'menu_products');
    if(cmd?.name==='cancel'){
      const p=await this.#active(chatId);
      if(p&&p.status==='FAILED'&&inBook(p)){
        if(p.lock){await this.#say(chatId,`Product #${p.product_id} is busy (${p.lock.op}). Try /cancel again when it finishes.`);return {outcome:'busy'};}
        return this.#stopBook(p,actor);
      }
      if(p&&p.status==='FAILED'&&inPatterns(p)){
        if(p.lock){await this.#say(chatId,`Product #${p.product_id} is busy (${p.lock.op}). Try /cancel again when it finishes.`);return {outcome:'busy'};}
        return this.#rejectPatterns(p,actor);
      }
      if(p&&inMarketing(p)&&canApply(p,'marketing_cancelled')){
        if(p.lock){await this.#say(chatId,`Product #${p.product_id} is busy (${p.lock.op}). Try /cancel again when it finishes.`);return {outcome:'busy'};}
        return this.#cancelMarketing(p,actor);
      }
      if(p&&inProduction(p)&&canApply(p,'production_cancelled')){
        if(p.lock){await this.#say(chatId,`Product #${p.product_id} is busy (${p.lock.op}). Try /cancel again when it finishes.`);return {outcome:'busy'};}
        return this.#cancelProduction(p,actor);
      }
      if(!p||!canApply(p,'rejected')){await this.#say(chatId,'No active product to cancel.');return {outcome:'nothing_to_do'};}
      if(p.lock){await this.#say(chatId,`Product #${p.product_id} is busy (${p.lock.op}). Try /cancel again when it finishes.`);return {outcome:'busy'};}
      await this.store.save(transition(p,'rejected',{actor,now:this.now()}));await this.#setActive(chatId,null);
      await this.#say(chatId,`Product #${p.product_id} cancelled.`);return {outcome:'rejected',productId:p.product_id};
    }
    // Control panel (the menus call the same operations as the commands above).
    if(cmd?.name==='start'||cmd?.name==='menu')return this.#showScreen(chatId,null,await this.#homeScreen(chatId),'menu');
    if(cmd?.name==='costs')return this.#showScreen(chatId,null,this.#costsScreen(),'costs');
    if(cmd?.name==='seo'&&this.seo)return this.seo.dashboard(chatId);
    if(cmd?.name==='help')return this.#showScreen(chatId,null,helpScreen(),'help');
    if(cmd){await this.#say(chatId,HELP);return {outcome:'help'};}
    if(att){
      const p=await this.#active(chatId);
      if(!p){await this.#say(chatId,'Start with /newproduct <request>, then send reference images.');return {outcome:'no_product'};}
      if(!['DRAFT','REFERENCES_RECEIVED'].includes(p.status)){await this.#say(chatId,`Product #${p.product_id} is past the reference stage (${p.status}).`);return {outcome:'too_late'};}
      return this.addReference(p,att,actor);
    }
    const p=await this.#active(chatId);
    // A waiting SEO input (Marketplace Insights entry, intake, search) takes the text unless a product input was requested more recently.
    if(m.text&&!cmd&&this.seo){const at=await this.seo.entryAt(chatId);if(at&&(!p?.pending_input||at>=p.updated_at)){const r=await this.seo.onText(m,{chatId,actor});if(r)return r;}}
    if(m.text&&p?.pending_input==='direction_feedback')return this.runDirectionChange(p.product_id,m.text.trim().slice(0,1000),actor);
    if(m.text&&!cmd&&p?.pending_input==='marketing_direction'&&p.status==='AWAITING_MARKETING_APPROVAL'&&p.marketing?.pending_asset){
      const index=p.marketing.pending_asset.index;
      await this.store.save({...p,pending_input:null,marketing:{...p.marketing,pending_asset:null},updated_at:this.now().toISOString()});
      return this.runMarketingAsset(p.product_id,actor,{index,op:'direction',feedback:m.text.trim().slice(0,500)});
    }
    if(m.text&&!cmd&&p?.pending_input==='book_page_direction'&&p.status==='AWAITING_BOOK_APPROVAL'&&p.book?.pending_page)
      return this.runBookPage(p.product_id,actor,{page_number:p.book.pending_page.page_number,op:'direction',instruction:m.text.trim().slice(0,500)});
    if(m.text&&!cmd&&p?.pending_input==='book_direction'&&p.status==='AWAITING_BOOK_APPROVAL')return this.#changeBookDirection(p,m.text.trim().slice(0,500),actor);
    if(m.text&&!cmd&&p?.pending_input==='crochet_brief'&&awaitingPatterns(p))return this.#setPatternBrief(p,m.text.trim().slice(0,1800),actor);
    if(m.text&&!cmd&&p?.pending_input==='pattern_revision'&&p.status==='AWAITING_PATTERN_APPROVAL')return this.#revisePattern(p,m.text.trim().slice(0,600),actor);
    // "✏️ Describe a product": the next plain message (within the time limit) becomes /newproduct.
    const pending=(await this.registry.read()).pending_by_chat?.[String(chatId)];
    if(m.text&&!cmd&&pending?.kind==='new_product'){
      await this.registry.update(r=>{if(r.pending_by_chat)delete r.pending_by_chat[String(chatId)];});
      if(this.now()-new Date(pending.at)<=DESCRIBE_TTL_MS)return this.onMessage({...m,text:`/newproduct ${m.text.trim()}`});
    }
    await this.#say(chatId,'Send /start to open LumiumX Factory, or type / to see the commands.');return {outcome:'hint'};
  }

  /** Download a Telegram image into references/ and associate it with the product. */
  async addReference(p,att,actor){
    const chatId=p.request.chat_id;
    if(p.reference_files.some(r=>r.telegram_file_unique_id===att.uniqueId))return {outcome:'duplicate_reference',product:p};
    if(p.reference_files.length>=this.maxReferences){await this.#say(chatId,`Reference limit (${this.maxReferences}) reached; extra image ignored.`);return {outcome:'reference_limit',product:p};}
    let bytes;
    try{const f=await this.telegram.getFile(att.fileId);bytes=await this.telegram.downloadFile(f.filePath);}
    catch(err){this.log(`reference download failed: ${describeError(err)}`);await this.#say(chatId,'Could not download that image from Telegram. Please send it again.');return {outcome:'download_failed',product:p};}
    const kind=sniffImage(bytes);
    if(!kind){await this.#say(chatId,'That file is not a PNG, JPEG, WebP or GIF image; ignored.');return {outcome:'not_image',product:p};}
    const sha256=createHash('sha256').update(bytes).digest('hex');
    if(p.reference_files.some(r=>r.sha256===sha256))return {outcome:'duplicate_reference',product:p};
    const file=`references/reference-${pad(p.reference_files.length+1)}.${kind.ext}`;
    await this.store.writeBytes(p,file,bytes);
    const fresh=await this.store.load(p.product_id);
    let next={...fresh,reference_files:[...fresh.reference_files,{file,telegram_file_unique_id:att.uniqueId,mime_type:kind.mime,bytes:bytes.length,sha256,received_at:this.now().toISOString()}]};
    next=transition(next,'reference_added',{actor,now:this.now()});
    await this.store.save(next);
    await this.#say(chatId,`Reference ${next.reference_files.length} saved for #${p.product_id}. Send more, or /go.`);
    return {outcome:'reference_added',productId:p.product_id,file,product:next};
  }

  async onCallback(cq){
    const answer=text=>this.#quiet(()=>this.telegram.answerCallbackQuery(cq.id,text));
    if(typeof cq.data==='string'&&cq.data.startsWith('m1|'))return this.#onMenu(cq,answer);
    if(typeof cq.data==='string'&&cq.data.startsWith('s1|')&&this.seo){
      const chatId=cq.message?.chat?.id, userId=cq.from?.id;
      if(chatId===undefined||userId===undefined||!this.auth(chatId,userId)){await answer('Not authorised.');return {outcome:'unauthorized'};}
      return this.seo.onAction(cq,{answer,actor:actorOf(cq.from),chatId,mid:cq.message?.message_id});
    }
    const parsed=parse(cq.data);
    if(!parsed){await answer('Unrecognised button.');return {outcome:'unparseable'};}
    const chatId=cq.message?.chat?.id, userId=cq.from?.id;
    if(chatId===undefined||userId===undefined||!this.auth(chatId,userId)){await answer('Not authorised.');return {outcome:'unauthorized'};}
    const p=await this.store.load(parsed.productId);
    if(!p||p.request.chat_id!==String(chatId)){await answer('Unknown product.');return {outcome:'unknown_product'};}
    // Every state change rotates the nonce, so a second press of the same
    // (or any older) button is refused here: no duplicate generations.
    if(parsed.nonce!==p.review.nonce){await answer('Already handled: this button is out of date.');return {outcome:'stale',productId:p.product_id};}
    if(p.lock){await answer(`Already working (${p.lock.op})…`);return {outcome:'busy',productId:p.product_id};}
    const actor=actorOf(cq.from), messageId=cq.message?.message_id;
    const clearKeyboard=()=>messageId!==undefined&&this.#quiet(()=>this.telegram.editMessageReplyMarkup(String(chatId),messageId));
    const need=async(event)=>{if(canApply(p,event))return true;await answer(`Not available in state ${p.status}.`);return false;};
    const a=parsed.action;
    if(a==='ca'||a==='cb'||a==='cc'){
      if(p.status==='IDEAS_READY'){await answer('Send /previews first to see the concepts.');return {outcome:'invalid_state'};}
      if(!await need('concept_selected'))return {outcome:'invalid_state'};
      const id=a.slice(1).toUpperCase(), batch=p.concepts.batches.at(-1);
      let next={...p,concepts:{...p.concepts,selected:{batch:batch.batch,concept_id:id,selected_at:this.now().toISOString()}}};
      next=transition(next,'concept_selected',{actor,now:this.now()});
      await this.store.save(next);
      await answer(`Concept ${id} selected. Writing the specification…`);await clearKeyboard();
      await this.#say(chatId,`Concept ${id} selected: ${batch.concepts.find(c=>c.concept_id===id).proposed_name}. Writing the specification, then 3 creative proofs…`);
      const spec=await this.runSpecification(p.product_id,actor);
      if(spec.outcome!=='spec_ready')return spec;
      return this.runProofs(p.product_id,actor,{reason:'initial'});
    }
    if(a==='more'){
      if(!await need('ideas_ready'))return {outcome:'invalid_state'};
      if(p.concepts.batches.length>=this.maxConceptBatches){await answer(`Limit reached: ${this.maxConceptBatches} concept batches.`);return {outcome:'limit_reached',productId:p.product_id};}
      await answer('Generating three new concepts and previews…');await clearKeyboard();
      return this.runIdeation(p.product_id,actor,{more:true});
    }
    if(a==='mcancel'||(a==='cancel'&&inMarketing(p))){
      if(!await need('marketing_cancelled'))return {outcome:'invalid_state'};
      await answer('Marketing cancelled.');await clearKeyboard();
      return this.#cancelMarketing(p,actor);
    }
    if(a==='mapprove'){
      if(!await need('marketing_approved'))return {outcome:'invalid_state'};
      const next=transition({...p,marketing:{...p.marketing,approved_at:this.now().toISOString()}},'marketing_approved',{actor,now:this.now()});
      await this.store.save(next);await this.#setActive(chatId,null);
      await answer('Marketing approved.');await clearKeyboard();
      await this.#say(chatId,`✅ Marketing approved for #${p.product_id}. Listing and images are in products/${p.workspace}/marketing/. Nothing has been published; Stage 4 (Etsy) has not started.`,nextStepKeyboard(next));
      return {outcome:'marketing_approved',productId:p.product_id};
    }
    if(a==='mcopy'||a==='mimages'||a==='mall'){
      if(!await need('marketing_started'))return {outcome:'invalid_state'};
      const scope={mcopy:'copy',mimages:'marketing',mall:'all'}[a];
      // Listing-only needs images from the current visual system (it never re-renders or pays for images).
      if(scope==='copy'&&!(await this.store.exists(p,'marketing/plan.json')&&(await this.store.readJson(p,'marketing/plan.json')).campaign)){
        await answer('Images need regenerating first.');
        await this.#say(chatId,`#${p.product_id}'s listing images were made with the previous visual system, so a listing-only regeneration is not available yet. Press REGENERATE MARKETING (new images, listing kept) or REGENERATE ALL (new listing and images). Nothing was spent.`);
        return {outcome:'needs_marketing_regeneration',productId:p.product_id};
      }
      const scenes=await this.#plannedScenes(p), text=scope==='all'?2:1, imgs=scope==='copy'?0:scenes;
      await this.#say(chatId,`This regeneration will use approximately: ${text} text call${text>1?'s':''}${imgs?`, ${imgs} image call${imgs>1?'s':''}`:', no image calls'}.`);
      // Enter the step first (so a crash is recovered), then archive exactly this scope's paid artefacts.
      let next=transition({...p,marketing:{...p.marketing,pending_scope:scope}},'marketing_started',{actor,now:this.now()});
      await this.store.save(next);
      const archived=await this.#archiveMarketing(next,scope);
      await answer(`Regenerating ${scope==='copy'?'listing copy':scope==='marketing'?'marketing images':'listing and images'}…`);await clearKeyboard();
      this.log(`#${p.product_id} marketing regenerate (${scope}): archived to ${archived}.`);
      return this.runMarketing(p.product_id,actor);
    }
    // ----- Stage 3 marketing style (stored with the run) and the hero comparison. -----
    if(ENGINE_OF_ACTION[a]){
      if(p.status!=='PRODUCTION_APPROVED'){await answer(`Not available in state ${p.status}.`);return {outcome:'invalid_state'};}
      const engine=ENGINE_OF_ACTION[a], next={...p,review:{...p.review,nonce:newNonce()},updated_at:this.now().toISOString()};
      await this.store.save(next);   // a second press of this (or any older) button is refused
      // A plan made by a different engine is archived (never deleted) so this run starts clean; the listing is kept.
      if(await this.store.exists(p,'marketing/plan.json')&&((await this.store.readJson(p,'marketing/plan.json')).engine?.id??'factory')!==engine){
        const archived=await this.#archiveMarketing(next,'marketing');this.log(`#${p.product_id} marketing engine changed to ${engine}: previous visuals archived to ${archived}.`);
      }
      await answer(`Creating marketing: ${ENGINES[engine].title}…`);await clearKeyboard();await this.#setActive(chatId,p.product_id);
      await this.#say(chatId,`Product #${p.product_id}: creating the listing and marketing with ${ENGINE_LABEL(engine)}. ${estimateLine(await this.#marketingEstimate(next,engine))}`);
      return this.runMarketing(p.product_id,actor,{engine,chosenBy:actor});
    }
    if(a==='mcmp'){
      if(p.status!=='PRODUCTION_APPROVED'){await answer(`Not available in state ${p.status}.`);return {outcome:'invalid_state'};}
      await this.store.save({...p,review:{...p.review,nonce:newNonce()},updated_at:this.now().toISOString()});
      await answer('Generating the hero comparison…');await clearKeyboard();await this.#setActive(chatId,p.product_id);
      return this.runHeroComparison(p.product_id,actor);
    }
    const slideOp=SLIDE_ACTION.exec(a);
    if(slideOp){
      if(p.status!=='AWAITING_MARKETING_APPROVAL'){await answer(`Not available in state ${p.status}.`);return {outcome:'invalid_state'};}
      const index=Number(slideOp[2]), op={mrs:'scene',mrd:'direction',mrc:'composite'}[slideOp[1]];
      const plan=await this.store.readJson(p,'marketing/plan.json'), slide=plan.slides[index-1];
      if(!slide){await answer('Unknown image.');return {outcome:'invalid_state'};}
      if(op==='direction'){
        if((plan.engine?.id??'factory')==='factory'){await answer('Not available for Factory marketing.');return {outcome:'invalid_state'};}
        await this.store.save({...p,pending_input:'marketing_direction',marketing:{...p.marketing,pending_asset:{index}},review:{...p.review,nonce:newNonce()},updated_at:this.now().toISOString()});
        await answer('Send the change as a message.');await clearKeyboard();await this.#setActive(chatId,p.product_id);
        await this.#say(chatId,`Reply with what to change for ${slideLabel(slide)}, e.g. "warmer candlelight, product on the left, more depth". I will re-art-direct and repaint only this image's environment (1 text + 1 image call); the product stays the real artwork.`);
        return {outcome:'awaiting_direction_feedback',productId:p.product_id};
      }
      await answer(op==='composite'?'Rebuilding the composite (no API cost)…':'Regenerating the scene…');await clearKeyboard();
      return this.runMarketingAsset(p.product_id,actor,{index,op});
    }
    // ----- Stage 1 full book (ADR-030). Paid buttons are reached only through their cost confirmation. -----
    if(a==='bgen'){
      if(!awaitingFullArtwork(p)){await answer(`Not available in state ${p.status}.`);return {outcome:'invalid_state'};}
      await this.store.save({...p,review:{...p.review,nonce:newNonce()},updated_at:this.now().toISOString()});   // a second press is refused
      await answer('Generating the full book…');await clearKeyboard();await this.#setActive(chatId,p.product_id);
      const plan=await this.#bookPlan(p);
      await this.#say(chatId,plan.toGenerate?`Product #${p.product_id}: generating ${plan.toGenerate} page${plan.toGenerate>1?'s':''} (1 image call each). Progress is saved after every page.`:`Product #${p.product_id}: every page has artwork. Running the creative QC (no API cost).`);
      return this.runBook(p.product_id,actor);
    }
    if(a==='bapprove'){
      if(p.status!=='AWAITING_BOOK_APPROVAL'){await answer(`Not available in state ${p.status}.`);return {outcome:'invalid_state'};}
      const problem=await this.#bookApprovalProblem(p);
      if(problem){await answer('Cannot approve yet.');await this.#say(chatId,`#${p.product_id} full book NOT approved: ${problem}`);return {outcome:'book_not_approvable',productId:p.product_id,problem};}
      const approval={approved_at:this.now().toISOString(),by:actor,manifest_sha256:p.book.manifest.sha256,pages_sha256:p.book.qc.fingerprint,qc_sha256:p.book.qc.sha256,
        ...(p.book.qc.override?{override:p.book.qc.override}:{})};   // ADR-067: Stage 2 re-checks it against the same report
      const next=transition({...p,book:{...p.book,approval}},'book_approved',{actor,now:this.now()});
      await this.store.save(next);await this.#setActive(chatId,null);
      await answer('Full artwork approved.');await clearKeyboard();
      await this.#say(chatId,`✅ Full artwork approved for #${p.product_id}: ${p.pages.length}/${p.pages.length} pages. Build the customer files when you are ready (Stage 2, no API cost; or /produce ${p.product_id}).`,nextStepKeyboard(next));
      return {outcome:'book_approved',productId:p.product_id};
    }
    if(a==='bovr'){
      // ADR-067: ✅ ACCEPT OVERFLOW. Only the decorative artwork-overflow rule, only for this product's current QC report.
      if(p.status!=='AWAITING_BOOK_APPROVAL'){await answer(`Not available in state ${p.status}.`);return {outcome:'invalid_state'};}
      const q=await this.store.readBytes(p,BOOK_QC).catch(()=>null);
      if(!q||!p.book?.qc||sha256(q)!==p.book.qc.sha256){await answer('The QC report changed.');return {outcome:'invalid_state'};}
      let override;
      try{override=overflowOverride(JSON.parse(q),{qcSha256:p.book.qc.sha256,by:actor,at:this.now().toISOString()});}
      catch(e){await answer('Cannot accept.');await this.#say(chatId,`#${p.product_id}: overflow NOT accepted: ${e.message}.`);return {outcome:'overflow_not_acceptable',productId:p.product_id,problem:e.message};}
      // Recorded on this QC report (voided when any page is regenerated) and appended to the product's override history.
      const next={...p,book:{...p.book,qc:{...p.book.qc,override},override_history:[...(p.book.override_history??[]),override]},
        review:{...p.review,nonce:newNonce()},updated_at:this.now().toISOString()};
      await this.store.save(next);
      this.log(`#${p.product_id} owner override: ${override.statement} (${actor})`);
      await answer('Overflow accepted.');await clearKeyboard();
      await this.#say(chatId,`✅ #${p.product_id}: ${override.statement} Owner-approved exception recorded (${override.accepted_at}). Every other check still applies; approve the full artwork when you are ready.`);
      return this.#sendBookReview(p.product_id);
    }
    const pageOp=BOOK_PAGE_ACTION.exec(a);
    if(pageOp){
      const n=Number(pageOp[2]), e=p.book?.pages.find(x=>x.page_number===n);
      if(p.status!=='AWAITING_BOOK_APPROVAL'||!e){await answer(e?`Not available in state ${p.status}.`:'Unknown page.');return {outcome:'invalid_state'};}
      if(pageOp[1]==='bpd'){
        await this.store.save({...p,pending_input:'book_page_direction',book:{...p.book,pending_page:{page_number:n}},review:{...p.review,nonce:newNonce()},updated_at:this.now().toISOString()});
        await answer('Send the change as a message.');await clearKeyboard();await this.#setActive(chatId,p.product_id);
        await this.#say(chatId,`Reply with what to change on ${e.page_id} (${p.pages[n-1]?.title??''}), e.g. "make the train larger and simplify the background". I will regenerate only this page (1 image call), keeping the approved book style.`);
        return {outcome:'awaiting_page_direction',productId:p.product_id,page:n};
      }
      await answer(`Regenerating ${e.page_id}…`);await clearKeyboard();await this.#setActive(chatId,p.product_id);
      return this.runBookPage(p.product_id,actor,{page_number:n,op:'regenerate'});
    }
    if(a==='bdir'){
      if(p.status!=='AWAITING_BOOK_APPROVAL'){await answer(`Not available in state ${p.status}.`);return {outcome:'invalid_state'};}
      await this.store.save({...p,pending_input:'book_direction',review:{...p.review,nonce:newNonce()},updated_at:this.now().toISOString()});
      await answer('Send the new direction as a message.');await clearKeyboard();await this.#setActive(chatId,p.product_id);
      await this.#say(chatId,'Reply with one instruction for the whole book, e.g. "simpler backgrounds and bolder outlines". The generated pages are then archived (kept) and marked for regeneration. Nothing is generated until you confirm the new generation and its cost.');
      return {outcome:'awaiting_book_direction',productId:p.product_id};
    }
    if(a==='bstop'){
      if(!(p.status==='FAILED'&&inBook(p))&&p.status!=='AWAITING_BOOK_APPROVAL'){await answer(`Not available in state ${p.status}.`);return {outcome:'invalid_state'};}
      await answer('Stopped.');await clearKeyboard();
      return this.#stopBook(p,actor);
    }
    // ----- Stage 1 crochet visual set (ADR-063). Paid buttons are reached only through their image-count/cost confirmation. -----
    if(['vgen','vrh','vra','vapprove','vstop'].includes(a)||VISUAL_PREVIEW_ACTION.test(a)){
      if(!this.#visualActionOk(p,a)){await answer(`Not available in state ${p.status}.`);return {outcome:'invalid_state'};}
      if(a==='vapprove'){
        const problem=await this.#visualsApprovalProblem(p);
        if(problem){await answer('Cannot approve yet.');await this.#say(chatId,`#${p.product_id} visual set NOT approved: ${problem}`);return {outcome:'visuals_not_approvable',productId:p.product_id,problem};}
        const at=this.now().toISOString(), cv=p.crochet_visuals, m=await this.store.readJson(p,VISUAL_MANIFEST);
        m.approval={approved_at:at,by:actor,assets:m.assets.map(x=>({id:x.id,sha256:x.sha256})),
          note:'Owner approval of these illustrative images for production. Not a statement that any item was test-crocheted.'};
        const bytes=Buffer.from(JSON.stringify(m,null,2)+'\n');
        await this.store.writeBytes(p,VISUAL_MANIFEST,bytes);
        const next=transition({...p,crochet_visuals:{...cv,manifest:{file:VISUAL_MANIFEST,sha256:sha256(bytes)},
          approval:{approved_at:at,by:actor,manifest_sha256:sha256(bytes),assets_sha256:assetsDigest(m.assets),patterns_sha256:p.crochet.approval.source_sha256},
          history:[...cv.history,{at,by:actor,event:'approved'}]}},'visuals_approved',{actor,now:this.now()});
        await this.store.save(next);await this.#setActive(chatId,null);
        await answer('Visual set approved.');await clearKeyboard();
        await this.#say(chatId,`✅ Visual set approved for #${p.product_id}: 1 collection hero + ${cv.assets.length-1} pattern previews (SHA-256 bound). `+
          `Stage 2 places each preview on its pattern page, labelled as an illustration. Build the customer files when you are ready (no API cost; or /produce ${p.product_id}).`,nextStepKeyboard(next));
        return {outcome:'visuals_approved',productId:p.product_id};
      }
      if(a==='vstop'){
        const cv=p.crochet_visuals, at=this.now().toISOString();
        const next=transition({...p,pending_input:null,crochet_visuals:{...cv,pending_op:null,
          generation:cv.generation?.status==='generating'?{...cv.generation,status:'interrupted',finished_at:at}:cv.generation,history:[...cv.history,{at,by:actor,event:'stopped'}]}},'visuals_stopped',{actor,now:this.now()});
        await this.store.save(next);
        await answer('Stopped.');await clearKeyboard();
        const pr=visualsProgress(next);
        await this.#say(chatId,`Crochet visual set stopped for #${p.product_id}. Every image made so far is kept (${pr.done}/${pr.total}); continuing never pays for a finished image twice. Production needs the set approved first.`,nextStepKeyboard(next));
        return {outcome:'visuals_stopped',productId:p.product_id};
      }
      // Generate / resume, or restyle (hero, one preview, all): the targets are recorded first, then the paid run.
      const op=a==='vrh'?'restyle-hero':a==='vra'?'restyle-all':a==='vgen'?null:'restyle-preview';
      const targets=op?restyleTargets(p,op,Number(VISUAL_PREVIEW_ACTION.exec(a)?.[1])):[];
      let next={...p,pending_input:null,updated_at:this.now().toISOString()};
      // A production-approved product goes back to the approved style first (recorded); its package is rebuilt afterwards (free).
      if(p.status==='PRODUCTION_APPROVED'){
        next=transition(next,'production_reopened',{actor,now:this.now()});
        if(next.crochet_visuals)next.crochet_visuals={...next.crochet_visuals,history:[...next.crochet_visuals.history,{at:this.now().toISOString(),by:actor,event:'production-reopened'}]};
      }
      if(op)next.crochet_visuals={...next.crochet_visuals,pending_op:{op,targets,at:this.now().toISOString(),by:actor}};
      await this.store.save({...next,review:{...next.review,nonce:newNonce()}});
      await answer(op?'Restyling…':'Generating the crochet visual set…');await clearKeyboard();
      return this.runCrochetVisuals(p.product_id,actor);
    }
    // ----- Stage 1 crochet pattern content (ADR-041). Paid buttons are reached only through their cost confirmation. -----
    if(['cbrief','cgen','cval','capprove','crev','cregen','creject'].includes(a)){
      const review=p.status==='AWAITING_PATTERN_APPROVAL', c=p.crochet;
      const ok={cbrief:awaitingPatterns(p)&&!c?.plan,cgen:awaitingPatterns(p)&&!!c?.brief,cval:awaitingPatterns(p)||review||canReopenPatterns(p),capprove:review,
        crev:review&&!!c?.plan,cregen:review&&!!c?.plan&&c.patterns.some(e=>e.status==='invalid'),creject:review||(p.status==='FAILED'&&inPatterns(p))}[a];
      if(!ok){await answer(`Not available in state ${p.status}.`);return {outcome:'invalid_state'};}
      const rotate=extra=>this.store.save({...p,...extra,review:{...p.review,nonce:newNonce()},updated_at:this.now().toISOString()});
      if(a==='cbrief'){
        await rotate({pending_input:'crochet_brief'});
        await answer('Send the brief as a message.');await clearKeyboard();await this.#setActive(chatId,p.product_id);
        await this.#say(chatId,briefPrompt(p));
        return {outcome:'awaiting_pattern_brief',productId:p.product_id};
      }
      if(a==='capprove'){
        const problem=await this.#patternApprovalProblem(p);
        if(problem){await answer('Cannot approve yet.');await this.#say(chatId,`#${p.product_id} patterns NOT approved: ${problem}`);return {outcome:'patterns_not_approvable',productId:p.product_id,problem};}
        const bytes=await this.store.readBytes(p,PATTERN_SOURCE), bundle=JSON.parse(bytes);
        const approval={approved_at:this.now().toISOString(),by:actor,source_sha256:sha256(bytes),pattern_count:bundle.patterns.length,
          origin:bundle.provenance.origin,verification:verificationOf(bundle)};
        const next=transition({...p,crochet:{...c,approval}},'patterns_approved',{actor,now:this.now()});
        // A corrected source (ADR-052): the checked visual specs follow it free of charge only when the pattern
        // fingerprints are identical; otherwise production asks for a Restyle as before.
        const prev=c.approval_history?.at(-1);
        let rebind=null;
        if(prev&&await this.store.exists(p,VISUAL_SPECS_FILE)){
          let doc=null;try{doc=await this.store.readJson(p,VISUAL_SPECS_FILE);}catch{}
          rebind=rebindVisualSpecs(doc,{bundle,fromSha:prev.source_sha256,toSha:approval.source_sha256,at:approval.approved_at,by:actor});
          if(rebind.ok)await this.store.writeJson(p,VISUAL_SPECS_FILE,rebind.doc);
          this.log(`#${p.product_id} crochet: visual specs ${rebind.ok?`re-bound ${prev.source_sha256.slice(0,12)}… -> ${approval.source_sha256.slice(0,12)}… (fingerprints identical, no new images)`:`NOT re-bound: ${rebind.reasons.join('; ')}`}.`);
        }
        // ADR-053: a production handoff made for the earlier approval is refreshed now (free, no build), so the
        // owner never meets a stale production state. If it cannot be refreshed (e.g. visuals need a Restyle), it
        // is left as it is and Build reports the reason.
        if(prev&&rebind?.ok&&await this.store.exists(next,HANDOFF_FILE)){
          try{
            const w=await writeHandoff(next,this.store.dirOf(next));
            if(w.created){next.production={...(next.production??{}),handoff:{file:HANDOFF_FILE,sha256:w.sha256},adapter:w.handoff.adapter,build:null,qc:null,approved_at:null};
              this.log(`#${p.product_id} production handoff refreshed for the re-approved patterns${w.archived?` (old one kept as ${w.archived})`:''}.`);}
          }catch(err){this.log(`#${p.product_id} production handoff not refreshed: ${err.message}`);}
        }
        await this.store.save(next);await this.#setActive(chatId,null);
        await answer('Patterns approved.');await clearKeyboard();
        const ai=approval.origin==='ai-assisted-draft';
        await this.#say(chatId,`✅ Patterns approved for #${p.product_id}: ${approval.pattern_count} patterns${ai?`, AI-assisted drafts (${approval.verification.unverified} unverified)`:''}. `+
          `This approves them for production only; it does not mean they have been tested. Build the customer files when you are ready (Stage 2, no API cost; or /produce ${p.product_id}).`+
          (rebind?.ok?'\nThe checked visuals still match these patterns (no new images needed).':rebind?`\nThe visuals no longer match these patterns: run Restyle before production (${rebind.reasons[0]}).`:''),nextStepKeyboard(next));
        return {outcome:'patterns_approved',productId:p.product_id};
      }
      if(a==='crev'){
        await rotate({pending_input:'pattern_revision'});
        await answer('Send the change as a message.');await clearKeyboard();await this.#setActive(chatId,p.product_id);
        await this.#say(chatId,revisePrompt(p));
        return {outcome:'awaiting_pattern_revision',productId:p.product_id};
      }
      if(a==='creject'){await answer('Patterns rejected.');await clearKeyboard();return this.#rejectPatterns(p,actor);}
      // An APPROVED source edited afterwards (ADR-052): the old approval is superseded (kept in approval_history),
      // and the edited source goes through the same free validation and review before it can be approved again.
      if(a==='cval'&&patternsApproved(p)){
        const bytes=await this.store.exists(p,PATTERN_SOURCE)?await this.store.readBytes(p,PATTERN_SOURCE):null;
        if(!bytes||sha256(bytes)===c.approval.source_sha256){
          await answer(bytes?'Unchanged.':'No pattern source.');
          await this.#say(chatId,bytes?`#${p.product_id}: ${PATTERN_SOURCE} is unchanged since the patterns were approved. Nothing to re-validate.`:`${PATTERN_SOURCE} is missing.`);
          return {outcome:bytes?'patterns_unchanged':'no_pattern_source',productId:p.product_id};
        }
        const now=this.now(), prev=c.approval;
        await this.store.save(transition({...p,last_error:null,resume_state:null,crochet:{...c,approval:null,approval_history:[...(c.approval_history??[]),
          {approved_at:prev.approved_at,by:prev.by,source_sha256:prev.source_sha256,superseded_at:now.toISOString(),superseded_by:actor,reason:`${PATTERN_SOURCE} edited after approval`}]}},
          'patterns_reopened',{actor,now}));
        this.log(`#${p.product_id} crochet: ${PATTERN_SOURCE} edited after approval (${prev.source_sha256.slice(0,12)}… -> ${sha256(bytes).slice(0,12)}…); approval superseded, re-validating (no model call).`);
        await answer('Validating (no API cost)…');await clearKeyboard();await this.#setActive(chatId,p.product_id);
        return this.runPatterns(p.product_id,actor,{mode:'validate'});
      }
      if(a==='cval'&&!await this.store.exists(p,PATTERN_SOURCE)){
        await answer('No pattern source yet.');
        await this.#say(chatId,`${PATTERN_SOURCE} is not in products/${p.workspace}/ yet. Put your pattern source there (format: production/schemas/crochet-pattern-bundle.schema.json), then press Validate again. Nothing was charged.`);
        return {outcome:'no_pattern_source',productId:p.product_id};
      }
      await rotate(a==='cregen'?{crochet:{...c,pending:{op:'regenerate-invalid',pattern_id:null,instruction:null,at:this.now().toISOString(),by:actor}}}:{});
      await answer(a==='cval'?'Validating (no API cost)…':'Drafting candidate patterns…');await clearKeyboard();await this.#setActive(chatId,p.product_id);
      if(a!=='cval')await this.#say(chatId,`Product #${p.product_id}: drafting candidate crochet patterns (AI-assisted, unverified). Progress is saved after every pattern.`);
      return this.runPatterns(p.product_id,actor,{mode:a==='cval'?'validate':'generate'});
    }
    // ----- Control panel actions: exactly the operations behind /go, /previews, /produce, /market and /etsy. -----
    if(['go','prev','produce','market','edraft'].includes(a)){
      // Rotate the nonce first: a second press of this (or any older) button is refused.
      await this.store.save({...p,review:{...p.review,nonce:newNonce()},updated_at:this.now().toISOString()});
      await answer('Starting…');await clearKeyboard();
      await this.#setActive(chatId,p.product_id);
      const text={go:'/go',prev:'/previews',produce:`/produce ${p.product_id}`,market:`/market ${p.product_id}`,edraft:`/etsy ${p.product_id}`}[a];
      return this.onMessage({chat:{id:chatId},from:cq.from,text});
    }
    // ----- Stage 4 (Etsy). Nothing here deletes or publishes a listing except CONFIRM PUBLISH. -----
    if(a==='cancel'&&inEtsy(p)){
      await answer('Left as is.');await clearKeyboard();
      await this.#say(chatId,`#${p.product_id}: left as is. Any Etsy draft is untouched and nothing is live. RETRY (or /etsy ${p.product_id}) resumes safely.`);
      return {outcome:'etsy_left',productId:p.product_id};
    }
    if(a==='eleave'||a==='ekeep'){
      if(p.status!=='AWAITING_ETSY_PUBLISH_APPROVAL'){await answer(`Not available in state ${p.status}.`);return {outcome:'invalid_state'};}
      await this.store.save({...p,etsy:{...p.etsy,publish_request:null},review:{...p.review,nonce:newNonce()},updated_at:this.now().toISOString()});
      await answer('Kept as a draft.');await clearKeyboard();
      await this.#say(chatId,`#${p.product_id} stays an Etsy DRAFT. Nothing is live. You can edit it on Etsy; send /etsy ${p.product_id} to refresh and review it again.`);
      return {outcome:'etsy_kept_draft',productId:p.product_id};
    }
    if(a==='erefresh'){
      if(p.status!=='AWAITING_ETSY_PUBLISH_APPROVAL'){await answer(`Not available in state ${p.status}.`);return {outcome:'invalid_state'};}
      await answer('Reading the draft back from Etsy…');await clearKeyboard();
      return this.runEtsyRefresh(p.product_id,actor);
    }
    if(a==='epublish'){
      if(p.status!=='AWAITING_ETSY_PUBLISH_APPROVAL'){await answer(`Not available in state ${p.status}.`);return {outcome:'invalid_state'};}
      if(!this.#publishAllowed(p)){await answer('Publishing is not available.');await this.#say(chatId,this.#publishBlockedReason(p));return {outcome:'publish_disabled',productId:p.product_id};}
      // Bind the confirmation to exactly what was verified; a stale or changed draft cannot be confirmed.
      const next={...p,etsy:{...p.etsy,publish_request:{fingerprint:p.etsy.verification.fingerprint,requested_at:this.now().toISOString()}},review:{...p.review,nonce:newNonce()},updated_at:this.now().toISOString()};
      await this.store.save(next);
      await answer('Please confirm.');await clearKeyboard();
      const payload=await this.#engineRead(next,'payload.json');
      const mid=await this.#say(chatId,etsyConfirmText(next,{payload,listingId:next.etsy.listing_id}),etsyConfirmKeyboard(next));
      if(mid)await this.#rememberKeyboard(p.product_id,mid);
      return {outcome:'awaiting_publish_confirmation',productId:p.product_id};
    }
    if(a==='econfirm'){
      if(p.status!=='AWAITING_ETSY_PUBLISH_APPROVAL'){await answer(`Not available in state ${p.status}.`);return {outcome:'invalid_state'};}
      const req=p.etsy?.publish_request;
      if(!req||this.now()-new Date(req.requested_at)>30*60*1000){await answer('This confirmation expired.');await this.#say(chatId,`The publish confirmation for #${p.product_id} expired or was not requested. Nothing was published. Send /etsy ${p.product_id} to review again.`);return {outcome:'stale',productId:p.product_id};}
      if(!this.#publishAllowed(p)){await answer('Publishing is not available.');await this.#say(chatId,this.#publishBlockedReason(p));return {outcome:'publish_disabled',productId:p.product_id};}
      await answer('Re-checking everything, then publishing…');await clearKeyboard();
      return this.runEtsyPublish(p.product_id,actor);
    }
    if(a==='pcancel'||(a==='cancel'&&inProduction(p))){
      if(!await need('production_cancelled'))return {outcome:'invalid_state'};
      await answer('Production cancelled.');await clearKeyboard();
      return this.#cancelProduction(p,actor);
    }
    if(a==='papprove'){
      if(!await need('production_approved'))return {outcome:'invalid_state'};
      // Only a package built with the live document design may be approved (recorded build metadata, never file names).
      const record=await this.store.readJson(p,BUILD_RECORD).catch(()=>null), design=packageDesignCheck(record,p.production?.adapter?.format);
      if(!design.ok){
        await answer('Production package is outdated.');
        const mid=await this.#say(chatId,outdatedPackageText(refusalLabels(record,design)),outdatedPackageKeyboard(p));
        if(mid)await this.#rememberKeyboard(p.product_id,mid);
        return {outcome:'package_outdated',productId:p.product_id};
      }
      const next=transition({...p,production:{...p.production,approved_at:this.now().toISOString()}},'production_approved',{actor,now:this.now()});
      await this.store.save(next);await this.#setActive(chatId,null);
      await answer('Production approved.');await clearKeyboard();
      await this.#say(chatId,`✅ Production approved for #${p.product_id}. Customer package: products/${p.workspace}/production/package/. Stage 3 (listing, marketing, Etsy) has not started.`,nextStepKeyboard(next));
      return {outcome:'production_approved',productId:p.product_id};
    }
    if(a==='prebuild'){
      if(!await need('production_rebuild'))return {outcome:'invalid_state'};
      await this.store.save(transition(p,'production_rebuild',{actor,now:this.now()}));
      await answer('Rebuilding…');await clearKeyboard();
      return this.runProduction(p.product_id,actor,{rebuild:true});
    }
    if(a==='cancel'||a==='reject'){
      if(!await need('rejected'))return {outcome:'invalid_state'};
      await this.store.save(transition(p,'rejected',{actor,now:this.now()}));await this.#setActive(chatId,null);
      await answer(a==='reject'?'Product rejected.':'Cancelled.');await clearKeyboard();
      await this.#say(chatId,`Product #${p.product_id} ${a==='reject'?'rejected':'cancelled'}. Files are kept in products/${p.workspace}/.`);
      return {outcome:'rejected',productId:p.product_id};
    }
    if(a==='approve'){
      if(!await need('creative_approved'))return {outcome:'invalid_state'};
      const next=transition({...p,creative_approved_at:this.now().toISOString()},'creative_approved',{actor,now:this.now()});
      await this.store.save(next);await this.#setActive(chatId,null);
      await answer('Style approved.');await clearKeyboard();
      await this.#say(chatId,needsFullArtwork(next)
        ?`✅ Style approved for #${p.product_id}. Next: the full colouring book (${p.pages.length} pages). The approved style proofs are reused where they genuinely match their pages; you will see the page count, image calls and cost before anything is generated.`
        :needsPatterns(next)&&patternsApproved(next)
        ?`✅ Style approved for #${p.product_id}. The approved patterns are unchanged. Build the customer files when you are ready (Stage 2, no API cost; or /produce ${p.product_id}).`
        :needsPatterns(next)
        ?`✅ Style approved for #${p.product_id}: the look (typography, palette, branding, crochet realism). These were concept / style proofs only; product visuals are made from the approved patterns later (Restyle). This does NOT approve any crochet instructions. Next: the pattern content, which has its own review and ✅ Approve Patterns before production.`
        :`✅ Creative approved for #${p.product_id}. Build the customer files when you are ready (Stage 2, no API cost; or /produce ${p.product_id}).`,nextStepKeyboard(next));
      return {outcome:'creative_approved',productId:p.product_id};
    }
    if(a==='regen'){
      if(!await need('proofs_started'))return {outcome:'invalid_state'};
      // From SPEC_READY only after a restyle (the owner confirmed the paid proofs on the confirmation screen).
      const restyle=p.status==='SPEC_READY';
      await answer(restyle?'Generating 3 style proofs…':'Regenerating 3 proofs…');await clearKeyboard();
      return this.runProofs(p.product_id,actor,{reason:restyle?'restyle':'regenerate'});
    }
    if(a==='rstyle'){
      const problem=restyleProblem(p);
      if(problem){await answer('Not available.');await this.#say(chatId,`#${p.product_id} not restyled: ${problem}`);return {outcome:'restyle_refused',productId:p.product_id,problem};}
      await answer('Restyling…');await clearKeyboard();
      return this.runRestyle(p.product_id,actor);
    }
    if(a==='change'){
      if(p.status!=='AWAITING_CREATIVE_APPROVAL'){await answer(`Not available in state ${p.status}.`);return {outcome:'invalid_state'};}
      await this.store.save({...p,pending_input:'direction_feedback',review:{...p.review,nonce:newNonce()},updated_at:this.now().toISOString()});
      await answer('Send your change as a message.');await clearKeyboard();
      await this.#say(chatId,'Reply with a short instruction, e.g. "Make the characters rounder and backgrounds simpler." I will update the creative direction and make new proofs.');
      return {outcome:'awaiting_feedback',productId:p.product_id};
    }
    if(a==='retry'){
      if(!await need('retry'))return {outcome:'invalid_state'};
      const step=p.last_error?.step;
      await this.store.save(transition(p,'retry',{actor,now:this.now()}));
      await answer(`Retrying ${step}…`);await clearKeyboard();
      if(step==='ideation')return this.runIdeation(p.product_id,actor,{more:['IDEAS_READY','AWAITING_CONCEPT_SELECTION'].includes(p.resume_state)});
      if(step==='concept-previews')return this.runPreviews(p.product_id,actor);
      if(step==='production')return this.runProduction(p.product_id,actor);
      if(step==='marketing')return this.runMarketing(p.product_id,actor);
      if(step==='marketing-compare')return this.runHeroComparison(p.product_id,actor);
      if(step==='etsy')return this.runEtsyDraft(p.product_id,actor);
      // Never re-activates: reads Etsy and either confirms a completed publish or returns to review.
      if(step==='etsy-publish')return this.runEtsyPublishReconcile(p.product_id,actor);
      if(step==='etsy-refresh')return this.runEtsyRefresh(p.product_id,actor);
      if(step==='specification'){const s=await this.runSpecification(p.product_id,actor);return s.outcome==='spec_ready'?this.runProofs(p.product_id,actor,{reason:'initial'}):s;}
      if(step==='proofs')return this.runProofs(p.product_id,actor,{reason:'retry',resume:true});
      if(step==='book')return this.runBook(p.product_id,actor);   // resumes at the first missing page (or the pending page operation)
      if(step==='patterns')return this.runPatterns(p.product_id,actor,{mode:p.crochet?.generation?.mode??'generate'});   // resumes at the first undrafted pattern
      if(step==='restyle')return this.runRestyle(p.product_id,actor);   // free: no model or image call
      if(step==='visuals')return this.runCrochetVisuals(p.product_id,actor);   // resumes at the first missing image; finished images are kept
      if(step==='direction-change'){const fb=p.direction_feedback.findLast(f=>f.applied_in_version===null);return this.runDirectionChange(p.product_id,fb?.text??'',actor,{retry:true});}
      await this.#say(chatId,'Nothing to retry.');return {outcome:'nothing_to_do'};
    }
    await answer('Unsupported action.');return {outcome:'unparseable'};
  }

  // ---------- guarded steps ----------
  /** Run one step under a persisted lock. Failure -> FAILED with resume state; files kept. */
  async #guarded(productId,step,actor,body,{onError}={}){
    let p=await this.store.load(productId);
    try{p=acquireLock(p,step,this.now());}
    catch(err){if(err instanceof BusyError){await this.#say(p.request.chat_id,`Product #${productId} is already busy (${err.op}).`);return {outcome:'busy',productId};}throw err;}
    await this.store.save(p);
    await this.status?.start(p,step);
    const commit=async next=>{next=this.#flushUsage(next);await this.store.save(next);await this.status?.update(next);return next;};
    try{
      const done=this.#flushUsage(await body(p,commit));
      await this.store.save({...releaseLock(done),last_error:null});
      await this.status?.finish({...releaseLock(done),last_error:null});
      return {outcome:'ok',product:{...releaseLock(done),last_error:null}};
    }catch(err){
      const message=describeError(err);
      this.log(`#${productId} ${step} failed: ${message}`);
      // Output rejected by local validation after a successful (billed) call.
      if(err?.name==='InvalidModelOutputError')this.meter?.markLastRejected(message);
      let cur=this.#flushUsage(await this.store.load(productId));
      if(onError)cur=onError(cur,message);
      const resumeState=resumeStateOf(cur);
      cur={...releaseLock(cur),last_error:{step,message,at:this.now().toISOString(),retryable:err?.retryable!==false}};
      if(cur.status!=='FAILED')cur=transition(cur,'failed',{actor,now:this.now(),resumeState});
      await this.store.save(cur);
      await this.status?.finish(cur);
      await this.#sayAction(cur,failureText(cur),failureKeyboard(cur));
      return {outcome:'failed',productId,step,detail:message};
    }
  }
  async #rememberKeyboard(productId,messageId){
    const p=await this.store.load(productId);
    await this.store.save({...p,review:{...p.review,keyboard_message_ids:[...p.review.keyboard_message_ids,messageId].slice(-20)}});
  }

  async runIdeation(productId,actor,{more=false}={}){
    const r=await this.#guarded(productId,'ideation',actor,async(p,commit)=>{
      if(!more&&p.reference_files.length&&!p.visual_direction){
        const refs=await Promise.all(p.reference_files.map(async f=>({file:f.file,mime:f.mime_type,bytes:await this.store.readBytes(p,f.file)})));
        const a=await analyseReferences(this.ai,{requestText:p.request.text,references:refs});
        const analysis={...a.data,analysed_at:this.now().toISOString(),model:a.model,reference_files:refs.map(x=>x.file)};
        await this.store.writeJson(p,'creative/reference-analysis.json',analysis);
        p=await commit(p);
        const d=await createDirection(this.ai,{requestText:p.request.text,analysis:Object.fromEntries(Object.entries(analysis).filter(([k])=>!REFERENCE_OMIT.includes(k)))});
        const direction={...d.data,version:1,scope:'shared-style',source:'references',based_on_references:refs.map(x=>x.file),feedback_applied:null,created_at:this.now().toISOString()};
        await this.store.writeJson(p,DIRECTION_FILE,direction);
        p=await commit({...p,visual_direction:{file:DIRECTION_FILE,version:1,source:'references',summary:summaryOf(direction)}});
      }
      let direction=p.visual_direction?await this.store.readJson(p,DIRECTION_FILE):null;
      // A reference-based direction written before the style-only boundary may
      // carry one invented concept's content (Product #009: a fox with a parcel
      // in almost every field). Rebuild it ONCE from the saved analysis (1 text
      // call, no re-analysis, no image) so it cannot pin every new concept.
      if(isLegacyDirection(direction)&&direction.source==='references'&&await this.store.exists(p,ANALYSIS_FILE)){
        const analysis=await this.store.readJson(p,ANALYSIS_FILE), version=direction.version+1;
        this.log(`#${productId} creative direction v${direction.version} predates the style-only boundary: rebuilding v${version} from the saved reference analysis (1 text call, no image).`);
        const d=await createDirection(this.ai,{requestText:p.request.text,analysis:Object.fromEntries(Object.entries(analysis).filter(([k])=>!REFERENCE_OMIT.includes(k)))});
        await this.store.writeJson(p,`creative/creative-direction.v${pad(direction.version)}.json`,direction);
        direction={...d.data,version,scope:'shared-style',source:'references',based_on_references:direction.based_on_references,feedback_applied:null,created_at:this.now().toISOString()};
        await this.store.writeJson(p,DIRECTION_FILE,direction);
        p=await commit({...p,visual_direction:{file:DIRECTION_FILE,version,source:'references',summary:summaryOf(direction)}});
      }
      const c=await generateConcepts(this.ai,{requestText:p.request.text,direction,catalogue:await this.catalogue(),previousConcepts:p.concepts.batches.flatMap(b=>b.concepts)});
      const batch={batch:p.concepts.batches.length+1,generated_at:this.now().toISOString(),concepts:c.data.concepts};
      p={...p,concepts:{...p.concepts,batches:[...p.concepts.batches,batch]}};
      return transition(p,'ideas_ready',{actor,now:this.now()});
    });
    if(r.outcome!=='ok')return r;
    return this.runPreviews(productId,actor);
  }

  /**
   * Gate 1: one preview image per concept of the latest batch, stored in
   * concept-previews/batch-NN/. Idempotent: progress is saved after every
   * image, a failed/interrupted batch resumes with only its missing images,
   * and a finished batch is never regenerated.
   */
  async runPreviews(productId,actor){
    const markFailed=(cur,message)=>({...cur,concept_previews:{batches:(cur.concept_previews?.batches??[]).map(b=>b.status==='generating'?{...b,status:'failed',error:message,finished_at:this.now().toISOString()}:b)}});
    const r=await this.#guarded(productId,'concept-previews',actor,async(p,commit)=>{
      const cb=p.concepts.batches.at(-1);
      const direction=p.visual_direction?await this.store.readJson(p,DIRECTION_FILE):null;
      const analysis=await this.store.exists(p,ANALYSIS_FILE)?await this.store.readJson(p,ANALYSIS_FILE):null;
      const put=(prod,b)=>({...prod,concept_previews:{batches:[...(prod.concept_previews?.batches??[]).filter(x=>x.batch!==b.batch),b].sort((x,y)=>x.batch-y.batch)}});
      const existing=p.concept_previews?.batches.find(b=>b.batch===cb.batch);
      let rec=existing?{...existing,status:'generating',error:null,finished_at:null}
        :{batch:cb.batch,dir:`concept-previews/batch-${pad(cb.batch)}`,status:'generating',model:this.ai.imageModel,quality:this.ai.previewQuality??null,
          started_at:this.now().toISOString(),finished_at:null,images:[],error:null};
      const missing=cb.concepts.filter(c=>!rec.images.some(i=>i.concept_id===c.concept_id));
      const leak=leakedDirectionFields(direction,cb.concepts,p.request.text);
      if(leak.fields.length)this.log(`#${productId} direction fields left out of previews because they name concept content (${leak.terms.join(', ')}): ${leak.fields.join(', ')}.`);
      this.log(`#${productId} concept previews batch ${cb.batch}: ${missing.length} image call(s) to make (${this.ai.imageModel}, quality ${this.ai.previewQuality??'default'}); ${3-missing.length} already done.`);
      p=await commit(transition(put(p,rec),'previews_started',{actor,now:this.now()}));
      for(const c of missing){
        const file=`${rec.dir}/concept-${c.concept_id.toLowerCase()}.png`, size=imageSizeFor(this.ai.imageModel,orientationOf(c));
        const prompt=await buildPreviewPrompt({requestText:p.request.text,concept:c,siblings:cb.concepts.filter(x=>x!==c),direction,formatDirection:imageDirectionFor(c.product_format),
          analysis:analysis&&Object.fromEntries(Object.entries(analysis).filter(([k])=>!REFERENCE_OMIT.includes(k)))});
        const entry={concept_id:c.concept_id,file,prompt,model:this.ai.imageModel,size,quality:this.ai.previewQuality??null,generated_at:this.now().toISOString()};
        if(await this.store.exists(p,file)){
          // Written just before a crash but never recorded: reuse it, never pay twice.
          this.log(`#${productId} concept ${c.concept_id}: reusing ${file} found on disk (no image call).`);
          rec={...rec,images:[...rec.images,{...entry,adopted_after_restart:true}]};p=await commit(put(p,rec));continue;
        }
        this.log(`#${productId} concept ${c.concept_id}: generating preview (${size}, quality ${this.ai.previewQuality??'default'}): 1 image call.`);
        const img=await generatePreviewImage(this.ai,{prompt,size});
        await this.store.writeBytes(p,file,img.bytes);
        rec={...rec,images:[...rec.images,{...entry,model:img.model,generated_at:this.now().toISOString()}]};
        p=await commit(put(p,rec));
      }
      rec={...rec,status:'complete',finished_at:this.now().toISOString()};
      await this.store.writeJson(p,`${rec.dir}/metadata.json`,{product_id:p.product_id,batch:rec.batch,model:rec.model,quality:rec.quality,started_at:rec.started_at,finished_at:rec.finished_at,
        note:'Concept previews only: not final artwork, production files, marketing images or creative proofs.',
        images:rec.images.map(i=>({...i,source_concept:cb.concepts.find(c=>c.concept_id===i.concept_id)}))});
      return transition(put(p,rec),'previews_ready',{actor,now:this.now()});
    },{onError:markFailed});
    if(r.outcome!=='ok')return r;
    return this.#sendPreviews(productId);
  }

  /** Header, then each preview as its own captioned photo (unmistakably A/B/C), then the buttons. Sends only; never generates. */
  async #sendPreviews(productId){
    const p=await this.store.load(productId), chatId=p.request.chat_id, cb=p.concepts.batches.at(-1);
    const rec=p.concept_previews.batches.find(b=>b.batch===cb.batch);
    await this.#say(chatId,previewHeader(p));
    for(const c of cb.concepts){
      const im=rec.images.find(i=>i.concept_id===c.concept_id);
      await this.#quiet(async()=>this.telegram.sendPhoto({chatId:String(chatId),bytes:await this.store.readBytes(p,im.file),
        fileName:`${p.product_id}-batch-${pad(cb.batch)}-concept-${c.concept_id.toLowerCase()}.png`,caption:previewCaption(c)}));
    }
    await this.#sayAction(p,choosePrompt(cb.batch,this.maxConceptBatches),conceptKeyboard(p,{canRegenerate:p.concepts.batches.length<this.maxConceptBatches}));
    return {outcome:'awaiting_concept_selection',productId,batch:cb.batch};
  }

  async runSpecification(productId,actor){
    const r=await this.#guarded(productId,'specification',actor,async(p,commit)=>{
      const sel=p.concepts.selected, concept=p.concepts.batches.find(b=>b.batch===sel.batch).concepts.find(c=>c.concept_id===sel.concept_id);
      if(!p.visual_direction){
        const d=await createDirection(this.ai,{requestText:p.request.text,concept});
        const direction={...d.data,version:1,scope:'shared-style',source:'concept',based_on_references:[],feedback_applied:null,created_at:this.now().toISOString()};
        await this.store.writeJson(p,DIRECTION_FILE,direction);
        p=await commit({...p,visual_direction:{file:DIRECTION_FILE,version:1,source:'concept',summary:summaryOf(direction)}});
      }
      const direction=await this.store.readJson(p,DIRECTION_FILE);
      const s=await generateSpecification(this.ai,{requestText:p.request.text,concept,direction});
      const spec=s.data;
      p={...p,name:spec.name,slug:spec.slug,season:spec.season,product_type:spec.product_type,
        target_customer:spec.target_customer,page_count:spec.page_count,canvas:spec.canvas,pages:spec.pages,
        proofs:{...p.proofs,selected_pages:selectProofPages(spec.pages)}};
      // save() validates the complete product.json against product.schema.json.
      return transition(p,'spec_ready',{actor,now:this.now()});
    });
    return r.outcome==='ok'?{outcome:'spec_ready',productId}:r;
  }

  async runProofs(productId,actor,{reason,resume=false}){
    const markFailed=(cur,message)=>({...cur,proofs:{...cur.proofs,attempts:cur.proofs.attempts.map(a=>a.status==='generating'?{...a,status:'failed',error:message,finished_at:this.now().toISOString()}:a)}});
    const r=await this.#guarded(productId,'proofs',actor,async(p,commit)=>{
      const direction=await this.store.readJson(p,DIRECTION_FILE);
      // Size follows the product's orientation: a landscape card is never squeezed into portrait.
      const size=imageSizeFor(this.ai.imageModel,p.canvas.orientation);
      const last=p.proofs.attempts.at(-1);
      // RETRY continues a failed/interrupted attempt (only missing images are
      // generated); REGENERATE always starts a new attempt. Nothing is overwritten.
      let attempt=resume&&last&&['failed','interrupted'].includes(last.status)?{...last,status:'generating',error:null,finished_at:null}
        :{attempt:(last?.attempt??0)+1,dir:`proofs/attempt-${pad((last?.attempt??0)+1)}`,reason,direction_version:direction.version,
          // Crochet: before the patterns these are concept/style proofs; after Restyle, traceable product visuals (ADR-047).
          ...(needsPatterns(p)?{purpose:p.restyles?.length?'traceable-product':'concept-style'}:{}),
          started_at:this.now().toISOString(),finished_at:null,status:'generating',images:[],error:null};
      const put=(prod,att)=>({...prod,proofs:{...prod.proofs,attempts:[...prod.proofs.attempts.filter(a=>a.attempt!==att.attempt),att].sort((x,y)=>x.attempt-y.attempt)}});
      p=await commit(transition(put(p,attempt),'proofs_started',{actor,now:this.now()}));
      for(const [i,sel] of p.proofs.selected_pages.entries()){
        const file=`${attempt.dir}/proof-${pad(i+1)}.png`;
        if(attempt.images.some(im=>im.file===file))continue;
        const page=p.pages.find(pg=>pg.page_number===sel.page_number);
        const prompt=await buildImagePrompt({direction,product:p,page,role:sel.role});
        const img=await generateProofImage(this.ai,{prompt,size});
        await this.store.writeBytes(p,file,img.bytes);
        attempt={...attempt,images:[...attempt.images,{file,page_number:page.page_number,prompt,model:img.model,size,generated_at:this.now().toISOString()}]};
        p=await commit(put(p,attempt));
      }
      attempt={...attempt,status:'complete',finished_at:this.now().toISOString()};
      await this.store.writeJson(p,`${attempt.dir}/metadata.json`,{product_id:p.product_id,...attempt,selected_pages:p.proofs.selected_pages});
      return transition(put(p,attempt),'proofs_ready',{actor,now:this.now()});
    },{onError:markFailed});
    if(r.outcome!=='ok')return r;
    const p=r.product, attempt=p.proofs.attempts.at(-1), chatId=p.request.chat_id;
    const direction=await this.store.readJson(p,DIRECTION_FILE);
    const items=await Promise.all(attempt.images.map(async(im,i)=>({bytes:await this.store.readBytes(p,im.file),fileName:`${p.product_id}-attempt-${pad(attempt.attempt)}-proof-${pad(i+1)}.png`,
      caption:`#${p.product_id} proof ${i+1}/3 — ${proofLabel(p.proofs.selected_pages[Number(/proof-(\d+)\.png$/.exec(im.file)[1])-1],p.pages.find(pg=>pg.page_number===im.page_number))}`})));
    await this.#quiet(()=>this.telegram.sendPhotoAlbum(chatId,items));
    await this.#sayAction(p,proofSummary(p,direction,attempt),proofKeyboard(p));
    return {outcome:'awaiting_creative_approval',productId,attempt:attempt.attempt};
  }

  async runDirectionChange(productId,feedback,actor,{retry=false}={}){
    if(!feedback){const p=await this.store.load(productId);await this.#say(p.request.chat_id,'Feedback was empty; nothing changed.');return {outcome:'nothing_to_do'};}
    const r=await this.#guarded(productId,'direction-change',actor,async(p,commit)=>{
      if(!retry)p=await commit({...p,pending_input:null,direction_feedback:[...p.direction_feedback,{text:feedback,at:this.now().toISOString(),by:actor,applied_in_version:null}]});
      const previous=await this.store.readJson(p,DIRECTION_FILE);
      const analysis=await this.store.exists(p,'creative/reference-analysis.json')?await this.store.readJson(p,'creative/reference-analysis.json'):null;
      const sel=p.concepts.selected, concept=p.concepts.batches.find(b=>b.batch===sel.batch).concepts.find(c=>c.concept_id===sel.concept_id);
      const d=await createDirection(this.ai,{requestText:p.request.text,analysis:analysis&&Object.fromEntries(Object.entries(analysis).filter(([k])=>!REFERENCE_OMIT.includes(k))),concept,previous,feedback});
      const version=previous.version+1;
      const direction={...d.data,version,scope:'shared-style',source:'feedback',based_on_references:previous.based_on_references,feedback_applied:feedback,created_at:this.now().toISOString()};
      await this.store.writeJson(p,`creative/creative-direction.v${pad(previous.version)}.json`,previous);
      await this.store.writeJson(p,DIRECTION_FILE,direction);
      const fb=p.direction_feedback.map((f,i,all)=>i===all.findLastIndex(x=>x.applied_in_version===null)?{...f,applied_in_version:version}:f);
      return {...p,pending_input:null,direction_feedback:fb,
        visual_direction:{file:DIRECTION_FILE,version,source:'feedback',summary:summaryOf(direction)}};
    });
    if(r.outcome!=='ok')return r;
    await this.#say(r.product.request.chat_id,`Creative direction updated to v${r.product.visual_direction.version}. Generating 3 new proofs…`);
    return this.runProofs(productId,actor,{reason:'direction-change'});
  }

  /**
   * RESTYLE (crochet, ADR-044). No model or image call. Archives the current
   * direction, page briefs and approval record (the proof images stay in
   * their attempt folders, recorded in the archive with their SHA-256), writes
   * the restyled direction and page briefs (from the APPROVED pattern source),
   * clears only the creative approval and returns to SPEC_READY. The approved
   * patterns are not touched. New proofs need the owner's paid confirmation.
   */
  async runRestyle(productId,actor){
    const r=await this.#guarded(productId,'restyle',actor,async p=>{
      const stop=m=>{throw Object.assign(new Error(m),{retryable:false});};
      const problem=restyleProblem({...p,lock:null});
      if(problem)stop(problem);
      const bytes=await this.store.readBytes(p,PATTERN_SOURCE);
      if(sha256(bytes)!==p.crochet.approval.source_sha256)stop(`${PATTERN_SOURCE} changed since the patterns were approved; restyle reads only the approved source.`);
      const bundle=JSON.parse(bytes), plan=await this.store.exists(p,PATTERN_PLAN)?await this.store.readJson(p,PATTERN_PLAN):null;
      const values=await this.store.exists(p,RESTYLE_VALUES_FILE)?await this.store.readJson(p,RESTYLE_VALUES_FILE):{};
      const previous=await this.store.readJson(p,DIRECTION_FILE), now=this.now().toISOString();
      const badValues=restyleValuesProblems(values);
      if(badValues.length)stop(badValues.join('; '));
      // Every crochet piece in the new briefs comes from a visual spec checked against the approved patterns (ADR-046).
      let visuals;try{visuals=restyleVisualSpecs({bundle,plan,values});}catch(err){stop(err.message);}
      const failed=['cover','overview','detail'].filter(k=>visuals[k].status!=='internally_checked');
      if(failed.length)stop(`pattern <-> visual check failed (${failed.map(k=>`${k}: ${visuals[k].problems.map(x=>`${x.item} ${x.attribute}: ${x.reason}`).join(', ')}`).join('; ')})`);
      const direction=restyledDirection(previous,{values,now}), pages=restyledPages(p.pages,{bundle,values,visuals});
      const specsDoc={version:1,generated_at:now,patterns_sha256:p.crochet.approval.source_sha256,visual_match_status:'internally_checked',
        note:'Derived from the written patterns and checked against them. Not physically verified: nobody has crocheted these pieces for this record.',
        combination:visuals.combination,fingerprints:visuals.fingerprints,specs:{cover:visuals.cover,overview:visuals.overview,detail:visuals.detail}};
      assertValid(await loadSchema('creative-direction'),direction,'restyled creative direction');
      const conflicts=restyleConflicts({direction,pages,canvas:p.canvas});
      if(conflicts.length)stop(`superseded wording would reach the new proofs: ${conflicts.slice(0,4).map(c=>`${c.where} (${c.phrase})`).join('; ')}`);
      const archive=restyleArchiveDir(now.replace(/[:.]/g,'-'));
      const next=transition({...restyledProduct(p,{direction,pages,archive,actor,now,visualSpecs:{file:VISUAL_SPECS_FILE,status:specsDoc.visual_match_status}}),
        visual_direction:{file:DIRECTION_FILE,version:direction.version,source:'restyle',summary:summaryOf(direction)}},'restyle_started',{actor,now:this.now()});
      // Checked before any file is written, so a refused product never leaves a half-applied restyle.
      const errors=validateSchema(await loadSchema('product'),next);
      if(errors.length)stop(`restyled product.json would be invalid: ${errors.slice(0,3).join('; ')}`);
      const attempt=p.proofs.attempts.find(a=>a.attempt===next.restyles.at(-1).previous.approved_attempt);
      const proofs=await Promise.all((attempt?.images??[]).map(async im=>({file:im.file,page_number:im.page_number,
        sha256:await this.store.exists(p,im.file)?sha256(await this.store.readBytes(p,im.file)):null})));
      await this.store.writeJson(p,`${archive}/creative-direction.v${pad(previous.version)}.json`,previous);
      await this.store.writeJson(p,`${archive}/pages.json`,p.pages);
      await this.store.writeJson(p,`${archive}/approval.json`,{reason:RESTYLE_REASON,invalidated_at:now,by:actor,creative_approved_at:p.creative_approved_at,
        direction_version:previous.version,approved_attempt:attempt?.attempt??null,selected_pages:p.proofs.selected_pages,proofs,
        note:'The proof images stay in their attempt folder; they are no longer the approved style. Pattern approval is unchanged.',
        patterns:{source_sha256:p.crochet.approval.source_sha256,pattern_count:p.crochet.approval.pattern_count}});
      await this.store.writeJson(p,`${archive}/restyle-values.json`,values);
      if(await this.store.exists(p,VISUAL_SPECS_FILE))await this.store.writeJson(p,`${archive}/visual-specs.json`,await this.store.readJson(p,VISUAL_SPECS_FILE));
      await this.store.writeJson(p,VISUAL_SPECS_FILE,specsDoc);
      await this.store.writeJson(p,`creative/creative-direction.v${pad(previous.version)}.json`,previous);
      await this.store.writeJson(p,DIRECTION_FILE,direction);
      this.log(`#${productId} restyled: direction v${previous.version} -> v${direction.version}; style approval cleared; archived to ${archive}; patterns unchanged.`);
      return next;
    });
    if(r.outcome!=='ok')return r;
    const p=r.product;
    await this.#say(p.request.chat_id,`🎨 #${p.product_id} restyled. Current proofs archived; patterns unchanged.\nGenerate the new style proofs when you are ready.`,
      {inline_keyboard:[[{text:'🎨 Generate Style Proofs',callback_data:menuData('ask',p.product_id,'regen')}],[{text:'📦 Product',callback_data:menuData('prod',p.product_id)}]]});
    return {outcome:'restyled',productId,archive:p.restyles.at(-1).archive};
  }

  // ---------- Stage 1 crochet visual set (ADR-063) ----------
  /**
   * Hero + one preview per approved pattern, from code-built briefs bound to the approved patterns' fingerprints.
   * Free and idempotent until the first missing image: briefs are persisted first; a pending restyle archives
   * exactly its targets (kept in visuals/crochet/history/). Then ONE paid image call per missing image, each
   * saved and committed before the next, so a failure or restart never pays for a finished image twice (an
   * image written just before a crash is adopted, not regenerated). Then the free deterministic QC, the
   * visual manifest, and the owner's review. Patterns, fingerprints and their approval are never changed.
   */
  async runCrochetVisuals(productId,actor){
    let working=null;
    const markFailed=(cur,message)=>!cur.crochet_visuals?cur:{...cur,crochet_visuals:{...cur.crochet_visuals,
      generation:cur.crochet_visuals.generation?{...cur.crochet_visuals.generation,status:'failed',finished_at:this.now().toISOString(),error:message.slice(0,500)}:null,
      assets:cur.crochet_visuals.assets.map(e=>e.id===working&&e.status!=='generated'?{...e,status:'failed',error:message.slice(0,500)}:e)}};
    const r=await this.#guarded(productId,'visuals',actor,async(p,commit)=>{
      const stop=m=>{throw Object.assign(new Error(m),{retryable:false});};
      if(!visualsApplicable(p))stop('The crochet visual set needs a crochet pattern bundle with approved patterns.');
      if(!['CREATIVE_APPROVED','AWAITING_VISUALS_APPROVAL'].includes(p.status))stop(`The crochet visual set needs the approved style; #${productId} is ${p.status}.`);
      const bytes=await this.store.readBytes(p,PATTERN_SOURCE);
      if(sha256(bytes)!==p.crochet.approval.source_sha256)stop(`${PATTERN_SOURCE} changed since the patterns were approved; the visual set reads only the approved source.`);
      const bundle=JSON.parse(bytes);
      p=await commit(await this.#prepareVisuals(p,bundle,actor));   // briefs persisted before any image
      const briefs=await this.store.readJson(p,VISUAL_BRIEFS);
      p=await commit(transition({...p,crochet_visuals:{...p.crochet_visuals,approval:null,qc:null,manifest:null,
        generation:{status:'generating',started_at:this.now().toISOString(),finished_at:null,error:null}}},'visuals_started',{actor,now:this.now()}));
      if(p.crochet_visuals.pending_op)p=await commit(await this.#applyVisualRestyle(p,actor));
      const todo=p.crochet_visuals.assets.filter(e=>e.status!=='generated').map(e=>e.id);
      this.log(`#${productId} crochet visuals: ${todo.length} image call(s) to make; ${p.crochet_visuals.assets.length-todo.length} image(s) kept.`);
      for(const id of todo){working=id;p=await commit(await this.#visualImage(p,{bundle,briefs,id}));}
      working=null;
      // Deterministic QC (free), then the manifest the owner reviews and approves.
      const qc=await visualSetQc({briefs,assets:p.crochet_visuals.assets,bundle,readBytes:rel=>this.store.readBytes(p,rel)});
      const at=this.now().toISOString(), mBytes=Buffer.from(JSON.stringify(this.#visualManifest(p,{bundle,briefs,qc,at}),null,2)+'\n');
      await this.store.writeBytes(p,VISUAL_MANIFEST,mBytes);
      this.log(`#${productId} crochet visual QC: ${qc.passed?'PASS':'FAIL'}${qc.problems.length?` (${qc.problems.slice(0,3).join('; ')})`:''}.`);
      return transition({...p,crochet_visuals:{...p.crochet_visuals,generation:{...p.crochet_visuals.generation,status:'complete',finished_at:at},
        qc:{passed:qc.passed,at,problems:qc.problems,warnings:qc.warnings},manifest:{file:VISUAL_MANIFEST,sha256:sha256(mBytes)}}},'visuals_ready',{actor,now:this.now()});
    },{onError:markFailed});
    if(r.outcome!=='ok')return r;
    return this.#sendVisualsReview(productId,{images:true});
  }
  /** Briefs (free, deterministic): written once; rebuilt only when nothing generated would be orphaned (fresh set, or a pending restyle of all). */
  async #prepareVisuals(p,bundle,actor){
    const cv=p.crochet_visuals, plan=await this.store.exists(p,PATTERN_PLAN)?await this.store.readJson(p,PATTERN_PLAN):null;
    const build=()=>visualBriefs({bundle,plan,product:{product_id:p.product_id,name:p.name,season:p.season}});
    const record=async(briefs,base)=>{
      const b=Buffer.from(JSON.stringify(briefs,null,2)+'\n');
      await this.store.writeBytes(p,VISUAL_BRIEFS,b);
      return {...p,crochet_visuals:{version:1,briefs:{file:VISUAL_BRIEFS,sha256:sha256(b)},patterns_sha256:p.crochet.approval.source_sha256,
        model:this.ai.imageModel,quality:this.ai.imageQuality??null,
        sizes:{hero:imageSizeFor(this.ai.imageModel,VISUAL_ORIENTATION.hero),'pattern-preview':imageSizeFor(this.ai.imageModel,VISUAL_ORIENTATION['pattern-preview'])},
        assets:emptyAssets(bundle),generation:null,qc:null,manifest:null,pending_op:null,approval:null,history:[],...base}};
    };
    if(!cv)return record(build(),{});
    const onDisk=await this.store.readBytes(p,VISUAL_BRIEFS).catch(()=>null);
    if(!onDisk||sha256(onDisk)!==cv.briefs.sha256)throw Object.assign(new Error(`${VISUAL_BRIEFS} is missing or changed since it was made; the visual briefs are never rewritten silently.`),{retryable:false});
    const stale=visualSetProblems({briefs:JSON.parse(onDisk),bundle});
    if(!stale.length)return p;
    // The approved patterns changed since this set was planned (re-approved source): never mix old and new briefs.
    if(cv.pending_op?.op!=='restyle-all'&&cv.assets.some(e=>e.status==='generated'))
      throw Object.assign(new Error(`the approved patterns changed since this visual set was planned (${stale[0]}). Use 🔁 Restyle All Visuals to plan and make it again.`),{retryable:false});
    const archived=[];
    for(const e of cv.assets.filter(x=>x.status==='generated'))archived.push(...await this.#archiveVisual(p,e));
    this.log(`#${p.product_id} crochet visuals re-planned for the current approved patterns; ${archived.length} image(s) archived.`);
    return record(build(),{history:[...cv.history,{at:this.now().toISOString(),by:actor,event:'restyle-all',targets:cv.assets.map(e=>e.id),archived}]});
  }
  /** A pending restyle: archive exactly its targets (kept, never deleted) and mark them missing, in one commit. */
  async #applyVisualRestyle(p,actor){
    const cv=p.crochet_visuals, op=cv.pending_op, archived=[];
    const assets=[];
    for(const e of cv.assets){
      if(!op.targets.includes(e.id)){assets.push(e);continue;}
      archived.push(...await this.#archiveVisual(p,e));
      assets.push({...e,status:'missing',sha256:null,width:null,height:null,size:null,model:null,generated_at:null,prompt_sha256:null,brief_sha256:null,fingerprint_sha256:null,error:null,
        revision:e.status==='generated'?e.revision+1:e.revision});
    }
    this.log(`#${p.product_id} crochet visuals ${op.op}: ${op.targets.length} image(s) to regenerate; ${archived.length} archived.`);
    return {...p,crochet_visuals:{...cv,assets,pending_op:null,history:[...cv.history,{at:this.now().toISOString(),by:actor,event:op.op,targets:op.targets,archived}]}};
  }
  /** Move a replaced visual to visuals/crochet/history/ (never deleted). */
  async #archiveVisual(p,e){
    const dir=this.store.dirOf(p), from=joinPath(dir,...e.file.split('/'));
    if(!await accessFs(from).then(()=>true,()=>false))return [];
    let v=e.revision;while(await accessFs(joinPath(dir,...historyFile(e.id,v).split('/'))).then(()=>true,()=>false))v++;
    await mkdir(dirname(joinPath(dir,...historyFile(e.id,v).split('/'))),{recursive:true});
    await rename(from,joinPath(dir,...historyFile(e.id,v).split('/')));
    return [historyFile(e.id,v)];
  }
  /** One image (1 metered image call, or adopting a file written just before a crash) and the updated product. */
  async #visualImage(p,{bundle,briefs,id}){
    const cv=p.crochet_visuals, e=cv.assets.find(x=>x.id===id);
    const brief=e.role==='hero'?briefs.hero:briefs.previews.find(b=>b.pattern_id===e.pattern_id);
    const prompt=promptFor(brief,{bundle}), size=cv.sizes[e.role];
    const onDisk=await this.store.exists(p,e.file)?await this.store.readBytes(p,e.file):null;
    let bytes, model, adopted=false;
    if(onDisk&&pngSize(onDisk)){
      bytes=onDisk;model=cv.model;adopted=true;
      this.log(`#${p.product_id} crochet visuals ${id}: adopting ${e.file} found on disk (no image call).`);
    }else{
      this.log(`#${p.product_id} crochet visuals ${id}: 1 image call (${size}).`);
      const img=await generateVisual(this.ai,{brief,prompt,size});
      if(!pngSize(img.bytes))throw Object.assign(new Error(`${id}: the image model did not return a PNG`),{name:'InvalidModelOutputError',retryable:true});
      bytes=img.bytes;model=img.model;
      await this.store.writeBytes(p,e.file,bytes);
    }
    const px=pngSize(bytes), at=this.now().toISOString();
    await this.store.writeJson(p,`visuals/crochet/prompts/${id}-r${pad(e.revision)}.json`,{id,role:e.role,pattern_id:e.pattern_id,revision:e.revision,model,size,
      quality:cv.quality,brief_sha256:canonSha(brief),generated_at:at,prompt});
    const {adopted_after_restart,...rest}=e;
    const entry={...rest,status:'generated',sha256:sha256(bytes),width:px.width,height:px.height,size,model,generated_at:at,prompt_sha256:sha256(Buffer.from(prompt)),
      brief_sha256:canonSha(brief),fingerprint_sha256:brief.kind==='hero'?canonSha(brief.crochet_objects.map(o=>o.fingerprint_sha256)):brief.fingerprint_sha256,error:null,
      ...(adopted?{adopted_after_restart:true}:{})};
    return {...p,crochet_visuals:{...cv,assets:cv.assets.map(x=>x.id===id?entry:x)}};
  }
  /** The visual manifest: every asset with its role, pattern, fingerprint, brief/prompt hashes, generation metadata and file hash. */
  #visualManifest(p,{bundle,briefs,qc,at}){
    const cv=p.crochet_visuals;
    return {version:VISUAL_SET_VERSION,product_id:p.product_id,product_name:p.name,created_at:at,
      generator:{stage:'Stage 1 crochet visual set (ADR-063)',code:`visual-set v${VISUAL_SET_VERSION}`,provider:'openai',model:cv.model,quality:cv.quality,sizes:cv.sizes},
      patterns_sha256:p.crochet.approval.source_sha256,patterns:{file:PATTERN_SOURCE,sha256:p.crochet.approval.source_sha256},
      fingerprints:briefs.fingerprints,briefs:{file:VISUAL_BRIEFS,sha256:cv.briefs.sha256,hero:briefs.hero,previews:briefs.previews},
      assets:cv.assets.map(e=>({id:e.id,role:e.role,pattern_id:e.pattern_id,pattern_name:e.pattern_id?patternName(p,e.pattern_id):null,file:e.file,sha256:e.sha256,width:e.width,height:e.height,
        size:e.size,model:e.model,generated_at:e.generated_at,revision:e.revision,brief_sha256:e.brief_sha256,prompt_sha256:e.prompt_sha256,fingerprint_sha256:e.fingerprint_sha256,
        ...(e.adopted_after_restart?{adopted_after_restart:true}:{})})),
      qc:{...qc,at},
      provenance:{kind:'illustration',photographic_evidence:false,
        note:'AI-generated illustrative renderings of finished items made from the patterns. Not photographs, not test-crocheted. The pattern instructions remain AI-assisted and unverified unless separately test-crocheted.'},
      approval:null};
  }
  /** Why APPROVE VISUAL SET must be refused, or null. Re-reads every file: approval binds to exactly what was checked. */
  async #visualsApprovalProblem(p){
    const cv=p.crochet_visuals;
    if(!cv?.qc)return 'the visual QC has not run.';
    if(!cv.qc.passed)return `Visual QC failed (${cv.qc.problems.slice(0,2).join('; ')}). Restyle those images first.`;
    if(cv.pending_op)return 'a restyle is still pending.';
    const m=await this.store.readBytes(p,VISUAL_MANIFEST).catch(()=>null);
    if(!m||sha256(m)!==cv.manifest?.sha256)return `${VISUAL_MANIFEST} changed since the review.`;
    for(const e of cv.assets){
      if(e.status!=='generated')return `${e.id} has no image.`;
      const b=await this.store.readBytes(p,e.file).catch(()=>null);
      if(!b||sha256(b)!==e.sha256)return `${e.file} changed since the review.`;
    }
    return null;
  }
  /** Which visual-set action the product's CURRENT state allows (the same rule for the confirmation and the press). */
  #visualActionOk(p,a){
    if(p.lock||!visualsApplicable(p))return false;
    if(a==='vapprove')return p.status==='AWAITING_VISUALS_APPROVAL';
    if(a==='vstop')return p.status==='AWAITING_VISUALS_APPROVAL'||(p.status==='FAILED'&&inVisuals(p));
    if(!canStartVisuals(p))return false;
    if(a==='vgen')return p.status!=='AWAITING_VISUALS_APPROVAL'&&!visualsApproved(p);
    if(!p.crochet_visuals)return false;
    const n=/^vrp(?:\.)?(\d{2})$/.exec(a)?.[1];
    return a==='vrh'||a==='vra'||(n!==undefined&&restyleTargets(p,'restyle-preview',Number(n)).length===1);
  }
  /** The review: every image (hero first) with its label, then the QC summary and the buttons. Sends only. */
  async #sendVisualsReview(productId,{images=true}={}){
    const p=await this.store.load(productId), chatId=p.request.chat_id, cv=p.crochet_visuals;
    if(images){
      const pv=cv.assets.filter(e=>e.role==='pattern-preview');
      const items=await Promise.all(cv.assets.filter(e=>e.status==='generated').map(async e=>({bytes:await this.store.readBytes(p,e.file),fileName:`${p.product_id}-${e.file.split('/').at(-1)}`,
        caption:e.id===HERO_ASSET?`#${p.product_id} · Collection hero (illustration)`:`#${p.product_id} · ${pad(pv.indexOf(e)+1)} ${patternName(p,e.pattern_id)} · finished-item preview (illustration)`})));
      for(let i=0;i<items.length;i+=10){const c=items.slice(i,i+10);await this.#quiet(()=>c.length>1?this.telegram.sendPhotoAlbum(String(chatId),c):this.telegram.sendPhoto({chatId:String(chatId),...c[0]}));}
    }
    await this.#sayAction(p,visualsReviewText(p,{qc:cv.qc}),visualsReviewKeyboard(p,{qc:cv.qc}));
    return {outcome:'awaiting_visuals_approval',productId,qcPassed:cv.qc.passed};
  }

  // ---------- Stage 1 crochet pattern content (ADR-041) ----------
  /**
   * mode 'generate': plan the collection once (1 text call), then draft each
   * pattern still to draft (1 text call each), or the pending revise /
   * redraft-invalid operation. Each draft is saved before the next call, so a
   * failure or restart never pays for a finished pattern twice. The drafts are
   * assembled into crochet/patterns.json (an earlier different source is
   * archived to crochet/history/).
   * mode 'validate': read crochet/patterns.json as it is (owner-authored or
   * hand-edited): no model call.
   * Both then run the production validator and send the owner's review.
   * Nothing is repaired: a failing pattern goes back to redraft or revision.
   */
  async runPatterns(productId,actor,{mode='generate'}={}){
    const markFailed=(cur,message)=>cur.crochet?.generation?{...cur,crochet:{...cur.crochet,generation:{...cur.crochet.generation,status:'failed',finished_at:this.now().toISOString(),error:message.slice(0,500)}}}:cur;
    const r=await this.#guarded(productId,'patterns',actor,async(p,commit)=>{
      const stop=m=>{throw Object.assign(new Error(m),{retryable:false});}, at=()=>this.now().toISOString();
      if(!needsPatterns(p))stop(`#${productId} is not a crochet pattern bundle.`);
      if(patternsApproved(p))stop(`#${productId}'s patterns are already approved.`);
      if(!['CREATIVE_APPROVED','AWAITING_PATTERN_APPROVAL'].includes(p.status))stop(`Pattern content needs the approved style; #${productId} is ${p.status}.`);
      let c=p.crochet??emptyCrochet();
      if(mode==='generate'&&!c.brief)stop('Set the number of patterns first (🧶 Set Pattern Count & Terms).');
      p=await commit(transition({...p,pending_input:null,crochet:{...c,generation:{status:'generating',mode,started_at:at(),finished_at:null,error:null}}},'patterns_started',{actor,now:this.now()}));
      c=p.crochet;
      let bytes;
      if(mode==='validate'){
        if(!await this.store.exists(p,PATTERN_SOURCE))stop(`${PATTERN_SOURCE} is missing.`);
        bytes=await this.store.readBytes(p,PATTERN_SOURCE);
      }else{
        const sel=p.concepts.selected, concept=p.concepts.batches.find(b=>b.batch===sel.batch)?.concepts.find(x=>x.concept_id===sel.concept_id);
        const direction=await this.store.exists(p,DIRECTION_FILE)?await this.store.readJson(p,DIRECTION_FILE):null;
        let plan;
        if(!c.plan){
          this.log(`#${productId} crochet: planning ${c.brief.pattern_count} patterns (1 text call).`);
          // ADR-068: a rejected plan is kept (diagnosis only, never used as the plan) with every problem, so nothing is lost to truncation.
          const g=await generatePatternPlan(this.ai,{product:p,concept,brief:c.brief,direction}).catch(async e=>{
            if(e.draft)await this.store.writeJson(p,'crochet/plan.rejected.json',{note:'A paid plan answer the plan checks rejected. Diagnosis only; never used as the plan.',
              rejected_at:at(),brief:c.brief,problems:e.draft.problems,model:e.draft.model,plan:e.draft.data});
            throw e;});
          if(g.normalized)this.log(`#${productId} crochet plan: removed ${g.normalized[0].removed.length} exact duplicate pattern(s) (${g.normalized[0].from} -> ${g.normalized[0].to}): ${g.normalized[0].removed.map(x=>x.pattern_id).join(', ')}.`);
          plan={...g.data,model:g.model,generated_at:at()};
          const pb=Buffer.from(JSON.stringify(plan,null,2)+'\n');
          await this.store.writeBytes(p,PATTERN_PLAN,pb);
          p=await commit({...p,crochet:{...c,plan:{file:PATTERN_PLAN,sha256:sha256(pb)},
            patterns:plan.patterns.map(e=>({pattern_id:e.pattern_id,name:e.name,status:'planned',revision:0,file:null,sha256:null,errors:[],model:null,generated_at:null}))}});
          c=p.crochet;
        }else{
          const pb=await this.store.readBytes(p,PATTERN_PLAN);
          if(sha256(pb)!==c.plan.sha256)stop(`${PATTERN_PLAN} changed since it was made; the plan is never rewritten silently. Reject the patterns to start again.`);
          plan=JSON.parse(pb);
        }
        const op=c.pending;
        const todo=op?.op==='revise'?[op.pattern_id]:op?.op==='regenerate-invalid'?c.patterns.filter(e=>e.status==='invalid').map(e=>e.pattern_id)
          :c.patterns.filter(e=>!e.file).map(e=>e.pattern_id);
        this.log(`#${productId} crochet: ${todo.length} pattern text call(s) to make; ${c.patterns.length-todo.length} draft(s) kept.`);
        for(const id of todo){
          const e=c.patterns.find(x=>x.pattern_id===id), entry=plan.patterns.find(x=>x.pattern_id===id);
          const g=await generatePattern(this.ai,{entry,plan,brief:c.brief,revision:op?.op==='revise'?op.instruction:null,previousErrors:op?.op==='regenerate-invalid'?e.errors:[]});
          if(g.normalized)this.log(`#${productId} crochet ${id}: repaired ${g.normalized.map(n=>n.parts!=null?`${n.field}[${n.index}] (${n.length} chars) split into ${n.parts}`
            :`${n.field} (${n.length} chars${n.from!=null?`, was "${n.from}"`:''}) -> ${n.to}${n.moved_to_notes?`, wording moved to notes`:''}`).join(', ')}; step text untouched.`);
          const db=Buffer.from(JSON.stringify(fromModelPattern(entry,g.data),null,2)+'\n'), file=draftFile(id);
          // The replaced draft is kept, never deleted.
          if(e.file&&await this.store.exists(p,e.file))await this.store.writeBytes(p,`crochet/history/${id}-r${pad(e.revision)}.json`,await this.store.readBytes(p,e.file));
          await this.store.writeBytes(p,file,db);
          p=await commit({...p,crochet:{...c,patterns:c.patterns.map(x=>x.pattern_id===id?{...x,status:'generated',revision:x.revision+1,file,sha256:sha256(db),errors:[],model:g.model,generated_at:at()}:x)}});
          c=p.crochet;
        }
        const drafts=[];
        for(const e of c.patterns){
          const db=await this.store.readBytes(p,e.file);
          if(sha256(db)!==e.sha256)stop(`${e.file} changed since it was drafted. Edit ${PATTERN_SOURCE} and use Re-validate instead, or reject the patterns.`);
          drafts.push(JSON.parse(db));
        }
        bytes=Buffer.from(JSON.stringify(assembleBundle({product:p,brief:c.brief,plan,drafts,model:plan.model}),null,2)+'\n');
        if(await this.store.exists(p,PATTERN_SOURCE)){const old=await this.store.readBytes(p,PATTERN_SOURCE);if(!old.equals(bytes))await this.store.writeBytes(p,`crochet/history/patterns-${sha256(old).slice(0,12)}.json`,old);}
        await this.store.writeBytes(p,PATTERN_SOURCE,bytes);
      }
      // The production validator decides; the brief's count is checked too.
      let bundle=null;try{bundle=JSON.parse(bytes);}catch{}
      const v=bundle?validateCandidate(bundle):{ok:false,errors:[`${PATTERN_SOURCE} is not valid JSON`],byPattern:new Map()};
      if(bundle&&c.brief&&Array.isArray(bundle.patterns)&&bundle.patterns.length!==c.brief.pattern_count){v.ok=false;v.errors.push(`$.patterns: ${bundle.patterns.length} patterns; the brief asks for ${c.brief.pattern_count}`);}
      // Printable characters (ADR-052): the document fonts' own check, before approval rather than at Stage 2.
      const unprintable=bundle&&Array.isArray(bundle.patterns)?(await crochetPrintability(bundle).catch(()=>({problems:[]}))).problems:[];
      if(unprintable.length){
        v.ok=false;
        for(const line of printabilityErrors(unprintable)){
          v.errors.push(line);
          const id=bundle.patterns[Number(/^\$\.patterns\[(\d+)\]/.exec(line)?.[1])]?.pattern_id;
          if(id)v.byPattern.set(id,[...(v.byPattern.get(id)??[]),line]);
        }
        this.log(`#${productId} crochet: ${unprintable.length} unprintable character(s): ${printabilityErrors(unprintable).join('; ')}`);
      }
      const listed=(bundle?.patterns??[]).filter(x=>typeof x?.pattern_id==='string'&&/^[a-z0-9][a-z0-9-]{0,59}$/.test(x.pattern_id));
      const samePlan=c.plan&&listed.map(x=>x.pattern_id).join()===c.patterns.map(e=>e.pattern_id).join();
      const status=id=>v.byPattern.has(id)?'invalid':'valid';
      const patterns=samePlan?c.patterns.map(e=>({...e,status:status(e.pattern_id),errors:(v.byPattern.get(e.pattern_id)??[]).slice(0,20)}))
        :listed.map(x=>({pattern_id:x.pattern_id,name:String(x.name||x.pattern_id).slice(0,80),status:v.byPattern.has(x.pattern_id)?'invalid':'supplied',revision:0,file:null,sha256:null,
          errors:(v.byPattern.get(x.pattern_id)??[]).slice(0,20),model:null,generated_at:null}));
      const origin=bundle?.provenance?.origin, source=['owner-authored','commissioned','licensed','ai-assisted-draft'].includes(origin)?{file:PATTERN_SOURCE,sha256:sha256(bytes),origin}:null;
      const validation={ok:v.ok,errors:v.errors.slice(0,200),source_sha256:sha256(bytes),at:at(),
        ...(unprintable.length?{unprintable:unprintable.slice(0,50).map(({path,location,char,code})=>({path,location,char,code}))}:{})};
      if(bundle)await this.store.writeBytes(p,'crochet/review.txt',Buffer.from(reviewDocument(bundle,{validation})));
      this.log(`#${productId} crochet validation: ${v.ok?'PASS':`FAIL (${v.errors.length})`}.`);
      return transition({...p,crochet:{...c,plan:samePlan||mode==='generate'?c.plan:null,patterns,source,validation,pending:null,
        generation:{...c.generation,status:'complete',finished_at:at()}}},'patterns_ready',{actor,now:this.now()});
    },{onError:markFailed});
    if(r.outcome!=='ok')return r;
    return this.#sendPatternReview(productId);
  }
  /** The pattern review: summary, the full review document, the buttons. Sends only. */
  async #sendPatternReview(productId){
    const p=await this.store.load(productId), chatId=p.request.chat_id;
    let bundle=null;try{bundle=JSON.parse(await this.store.readBytes(p,PATTERN_SOURCE));}catch{}
    if(await this.store.exists(p,'crochet/review.txt')&&this.telegram.sendDocument)
      await this.#quiet(async()=>this.telegram.sendDocument({chatId:String(chatId),bytes:await this.store.readBytes(p,'crochet/review.txt'),fileName:`${p.product_id}-crochet-patterns-review.txt`,
        caption:`#${p.product_id} candidate crochet patterns: the full text for your review`}));
    await this.#sayAction(p,patternReviewText(p,{bundle}),patternReviewKeyboard(p));
    return {outcome:'awaiting_pattern_approval',productId,valid:!!p.crochet.validation?.ok};
  }
  /** Why APPROVE PATTERNS cannot be recorded, or null. The source must be exactly what was validated, and still valid. */
  async #patternApprovalProblem(p){
    const c=p.crochet, v=c?.validation;
    if(!v)return 'the pattern source has not been validated.';
    if(!v.ok)return `validation found ${v.errors.length} problem(s). Redraft, revise or edit the patterns, then validate again.`;
    if(!await this.store.exists(p,PATTERN_SOURCE))return `${PATTERN_SOURCE} is missing.`;
    const bytes=await this.store.readBytes(p,PATTERN_SOURCE), sha=sha256(bytes);
    if(sha!==v.source_sha256||sha!==c.source?.sha256)return `${PATTERN_SOURCE} changed after it was validated. Press Re-validate first.`;
    const now=validateCandidate(JSON.parse(bytes));
    if(!now.ok)return `the source no longer passes validation (${now.errors[0]}).`;
    if(c.brief&&JSON.parse(bytes).patterns.length!==c.brief.pattern_count)return `the source has ${JSON.parse(bytes).patterns.length} patterns; the brief asks for ${c.brief.pattern_count}.`;
    return null;
  }
  async #setPatternBrief(p,text,actor){
    const chatId=p.request.chat_id, b=parseBrief(text);
    if(!b){await this.#say(chatId,'Please reply with a number of patterns from 1 to 60, e.g. "33" or "33 UK".');return {outcome:'bad_brief',productId:p.product_id};}
    const c=p.crochet??emptyCrochet();
    const next={...p,pending_input:null,crochet:{...c,brief:{...b,set_by:actor,set_at:this.now().toISOString()}},review:{...p.review,nonce:newNonce()},updated_at:this.now().toISOString()};
    await this.store.save(next);
    const l=this.#ledgerEvents();
    await this.#showScreen(chatId,null,patternsStartScreen(next,{estimate:estimateLine(estimateCalls(l?l.events:[],{text:1+b.pattern_count}))}),'pattern_brief');
    return {outcome:'pattern_brief_set',productId:p.product_id,brief:b};
  }
  async #revisePattern(p,text,actor){
    const chatId=p.request.chat_id, m=/^\s*#?(\d{1,3})\s*[:.\-)]\s*([\s\S]+)$/.exec(text), e=m?p.crochet.patterns[Number(m[1])-1]:null;
    if(!e||!m[2].trim()){await this.#say(chatId,`Please reply as "<pattern number>: <change>", e.g. "7: give the stitch count for every round" (1-${p.crochet.patterns.length}).`);return {outcome:'bad_revision',productId:p.product_id};}
    const at=this.now().toISOString(), instruction=m[2].trim().slice(0,500);
    await this.store.save({...p,pending_input:null,crochet:{...p.crochet,pending:{op:'revise',pattern_id:e.pattern_id,instruction,at,by:actor},
      revision_notes:[...p.crochet.revision_notes,{pattern_id:e.pattern_id,text:instruction,at,by:actor}]},updated_at:at});
    await this.#say(chatId,`Revising ${e.name} (1 AI text call). It stays an unverified draft; the whole source is validated again.`);
    return this.runPatterns(p.product_id,actor,{mode:'generate'});
  }
  /** Reject the candidate patterns: every crochet file is archived (never deleted); back to the approved style. The brief is kept. */
  async #rejectPatterns(p,actor){
    const dir=joinPath(this.store.dir,p.workspace), stamp=this.now().toISOString().replace(/[:.]/g,'-'), dest=joinPath(dir,'crochet','history',`rejected-${stamp}`);
    const moved=[];
    for(const rel of [PATTERN_SOURCE,PATTERN_PLAN,'crochet/review.txt','crochet/drafts']){
      const from=joinPath(dir,rel);
      if(await accessFs(from).then(()=>true,()=>false)){await mkdir(dest,{recursive:true});await rename(from,joinPath(dest,rel.split('/').at(-1)));moved.push(rel);}
    }
    const c=p.crochet??emptyCrochet(), at=this.now().toISOString();
    const next=transition({...p,pending_input:null,crochet:{...emptyCrochet(),brief:c.brief,
      revision_notes:[...c.revision_notes,{pattern_id:null,text:`Candidate patterns rejected; ${moved.length?`archived to crochet/history/rejected-${stamp}/`:'nothing to archive'}.`,at,by:actor}]}},'patterns_stopped',{actor,now:this.now()});
    await this.store.save(next);
    await this.#say(p.request.chat_id,`Candidate patterns for #${p.product_id} rejected. ${moved.length?`Every file is kept in crochet/history/rejected-${stamp}/.`:''} The approved style is unchanged; draft or supply the patterns again when you are ready.`,nextStepKeyboard(next));
    return {outcome:'patterns_rejected',productId:p.product_id,archived:moved};
  }

  // ---------- Stage 1 full book (ADR-030) ----------
  /**
   * Generate (or resume) a colouring book's full artwork, then the creative QC,
   * then the owner's review. Page by page: each page's artwork, checksum, status
   * and metered cost are saved before the next call, so a failure or restart
   * resumes at the first page without artwork and never pays for a finished page
   * twice. A pending single-page operation (regenerate / change direction) runs
   * first. Nothing is paid when every page already has artwork.
   */
  async runBook(productId,actor){
    let working=null, generated=0, opPage=null;
    const markFailed=(cur,message)=>!cur.book?cur:{...cur,book:{...cur.book,
      generation:cur.book.generation?{...cur.book.generation,status:'failed',finished_at:this.now().toISOString(),error:message.slice(0,500)}:null,
      pages:cur.book.pages.map(e=>e.page_number===working&&!HAVE.includes(e.status)?{...e,status:'failed',error:message.slice(0,500)}:e)}};
    const r=await this.#guarded(productId,'book',actor,async(p,commit)=>{
      const stop=m=>{throw Object.assign(new Error(m),{retryable:false});};
      if(!needsFullArtwork(p))stop(`#${productId} is not a full-book product.`);
      if(bookApproved(p))stop(`#${productId}'s full artwork is already approved.`);
      if(!['CREATIVE_APPROVED','AWAITING_BOOK_APPROVAL'].includes(p.status))stop(`Full-book generation needs the approved style; #${productId} is ${p.status}.`);
      const direction=await this.store.readJson(p,DIRECTION_FILE);
      p=await commit(await this.#prepareBook(p,direction));   // manifest persisted before any page image
      const manifest=await this.store.readJson(p,BOOK_MANIFEST);
      p=await commit(transition({...p,book:{...p.book,generation:{status:'generating',started_at:this.now().toISOString(),finished_at:null,error:null}}},'book_started',{actor,now:this.now()}));
      const op=p.book.pending_op;
      if(op){working=opPage=op.page_number;p=await commit(await this.#bookPage(p,{direction,manifest,page_number:op.page_number,op}));}
      const todo=p.book.pages.filter(e=>!HAVE.includes(e.status)).map(e=>e.page_number);
      this.log(`#${productId} full book: ${todo.length} page image call(s) to make; ${p.book.pages.length-todo.length} page(s) already have artwork.`);
      for(const n of todo){working=n;p=await commit(await this.#bookPage(p,{direction,manifest,page_number:n}));generated++;}
      working=null;
      // Deterministic creative QC (free) and the review contact sheets.
      const {qc,sheets}=await bookQc({product:p,manifest,readBytes:rel=>this.store.readBytes(p,rel)});
      for(const x of sheets)await this.store.writeBytes(p,x.file,x.bytes);
      const at=this.now().toISOString(), bytes=Buffer.from(JSON.stringify({...qc,at,sheets:sheets.map(({file,from,to})=>({file,from,to}))},null,2)+'\n');
      await this.store.writeBytes(p,BOOK_QC,bytes);
      this.log(`#${productId} full book QC: ${qc.passed?'PASS':'FAIL'}, ${qc.warnings.length} warning(s).`);
      return transition({...p,book:{...p.book,generation:{...p.book.generation,status:'complete',finished_at:at},
        qc:{passed:qc.passed,report:BOOK_QC,sha256:sha256(bytes),fingerprint:qc.fingerprint,at,warnings:qc.warnings.length,
          failed_pages:Object.entries(qc.pages).filter(([,x])=>x.status==='fail').map(([id])=>id)}}},'book_ready',{actor,now:this.now()});
    },{onError:markFailed});
    if(r.outcome!=='ok')return r;
    // A single-page operation shows that page; a generation run shows the contact sheets.
    return this.#sendBookReview(productId,opPage&&!generated?{page:opPage}:{sheets:true});
  }
  /** One page (AWAITING_BOOK_APPROVAL): regenerate it, or change its direction from an owner instruction. */
  async runBookPage(productId,actor,{page_number,op,instruction=null}){
    const p=await this.store.load(productId);
    await this.store.save({...p,pending_input:null,review:{...p.review,nonce:newNonce()},
      book:{...p.book,pending_page:null,pending_op:{page_number,op,instruction,at:this.now().toISOString(),by:actor}},updated_at:this.now().toISOString()});
    return this.runBook(productId,actor);
  }

  /**
   * Free and idempotent: the authoritative page manifest (P001..PNNN) and the
   * reuse of approved style proofs that genuinely are pages of the book (copied
   * into book/pages/; the proofs themselves are never touched). Written once;
   * a changed manifest is never silently rewritten.
   */
  async #prepareBook(p,direction){
    if(p.book){
      const bytes=await this.store.readBytes(p,BOOK_MANIFEST).catch(()=>null);
      if(!bytes||sha256(bytes)!==p.book.manifest.sha256)throw Object.assign(new Error(`${BOOK_MANIFEST} is missing or changed since it was made. The page manifest is authoritative and is never rewritten silently.`),{retryable:false});
      return p;
    }
    const size=imageSizeFor(this.ai.imageModel,p.canvas.orientation);   // the largest documented size for this page shape
    const reuse=await assessReuse({product:p,direction,size,readBytes:rel=>this.store.readBytes(p,rel)});
    const used=reuse.filter(x=>x.reused), at=this.now().toISOString();
    const manifest=buildBookManifest({product:p,direction,proofPages:used.map(x=>x.page_number),size,model:this.ai.imageModel,quality:this.ai.imageQuality??null,createdAt:at});
    const mBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
    await this.store.writeBytes(p,BOOK_MANIFEST,mBytes);
    const empty={status:'missing',source:null,proof_file:null,file:null,sha256:null,width:null,height:null,size:null,model:null,generated_at:null,revision:0,instruction:null,error:null};
    const pages=[];
    for(const m of manifest.pages){
      const u=used.find(x=>x.page_number===m.page_number);
      if(!u){pages.push({page_id:m.page_id,page_number:m.page_number,...empty});continue;}
      const bytes=await this.store.readBytes(p,u.proof_file);
      await this.store.writeBytes(p,pageFile(m.page_number),bytes);
      const px=pngSize(bytes);
      pages.push({page_id:m.page_id,page_number:m.page_number,...empty,status:'reused',source:'style-proof',proof_file:u.proof_file,file:pageFile(m.page_number),
        sha256:u.sha256,width:px.width,height:px.height,size:u.size,model:u.model??null,generated_at:u.generated_at??null});
    }
    this.log(`#${p.product_id} full book prepared: ${manifest.pages.length} pages in the manifest, ${used.length} approved style proof(s) reused${reuse.length>used.length?`, ${reuse.length-used.length} not reused (${reuse.filter(x=>!x.reused).map(x=>`p${x.page_number}: ${x.reason}`).join('; ')})`:''}.`);
    return {...p,book:{version:1,manifest:{file:BOOK_MANIFEST,sha256:sha256(mBytes),created_at:at},size,model:this.ai.imageModel,quality:this.ai.imageQuality??null,
      pages,generation:null,qc:null,pending_op:null,pending_page:null,direction_notes:[],reuse:reuse.map(({page_number,proof_file,reused,reason})=>({page_number,proof_file,reused,reason})),approval:null}};
  }
  /** Generate one page (1 metered image call) and return the updated product. op: a pending regenerate / direction change. */
  async #bookPage(p,{direction,manifest,page_number,op=null}){
    const e=p.book.pages.find(x=>x.page_number===page_number), m=manifest.pages.find(x=>x.page_number===page_number), file=pageFile(page_number);
    const onDisk=await this.store.exists(p,file)?await this.store.readBytes(p,file):null;
    const instruction=op?.op==='direction'?op.instruction:e.instruction;
    let bytes, model, prompt=null, adopted=false;
    // Written just before a crash but never recorded: adopt it, never pay twice.
    if(onDisk&&pngSize(onDisk)&&(op?sha256(onDisk)!==e.sha256:!HAVE.includes(e.status))){
      bytes=onDisk;model=this.ai.imageModel;adopted=true;
      this.log(`#${p.product_id} full book ${m.page_id}: adopting ${file} found on disk (no image call).`);
    }else{
      prompt=await bookPagePrompt({direction,product:p,manifest,entry:m,bookNotes:p.book.direction_notes,instruction});
      this.log(`#${p.product_id} full book ${m.page_id}: 1 image call (${p.book.size}).`);
      const img=await this.ai.client.image({step:'book-page',model:this.ai.imageModel,prompt,size:p.book.size,quality:this.ai.imageQuality});
      if(!pngSize(img.bytes))throw Object.assign(new Error(`${m.page_id}: the image model did not return a PNG`),{name:'InvalidModelOutputError',retryable:true});
      bytes=img.bytes;model=img.model;
      if(op&&onDisk)await this.#archiveBookPage(p,e);   // the replaced artwork is kept, never deleted
      await this.store.writeBytes(p,file,bytes);
    }
    const px=pngSize(bytes), at=this.now().toISOString(), revision=op?e.revision+1:e.revision;
    if(prompt)await this.store.writeJson(p,`book/prompts/${m.page_id}-r${pad(revision)}.json`,{page_id:m.page_id,page_number:page_number,revision,model,size:p.book.size,quality:this.ai.imageQuality??null,instruction:instruction??null,generated_at:at,prompt});
    const {adopted_after_restart,...rest}=e;
    const entry={...rest,status:'generated',source:'generated',proof_file:null,file,sha256:sha256(bytes),width:px.width,height:px.height,size:p.book.size,model,generated_at:at,
      revision,instruction:instruction??null,error:null,...(adopted?{adopted_after_restart:true}:{})};
    return {...p,book:{...p.book,pages:p.book.pages.map(x=>x.page_number===page_number?entry:x),pending_op:op?null:p.book.pending_op}};
  }
  /** Move a replaced page to book/history/ (never deleted). */
  async #archiveBookPage(p,e){
    const dir=this.store.dirOf(p), from=joinPath(dir,e.file??pageFile(e.page_number));
    if(!await accessFs(from).then(()=>true,()=>false))return null;
    let v=e.revision;while(await accessFs(joinPath(dir,'book','history',`${e.page_id}-r${pad(v)}.png`)).then(()=>true,()=>false))v++;
    await mkdir(joinPath(dir,'book','history'),{recursive:true});
    await rename(from,joinPath(dir,'book','history',`${e.page_id}-r${pad(v)}.png`));
    return `book/history/${e.page_id}-r${pad(v)}.png`;
  }
  /** Why APPROVE FULL BOOK must be refused, or null. Re-reads every page: approval binds to exactly what was checked. */
  async #bookApprovalProblem(p){
    const b=p.book;
    if(!b?.qc)return 'the creative QC has not run.';
    if(b.pending_op)return 'a page operation is still pending.';
    const q=await this.store.readBytes(p,BOOK_QC).catch(()=>null);
    if(!q||sha256(q)!==b.qc.sha256)return `${BOOK_QC} changed since the review.`;
    // ADR-067: a failed QC is approvable only through this product's owner-approved overflow exception for this exact report.
    if(!b.qc.passed){const eff=effectiveBookQc(JSON.parse(q),b.qc.sha256,b.qc.override??null);
      if(!eff.passed)return b.qc.override?`Creative QC failed: ${eff.problem}.`:`Creative QC failed (${b.qc.failed_pages.join(', ')||'see the review'}). ${overflowReview(JSON.parse(q)).reviewable?'Accept the decorative overflow (✅ ACCEPT OVERFLOW) or regenerate those pages first.':'Regenerate those pages first.'}`;}
    const mf=await this.store.readBytes(p,BOOK_MANIFEST).catch(()=>null);
    if(!mf||sha256(mf)!==b.manifest.sha256)return `${BOOK_MANIFEST} changed.`;
    for(const e of b.pages){
      if(!HAVE.includes(e.status))return `${e.page_id} has no artwork.`;
      const bytes=await this.store.readBytes(p,e.file).catch(()=>null);
      if(!bytes||sha256(bytes)!==e.sha256)return `${e.file} changed since the review.`;
    }
    if(bookPagesDigest(b.pages)!==b.qc.fingerprint)return 'the pages changed since the creative QC ran.';
    return null;
  }
  /** Stop a failed or reviewed book: back to the approved style (CREATIVE_APPROVED); every page is kept. */
  async #stopBook(p,actor){
    const book=p.book?{book:{...p.book,pending_op:null,pending_page:null,generation:p.book.generation?{...p.book.generation,status:p.book.generation.status==='generating'?'interrupted':p.book.generation.status}:null}}:{};
    const next=transition({...p,...book,pending_input:null},'book_stopped',{actor,now:this.now()});
    await this.store.save(next);
    const pr=bookProgress(next);
    await this.#say(p.request.chat_id,`Full-book generation stopped for #${p.product_id}. Every page made so far is kept${pr?` (${pr.available}/${pr.total})`:''}; generating again never pays for a finished page twice.`,nextStepKeyboard(next));
    return {outcome:'book_stopped',productId:p.product_id};
  }
  /** Book-wide change of direction (free): archive the generated pages, mark them for regeneration, then show the new plan and cost. */
  async #changeBookDirection(p,text,actor){
    const chatId=p.request.chat_id;
    if(p.lock){await this.#say(chatId,`Product #${p.product_id} is busy (${p.lock.op}).`);return {outcome:'busy'};}
    const archived=[];
    for(const e of p.book.pages.filter(x=>x.status==='generated')){await this.#archiveBookPage(p,e);archived.push(e.page_id);}
    const pages=p.book.pages.map(e=>['generated','failed'].includes(e.status)?{...e,status:'missing',source:null,file:null,sha256:null,width:null,height:null,size:null,model:null,generated_at:null,
      instruction:null,error:null,revision:e.revision+(e.status==='generated'?1:0)}:e);
    const next=transition({...p,pending_input:null,book:{...p.book,pages,qc:null,pending_op:null,pending_page:null,
      direction_notes:[...p.book.direction_notes,{text,at:this.now().toISOString(),by:actor,archived_pages:archived}]}},'book_stopped',{actor,now:this.now()});
    await this.store.save(next);
    await this.#say(chatId,`Book direction recorded for #${p.product_id}: "${text}". ${archived.length} generated page${archived.length===1?'':'s'} archived to book/history/ (kept). Nothing has been generated yet.`);
    const plan=await this.#bookPlan(next);
    await this.#showScreen(chatId,null,bookGenerateScreen(next,{plan,estimate:this.#bookEstimate(plan.toGenerate),size:plan.size}),'book_plan');
    return {outcome:'book_direction_changed',productId:p.product_id,archived};
  }
  /**
   * Read-only plan: pages required, available (reused / generated), to generate.
   * Before the book exists, the approved proofs are assessed for reuse (no writes, no calls).
   */
  async #bookPlan(p){
    if(!needsFullArtwork(p)||!p.canvas)return null;
    const pr=bookProgress(p);
    if(pr)return {...pr,reusable:pr.reused,size:p.book.size,notReused:(p.book.reuse??[]).filter(x=>!x.reused).map(({page_number,reason})=>({page_number,reason}))};
    let size=null, reuse=[];
    try{
      size=imageSizeFor(this.ai.imageModel,p.canvas.orientation);
      reuse=await assessReuse({product:p,direction:await this.store.readJson(p,DIRECTION_FILE),size,readBytes:rel=>this.store.readBytes(p,rel)});
    }catch(err){this.log(`#${p.product_id} full-book plan: ${describeError(err)}`);}
    const ok=reuse.filter(x=>x.reused), total=p.pages.length;
    return {total,available:ok.length,reused:ok.length,reusable:ok.length,generated:0,failed:[],toGenerate:total-ok.length,size,
      missing:p.pages.map(x=>x.page_number).filter(n=>!ok.some(x=>x.page_number===n)),notReused:reuse.filter(x=>!x.reused).map(({page_number,reason})=>({page_number,reason}))};
  }
  /** n page images x the ledger's recent average per page/proof image (null £ without history). */
  #bookEstimate(n){const l=this.#ledgerEvents();return estimateCalls(l?l.events:[],{image:n},{steps:BOOK_IMAGE_STEPS});}
  async #productScreen(p){return productScreen(p,{cost:this.#productCost(p),book:await this.#bookPlan(p)});}
  /** The full book review: contact sheets (or the one changed page), the QC summary and the review buttons. Sends only. */
  async #sendBookReview(productId,{sheets=false,page=null}={}){
    const p=await this.store.load(productId), chatId=p.request.chat_id;
    const qc=JSON.parse(await this.store.readBytes(p,BOOK_QC));
    if(sheets){
      const items=await Promise.all(qc.sheets.map(async x=>({bytes:await this.store.readBytes(p,x.file),fileName:`${p.product_id}-${x.file.split('/').at(-1)}`,caption:`#${p.product_id} · pages ${x.from}–${x.to} of ${p.pages.length}`})));
      for(let i=0;i<items.length;i+=10){const c=items.slice(i,i+10);await this.#quiet(()=>c.length>1?this.telegram.sendPhotoAlbum(String(chatId),c):this.telegram.sendPhoto({chatId:String(chatId),...c[0]}));}
    }
    if(page)await this.#sendBookPagePhoto(p,page);
    const l=this.#ledgerEvents(), c=this.#productCost(p);
    await this.#sayAction(p,bookReviewText(p,{qc,progress:bookProgress(p),spend:l?stepSpend(l.events,p.product_id,['book-page']):null,total:c?c.total:null}),
      bookReviewKeyboard(p,{qc,total:p.pages.length}));
    return {outcome:'awaiting_book_approval',productId,qcPassed:qc.passed};
  }
  async #sendBookPagePhoto(p,n){
    const e=p.book.pages.find(x=>x.page_number===n);
    if(!e?.file)return;
    await this.#quiet(async()=>this.telegram.sendPhoto({chatId:String(p.request.chat_id),bytes:await this.store.readBytes(p,e.file),fileName:`${p.product_id}-${e.page_id}.png`,
      caption:`#${p.product_id} · ${e.page_id} ${p.pages[n-1]?.title??''} (${e.width}×${e.height} px)`}));
  }

  /**
   * Stage 2: CREATIVE_APPROVED -> handoff -> PRODUCTION_READY -> build ->
   * PRODUCTION_QC -> AWAITING_PRODUCTION_APPROVAL. Deterministic: this.ai is
   * never used. Only a QC pass reaches the owner's review; a QC failure parks
   * the product in FAILED (resume PRODUCTION_READY) with nothing deleted.
   */
  async runProduction(productId,actor,{rebuild=false}={}){
    // The file lock keeps one Stage 2 writer per product across processes (a second bot started mid-build).
    const r=await this.#guarded(productId,'production',actor,async(p,commit)=>withBuildLock(this.store.dirOf(p),async({recovered})=>{
      const dir=this.store.dirOf(p);
      if(recovered)this.log(`#${productId} production: recovered a stale build lock (${recovered}).`);
      const {handoff,sha256,created,archived}=await writeHandoff(p,dir);   // immutable; re-verified on every run
      // A retry after the owner re-approved the patterns (ADR-053): the handoff was rebuilt from the new approval.
      if(p.status!=='CREATIVE_APPROVED'&&created){
        this.log(`#${productId} production handoff refreshed for the re-approved patterns${archived?` (old one kept as ${archived})`:''}.`);
        p=await commit({...p,production:{...p.production,handoff:{file:HANDOFF_FILE,sha256},adapter:handoff.adapter,build:null,qc:null}});
      }
      if(p.status==='CREATIVE_APPROVED'){
        this.log(`#${productId} production handoff ${created?'written':'reused'}: ${handoff.pages.length} approved artwork files, adapter ${handoff.adapter.format} v${handoff.adapter.version}.`);
        p=await commit(transition({...p,production:{handoff:{file:HANDOFF_FILE,sha256},adapter:handoff.adapter,build:null,qc:null,approved_at:null}},'production_ready',{actor,now:this.now()}));
      }
      p=await commit(transition(p,'production_started',{actor,now:this.now()}));
      // Files written so far, for the owner status (the build's total is not exposed, so none is shown).
      let written=0;
      const b=await buildProduction({productDir:dir,handoff,handoffSha:sha256,force:rebuild,log:l=>{
        this.log(`#${productId} ${l}`);
        if(/^production: wrote /.test(l))this.#progress(productId,{unit:'Files written',done:++written,last:l.slice(19).replace(/ \(.*$/,'').split('/').at(-1)});
      }});
      this.log(`#${productId} production build: ${b.built.length} written, ${b.skipped.length} already complete.`);
      p=await commit(transition({...p,production:{...p.production,build:{record:BUILD_RECORD,sha256:b.recordSha,built_at:this.now().toISOString()}}},'production_built',{actor,now:this.now()}));
      const qc=await runQc({productDir:dir,handoff,now:this.now()});
      p={...p,production:{...p.production,qc:{passed:qc.passed,report:QC_REPORT,at:qc.at}}};
      if(!qc.passed){await commit(p);throw new ProductionQcError(qc.checks.filter(c=>!c.ok));}
      return transition(p,'production_qc_passed',{actor,now:this.now()});
    }));
    if(r.outcome!=='ok')return r;
    return this.#sendProductionReview(productId);
  }

  /** Concise summary, true-render PNG previews (never the PDFs), then the production buttons. Sends only. */
  async #sendProductionReview(productId){
    const p=await this.store.load(productId), chatId=p.request.chat_id;
    const [handoff,record,qc]=await Promise.all([HANDOFF_FILE,BUILD_RECORD,QC_REPORT].map(f=>this.store.readJson(p,f)));
    await this.#say(chatId,productionSummary(p,{handoff,record,qc}));
    for(const pv of qc.previews)
      await this.#quiet(async()=>this.telegram.sendPhoto({chatId:String(chatId),bytes:await this.store.readBytes(p,pv.file),fileName:pv.file.split('/').at(-1),caption:`#${p.product_id} · ${pv.label}`}));
    await this.#sayAction(p,'Approve these customer files?',productionKeyboard(p));
    return {outcome:'awaiting_production_approval',productId};
  }

  async #cancelProduction(p,actor){
    await this.store.save(transition(p,'production_cancelled',{actor,now:this.now()}));
    await this.#say(p.request.chat_id,`Production cancelled for #${p.product_id}. It stays creatively approved and all files are kept. Send /produce ${p.product_id} to start again.`);
    return {outcome:'production_cancelled',productId:p.product_id};
  }

  /**
   * Stage 3: PRODUCTION_APPROVED -> MARKETING_PLANNING (listing + image copy,
   * paid text) -> MARKETING_GENERATING (AI backgrounds, paid; renders, free)
   * -> MARKETING_QC -> AWAITING_MARKETING_APPROVAL. Every paid artefact is
   * made only if missing, so a retry or restart never pays twice. Only a QC
   * pass reaches the owner. Nothing is published.
   */
  async runMarketing(productId,actor,{engine:chosen=null,chosenBy=null}={}){
    const r=await this.#guarded(productId,'marketing',actor,async(p,commit)=>{
      const dir=this.store.dirOf(p), sha=b=>createHash('sha256').update(b).digest('hex');
      const has=rel=>this.store.exists(p,rel);
      if(p.status==='PRODUCTION_APPROVED')
        p=await commit(transition({...p,marketing:{listing:null,plan:null,images:null,qc:null,pending_scope:'all',approved_at:null,...p.marketing}},'marketing_started',{actor,now:this.now()}));
      const facts=await deriveFacts(dir);   // re-verifies the approved Stage 2 package
      await this.store.writeJson(p,'marketing/facts.json',facts);
      // Shared marketing strategy (free, deterministic): made once, reused by listing and visual regenerations.
      if(!await has('marketing/strategy.json'))await this.store.writeJson(p,'marketing/strategy.json',deriveStrategy(facts));
      const strategy=await this.store.readJson(p,'marketing/strategy.json');
      // The engine is stored with the run. The bare /market command (and a Factory regeneration) is Factory, exactly as before.
      const engine=chosen??p.marketing?.engine??'factory';
      // ADR-065: choosing an engine whose comparison candidate was shown approves THAT candidate (referenced by SHA-256).
      if(p.marketing?.engine!==engine){const cmp=p.marketing?.comparison, rec=approvalRecord(cmp?.engines?.[engine],engine,cmp?.at);
        p=await commit({...p,marketing:{...p.marketing,engine,engine_chosen:{by:chosenBy??actor,at:this.now().toISOString(),...(rec?{approved_hero:rec}:{})}}});}
      const skeleton=planSlides(facts,{maxScenes:engine==='factory'?this.marketingScenes:0,strategy});
      // Real Stage 2 artwork (free, deterministic). Factory prepares it after planning, as before; an engine needs it to plan.
      const workDir=joinPath(dir,'marketing','work');
      let art=null;
      if(!await has('marketing/listing.json')){
        this.log(`#${productId} marketing: listing copy (1 AI text call).`);
        // Owner-approved SEO keywords (if any) are search focus for the listing; unapproved research is never used.
        const seo=await this.seo?.approvedKeywords(p.product_id).catch(()=>null)??null;
        if(seo)this.log(`#${productId} marketing: owner-approved SEO focus "${seo.primary}" (${seo.session}).`);
        const l=await this.#listingOnce(p,{facts,strategy,seo});
        const listing={...l.data,model:l.model,generated_at:this.now().toISOString(),advisory:{price:'Suggested only; the owner sets the Etsy price in Stage 4.'}};
        // Audit only: the model's tag pool and what code kept. Stage 4 uses listing.json tags.
        await this.store.writeJson(p,'marketing/tag-selection.json',{...l.selection,note:'Model candidates and deterministic selection. The final Etsy tags are listing.json tags.'});
        await this.store.writeJson(p,'marketing/listing.json',listing);
        p=await commit({...p,marketing:{...p.marketing,listing:{file:'marketing/listing.json',sha256:sha(await this.store.readBytes(p,'marketing/listing.json'))}}});
      }
      if(!await has('marketing/plan.json')&&engine!=='factory'){
        art=await prepareArt(facts,dir,workDir);
        await this.store.writeJson(p,'marketing/plan.json',await this.#planEngine(p,{engine,facts,strategy,skeleton,art}));
      }
      if(!await has('marketing/plan.json')){
        this.log(`#${productId} marketing: scene briefs + tone line (1 AI text call).`);
        const c=await generateMarketingCopy(this.ai,{facts,plan:skeleton,strategy});
        const plan={...skeleton,engine:{id:'factory',version:ENGINE_VERSION},model:c.model,generated_at:this.now().toISOString(),
          // Headlines and labels are art-directed campaign copy; the model adds only the tone lines.
          slides:skeleton.slides.map(s=>{const l=c.data.lines.find(y=>y.id===s.id);return l?{...s,copy:{...s.copy,subline:{text:l.text,by:'model'}}}:s;}),
          scenes:skeleton.scenes.map(sc=>{const brief=c.data.scenes.find(y=>y.id===sc.id).brief;return {...sc,brief,prompt:scenePrompt({scene:sc,brief,facts,strategy}),file:`marketing/scenes/${sc.id}.png`,sha256:null,model:null,size:null};})};
        // ADR-065: an approved Factory comparison hero keeps its exact paid scene (never repainted, never paid twice).
        const appr=approvedHeroFor(p,'factory'), heroSc=appr?.scene&&plan.scenes.find(x=>x.id===plan.slides[0]?.scene);
        if(appr){if(heroSc)Object.assign(heroSc,{file:appr.scene.file,sha256:appr.scene.sha256,prompt:appr.scene.prompt,model:'reused from the approved hero comparison'});
          plan.approved_hero=approvalLock(appr,plan.slides[0].id);}
        await this.store.writeJson(p,'marketing/plan.json',plan);
      }
      p=await commit(transition(p,'marketing_planned',{actor,now:this.now()}));
      const plan=await this.store.readJson(p,'marketing/plan.json');
      // ADR-065: before any paid image, the plan must still carry the hero the owner approved (and its file must be intact).
      await this.#assertApprovedHero(p,plan);
      // Owner status: AI images (backgrounds + coloured examples) made / planned, counted from the plan.
      const aiImages=[...plan.scenes,...(plan.examples??[])], aiProgress=last=>this.#progress(productId,{label:'Making AI marketing images',unit:'AI images',
        done:aiImages.filter(x=>x.sha256).length,total:aiImages.length,last});
      if(aiImages.length)await aiProgress(null);
      for(const sc of plan.scenes){
        if(sc.sha256&&await has(sc.file)&&sha(await this.store.readBytes(p,sc.file))===sc.sha256)continue;
        // Pre-image route gate (ADR-064): the hero environment of an engine must differ from the routes already produced.
        if(plan.engine&&plan.engine.id!=='factory'&&sc.slide===plan.slides[0]?.id)await this.#gateHeroScene(p,{plan,sc,facts,strategy});
        this.log(`#${productId} marketing: background scene "${sc.id}" (1 AI image call).`);
        const img=plan.engine&&plan.engine.id!=='factory'?await generateEnvironment(this.ai,{prompt:sc.prompt}):await generateScene(this.ai,{prompt:sc.prompt});
        await this.store.writeBytes(p,sc.file,img.bytes);
        Object.assign(sc,{sha256:sha(img.bytes),model:img.model,size:img.size});
        await this.store.writeJson(p,'marketing/plan.json',plan);   // progress saved per image
        await aiProgress(sc.id);
      }
      // AI coloured examples (plans that have them, e.g. colouring books): an image edit of a REAL approved page.
      for(const ex of plan.examples??[]){
        if(ex.sha256&&await has(ex.file)&&sha(await this.store.readBytes(p,ex.file))===ex.sha256)continue;
        const page=await readFileFs(joinPath(dir,ex.source.file));
        if(sha(page)!==ex.source.sha256)throw new Stage3Error(`The approved artwork of page ${ex.page_number} changed since production approval: ${ex.source.file}.`);
        // The coloured example consumes the Creative Director's concept (palette, transformation story) when the plan has one.
        const concept=plan.campaign_direction?.concept??null;
        ex.prompt??=examplePrompt({example:ex,facts,strategy,concept});
        this.log(`#${productId} marketing: coloured example of page ${ex.page_number} (1 AI image call).`);
        const img=await generateColouredExample(this.ai,{prompt:ex.prompt,page,width:ex.source.width,height:ex.source.height});
        await this.store.writeBytes(p,ex.file,img.bytes);
        Object.assign(ex,{sha256:sha(img.bytes),model:img.model,size:img.size},concept?{concept_sha:conceptDigest(concept)}:{});
        await this.store.writeJson(p,'marketing/plan.json',plan);   // progress saved per image
        await aiProgress(`coloured example, page ${ex.page_number}`);
      }
      p=await commit({...p,marketing:{...p.marketing,plan:{file:'marketing/plan.json',sha256:sha(await this.store.readBytes(p,'marketing/plan.json'))}}});
      // Free, deterministic: real Stage 2 artwork into the planned compositions.
      art??=await prepareArt(facts,dir,workDir);
      const digest=this.#imagesDigest({plan,art,facts});
      let results;
      const cached=p.marketing.images?.digest===digest&&await has('marketing/images/render.json')?await this.store.readJson(p,'marketing/images/render.json'):null;
      if(cached&&(await Promise.all(cached.flatMap(x=>[has(`marketing/images/${x.file}`),x.thumb?has(`marketing/images/${x.thumb}`):false]))).every(Boolean)){
        results=cached.map(x=>({...x,outPath:joinPath(dir,'marketing','images',x.file),thumbPath:joinPath(dir,'marketing','images',x.thumb)}));
      }else{
        await this.#progress(productId,{label:'Rendering the listing images',unit:null,done:null,total:null,last:null});
        results=await renderSlides({facts,plan,art,scenes:Object.fromEntries(plan.scenes.filter(x=>x.sha256).map(x=>[x.id,joinPath(dir,x.file)])),examples:this.#examplePaths(dir,plan),
          outDir:joinPath(dir,'marketing','images'),engine:plan.engine?.id??'factory',directions:plan.directions??{}});
        await this.store.writeJson(p,'marketing/images/render.json',results.map(({outPath,thumbPath,contactSheet,...x})=>({...x,file:outPath.split(/[\\/]/).at(-1),thumb:`thumbs/${thumbPath.split(/[\\/]/).at(-1)}`})));
      }
      p=await commit(transition({...p,marketing:{...p.marketing,images:{count:results.length,dir:'marketing/images',digest}}},'marketing_generated',{actor,now:this.now()}));
      const listing=await this.store.readJson(p,'marketing/listing.json');
      const qc=await this.#marketingQc({dir,facts,plan,listing,results,art});
      const at=this.now().toISOString();
      await this.store.writeJson(p,'marketing/qc.json',{...qc,at});
      p={...p,marketing:{...p.marketing,qc:{passed:qc.passed,report:'marketing/qc.json',at}}};
      if(!qc.passed){await commit(p);const e=new Error(`marketing QC failed: ${qc.checks.filter(c=>!c.ok).map(c=>`${c.name}: ${c.detail}`).join('; ')}`);e.name='MarketingQcError';e.retryable=false;throw e;}
      return transition({...p,marketing:{...p.marketing,pending_scope:null}},'marketing_qc_passed',{actor,now:this.now()});
    });
    if(r.outcome!=='ok')return r;
    return this.#sendMarketingReview(productId);
  }

  /**
   * The listing, paid at most once per valid answer (ADR-064). A model answer the validator rejected is saved to
   * marketing/listing.rejected.json; the next run (Retry, restart) first re-checks that saved answer with the
   * CURRENT deterministic correction + validation, free. Only if it still fails (or the facts / approved SEO focus
   * changed since) is the model asked again. A recovered answer is used exactly as validated; nothing is guessed.
   */
  async #listingOnce(p,{facts,strategy,seo}){
    const REJ='marketing/listing.rejected.json', key=createHash('sha256').update(JSON.stringify({facts:factsForModel(facts),seo:seo??null})).digest('hex');
    if(await this.store.exists(p,REJ)){
      const saved=await this.store.readJson(p,REJ);
      if(saved.input_sha256===key&&saved.draft?.data){
        try{const l=finaliseListing(saved.draft,{facts});this.log(`#${p.product_id} marketing: the saved rejected listing passes the current checks; reused, no AI call.`);
          return {...l,selection:{...l.selection,recovered_from:{file:REJ,rejected_at:saved.rejected_at}}};}
        catch(e){if(e?.name!=='InvalidModelOutputError')throw e;this.log(`#${p.product_id} marketing: the saved rejected listing still fails (${e.message}); asking the model again.`);}
      }
    }
    try{return await generateListing(this.ai,{facts,strategy,seo});}
    catch(e){
      if(e.draft)await this.store.writeJson(p,REJ,{note:'A paid listing answer the validator rejected. Re-checked for free before the next listing call (ADR-064).',
        input_sha256:key,rejected_at:this.now().toISOString(),problems:e.message,draft:e.draft});
      throw e;
    }
  }

  /**
   * The hero routes already produced for this product (the hero comparison), for the pre-image gate (ADR-064).
   * Entries made before route contracts existed: the engine's contract and their saved brief.
   */
  #producedRoutes(p,facts,except){
    return Object.entries(p.marketing?.comparison?.engines??{}).filter(([e])=>e!==except).map(([e,x])=>({engine:e,route:x.route??routeOf(routeContract(e,facts)),
      // A legacy Factory entry keeps only its prompt: the scene direction is its second line (scenePrompt).
      brief:x.brief??x.direction?.scene_brief??(e==='factory'?String(x.scene?.prompt??'').split('\n')[1]??'':'')}));
  }
  /** The route gate before a paid hero image: the (possibly redirected) brief, or a refusal that is never retried automatically. */
  #routeGate(productId,{engine,facts,brief,others}){
    const g=gateBeforeImage({engine,contract:routeContract(engine,facts),brief,others});
    if(g.problems.length)throw Object.assign(new Error(`Route distinctness gate: no image was generated for ${engine}. ${g.problems.join('; ')}`),{name:'RouteSimilarityError',retryable:false});
    if(g.redirected)this.log(`#${productId} ${engine}: scene brief redirected to the route's own brief before the image call (${g.reason.join('; ')}).`);
    return g;
  }
  /** Full campaign: gate the engine's hero scene; a redirected brief rebuilds that scene's prompt (free) and is recorded in the plan. */
  async #gateHeroScene(p,{plan,sc,facts,strategy}){
    const engine=plan.engine.id, d=plan.directions?.[sc.slide];
    const g=this.#routeGate(p.product_id,{engine,facts,brief:d?.scene_brief??'',others:this.#producedRoutes(p,facts,engine)});
    sc.route_gate={passed:true,redirected:g.redirected,...(g.redirected?{reason:g.reason}:{})};
    if(g.redirected){
      const slide=plan.slides.find(x=>x.id===sc.slide), creative=slide?.template==='creative';
      const nd={...d,scene_brief:creative?slide.creative.scene_brief:g.brief,fallbacks:[...(d.fallbacks??[]),'scene_brief (route gate)']};
      plan.directions[sc.slide]=nd;
      sc.prompt=creative?creativeEnvironmentPrompt({direction:nd,facts,strategy,campaign:plan.campaign_direction})
        :environmentPrompt({engine,slide,direction:nd,facts,strategy,campaign:plan.campaign_direction,route:routeContract(engine,facts)});
    }
    await this.store.writeJson(p,'marketing/plan.json',plan);
  }

  /** ADR-065: the approval lock holds, and the approved backplate on disk is byte-identical. Never repaints it. */
  async #assertApprovedHero(p,plan){
    const out=approvalProblems(plan), sc=plan.approved_hero&&!plan.approved_hero.superseded?plan.approved_hero.locked.scene:null;
    if(sc&&!(await this.store.exists(p,sc.file)&&createHash('sha256').update(await this.store.readBytes(p,sc.file)).digest('hex')===sc.sha256))
      out.push(`the approved backplate ${sc.file} is missing or changed on disk`);
    if(out.length)throw integrityError(out);
  }

  /** Images digest (render cache key). Factory: exactly as before; engines add the engine and its directions; AI examples their hashes. */
  #imagesDigest({plan,art,facts}){
    const eng=plan.engine&&plan.engine.id!=='factory'?{engine:plan.engine,directions:plan.directions}:{};
    const ex=plan.examples?.length?{examples:plan.examples.map(x=>x.sha256)}:{};
    // Colouring creative plans: the composer version, so a layout change redoes only the (free) final renders. Other plans: unchanged.
    const cr=plan.creative?.composer?{composer:plan.creative.composer}:{};
    return createHash('sha256').update(Buffer.from(JSON.stringify({campaign:CAMPAIGN_VERSION,slides:plan.slides,scenes:plan.scenes.map(x=>x.sha256),art:art.manifest.map(a=>a.sha256),sources:facts.sources,...eng,...ex,...cr}))).digest('hex');
  }
  /** The plan's generated AI coloured examples, by id (absolute paths for the renderer). */
  #examplePaths(dir,plan){return Object.fromEntries((plan.examples??[]).filter(x=>x.sha256).map(x=>[x.id,joinPath(dir,x.file)]));}
  /** The standard Stage 3 QC, plus the engine checks for Hybrid / AI Creative (never instead of them). */
  async #marketingQc({dir,facts,plan,listing,results,art}){
    const qc=await runStage3Qc({productDir:dir,facts,plan,listing,renderResults:results,artManifest:art.manifest,sceneShas:plan.scenes.map(x=>x.sha256).filter(Boolean)});
    if(!plan.engine||plan.engine.id==='factory')return qc;
    const shapes={};
    for(const [i,r] of results.entries()){
      // The card's own backplate, or the one it shares (scene id); for every other plan the same scene as before.
      const slide=plan.slides[i], sc=slide?.scene?plan.scenes.find(x=>x.id===slide.scene):plan.scenes.find(x=>x.slide===slide?.id);
      if(sc?.sha256&&r.layout)shapes[slide.id]=await productLikeShapes(await readFileFs(joinPath(dir,sc.file)),r.layout.region);
    }
    const e=engineQc({plan,renderResults:results,productShare,shapes,facts});
    const x=await this.#generatedAssetQc({dir,plan});
    const checks=[...qc.checks,...e.checks,...x.checks];
    return {...qc,checks,warnings:[...e.warnings,...x.warnings],passed:checks.every(c=>c.ok)};
  }

  /**
   * QC of the AI assets themselves (deterministic, no model call, never a regeneration):
   *  - coloured example fidelity: severe drift from the approved line art blocks a colouring-book creative plan (the owner
   *    decides what to do); mild drift, and any drift in an older plan, is only a warning;
   *  - lifestyle backplates must differ from each other (creative plans);
   *  - a coloured example made for an earlier campaign concept is flagged, never silently regenerated.
   */
  async #generatedAssetQc({dir,plan}){
    const checks=[], warnings=[], creative=!!plan.creative?.composer;
    const ex=[];
    for(const e of plan.examples??[]){
      if(!e.sha256||!await accessFs(joinPath(dir,e.file)).then(()=>true,()=>false))continue;
      ex.push({id:e.id,...await exampleFidelity(await readFileFs(joinPath(dir,e.source.file)),await readFileFs(joinPath(dir,e.file)))});
      if(plan.campaign_direction?.concept&&e.concept_sha&&e.concept_sha!==conceptDigest(plan.campaign_direction.concept))
        warnings.push(`The coloured example ${e.id} was made for an earlier campaign concept. It was kept (no automatic regeneration); regenerate it if its colours no longer fit.`);
    }
    if(ex.length){const f=fidelityChecks(ex);if(creative)checks.push(...f.checks);else warnings.push(...f.checks.filter(c=>!c.ok).map(c=>c.detail));warnings.push(...f.warnings);}
    if(creative){
      const scenes=[];
      for(const sc of plan.scenes??[])if(sc.sha256&&await accessFs(joinPath(dir,sc.file)).then(()=>true,()=>false))scenes.push({id:sc.id,bytes:await readFileFs(joinPath(dir,sc.file))});
      if(scenes.length>1){const d=await backplateDifferentiation(scenes);checks.push(...d.checks);warnings.push(...d.warnings);}
    }
    return {checks,warnings};
  }
  /** The real approved artwork the art director sees (downscaled PNG; for colour and mood only). */
  #representative(facts,art){return representativeArtwork(facts,art);}
  /**
   * Plan for an engine run: one art-direction call (all art-directed slides +
   * tone lines), then one environment per art-directed slide. A hero made by
   * the comparison for this engine is reused (its direction and paid scene).
   */
  async #planEngine(p,{engine,facts,strategy,skeleton,art}){
    if(adapterOf(facts).creative)return this.#planCreative(p,{engine,facts,strategy,art});
    const slides=skeleton.slides, env=slides.filter(usesEnvironment), tone=slides.filter(s=>s.tone), hero=slides[0];
    const cmp=p.marketing?.comparison?.engines?.[engine];
    this.log(`#${p.product_id} marketing (${engine}): art direction for ${env.length} images + tone line (1 AI text call).`);
    const d=await generateArtDirection(this.ai,{engine,facts,strategy,slides:env,toneSlides:tone,artwork:await this.#representative(facts,art),campaign:cmp?.campaign??null});
    const directions={...d.data.slides,...(cmp?.direction&&env.some(s=>s.id===hero.id)?{[hero.id]:cmp.direction}:{})};
    const aspectOf=s=>{const a=slideArtwork(s,facts,art)[0];return a.width/a.height;};
    const plan={...skeleton,engine:{id:engine,version:ENGINE_VERSION},campaign_direction:d.data.campaign,model:d.model,generated_at:this.now().toISOString(),directions,
      slides:slides.map(s=>{const l=d.data.lines.find(y=>y.id===s.id), base=l?{...s,copy:{...s.copy,subline:{text:l.text,by:'model'}}}:s;
        if(usesEnvironment(s))return {...base,scene:`env-${s.id}`,min_product_share:engineMinShare(s,engine)};
        return s.template==='designs'&&env.some(x=>x.id===hero.id)?{...base,scene:`env-${hero.id}`}:base;}),
      scenes:env.map(s=>({id:`env-${s.id}`,slide:s.id,purpose:s.purpose,
        prompt:environmentPrompt({engine,slide:s,direction:directions[s.id],facts,strategy,campaign:d.data.campaign,aspect:aspectOf(s),route:s.id===hero.id?routeContract(engine,facts):null}),
        file:`marketing/engines/${engine}/scenes/${s.id}.png`,sha256:null,model:null,size:null}))};
    // Reuse the comparison's paid hero environment when it is still on disk, unchanged.
    const heroScene=plan.scenes.find(x=>x.slide===hero.id);
    if(heroScene&&cmp?.scene&&cmp.scene.file===heroScene.file&&await this.store.exists(p,cmp.scene.file)
      &&createHash('sha256').update(await this.store.readBytes(p,cmp.scene.file)).digest('hex')===cmp.scene.sha256)
      Object.assign(heroScene,{prompt:cmp.scene.prompt,sha256:cmp.scene.sha256,model:'reused from the hero comparison'});
    const appr=approvedHeroFor(p,engine);
    if(appr&&env.some(s=>s.id===hero.id))plan.approved_hero=approvalLock(appr,hero.id);   // ADR-065: checked before any paid image
    return plan;
  }

  /**
   * Creative plan (ADR-058; formats with a creative plan, e.g. crochet): the code
   * baseline cards, one art-direction call under the Creative Director instruction
   * (every card), then one environment image per card whose direction asks for one
   * (at most MAX_ENVIRONMENTS).
   */
  async #planCreative(p,{engine,facts,strategy,art}){
    const {concept:_baselineConcept,...skeleton}=adapterOf(facts).creative.plan(facts,{strategy,engine});
    // ADR-065: the hero the owner approved in the comparison (its validated direction, campaign and paid backplate) IS the
    // campaign hero: never re-directed, never repainted. Legacy approvals (before route contracts) are honoured as shown.
    const approved=approvedHeroFor(p,engine), appr=approved?.direction?.composition&&approved.scene?approved:null;
    if(appr)skeleton.slides=[approvedHeroSlide(skeleton.slides[0],appr.direction),...skeleton.slides.slice(1)];
    const slides=skeleton.slides, tone=slides.filter(s=>s.tone), heroId=slides[0].id;
    this.log(`#${p.product_id} marketing (${engine}): creative direction for ${slides.length} images (1 AI text call)${appr?'; the approved comparison hero is kept':''}.`);
    const d=await generateArtDirection(this.ai,{engine,facts,strategy,slides,toneSlides:tone,artwork:await this.#representative(facts,art),art,campaign:appr?.campaign??null});
    // The approved campaign (palette, light, concept) styles every card, so the other backplates and the example match the approved hero.
    const campaign=appr?.campaign??d.data.campaign;
    // A card that shares another card's backplate (creative.scene_of; colouring books: 02 uses 01's) owns no scene and costs no image.
    const directions=appr?{...d.data.slides,[heroId]:{...appr.direction,source:'approved-comparison'}}:d.data.slides, env=slides.filter(s=>usesCreativeEnvironment(s,directions[s.id])&&!s.creative.scene_of);
    const sceneOf=s=>env.some(x=>x.id===(s.creative.scene_of??s.id))?`env-${s.creative.scene_of??s.id}`:null;
    const plan={...skeleton,engine:{id:engine,version:ENGINE_VERSION},campaign_direction:campaign,model:d.model,generated_at:this.now().toISOString(),directions,
      slides:creativeSlides(slides,directions,d.data.lines).map(s=>usesCreativeEnvironment(s,directions[s.id])&&sceneOf(s)?{...s,scene:sceneOf(s)}:s),
      scenes:env.map(s=>appr&&s.id===heroId
        ?{id:`env-${s.id}`,slide:s.id,purpose:s.purpose,prompt:appr.scene.prompt,file:appr.scene.file,sha256:appr.scene.sha256,model:'reused from the approved hero comparison',size:null}
        :{id:`env-${s.id}`,slide:s.id,purpose:s.purpose,prompt:creativeEnvironmentPrompt({direction:directions[s.id],facts,strategy,campaign}),
          file:`marketing/engines/${engine}/scenes/${s.id}.png`,sha256:null,model:null,size:null})};
    if(appr)plan.approved_hero=approvalLock(appr,heroId);
    // Colouring books (ADR-060): the coloured example follows the hero's page; lifestyle cards prefer different pages. Free.
    const fin=adapterOf(facts).creative.finalise?.({slides:plan.slides,directions:plan.directions,concept:campaign?.concept},facts);
    return fin?{...plan,...fin}:plan;
  }

  /**
   * Hero comparison (PRODUCTION_APPROVED, no state change): 01-hero in Factory,
   * Hybrid and AI Creative, costed like any other call. Paid assets are kept in
   * marketing/engines/<engine>/ and reused by the full campaign of that engine.
   */
  async runHeroComparison(productId,actor){
    const r=await this.#guarded(productId,'marketing-compare',actor,async(p,commit)=>{
      if(p.status!=='PRODUCTION_APPROVED')throw Object.assign(new Error(`The hero comparison needs PRODUCTION_APPROVED; #${productId} is ${p.status}.`),{retryable:false});
      const dir=this.store.dirOf(p), sha=b=>createHash('sha256').update(b).digest('hex'), has=rel=>this.store.exists(p,rel);
      const facts=await deriveFacts(dir);
      if(!await has('marketing/strategy.json'))await this.store.writeJson(p,'marketing/strategy.json',deriveStrategy(facts));
      const strategy=await this.store.readJson(p,'marketing/strategy.json');
      const art=await prepareArt(facts,dir,joinPath(dir,'marketing','work'));
      const hero=planSlides(facts,{maxScenes:0,strategy}).slides[0];
      const prev=p.marketing?.comparison?.engines??{}, engines={};
      // Routes produced so far (this run first, then earlier comparison entries): the pre-image gate compares against them (ADR-064).
      const others=engine=>[...Object.entries(engines).map(([e,x])=>({engine:e,route:x.route,brief:x.brief})),
        ...this.#producedRoutes(p,facts,engine).filter(o=>!engines[o.engine])];
      // `gate` runs only when an image would be PAID for (a scene already on disk is reused, never re-gated).
      const image=async(rel,prompt,factory,gate=null)=>{
        if(await has(rel))return {file:rel,sha256:sha(await this.store.readBytes(p,rel)),prompt};
        if(gate)prompt=gate()??prompt;
        this.log(`#${productId} hero comparison: environment for ${rel} (1 AI image call).`);
        const img=factory?await generateScene(this.ai,{prompt}):await generateEnvironment(this.ai,{prompt});
        await this.store.writeBytes(p,rel,img.bytes);return {file:rel,sha256:sha(img.bytes),prompt};
      };
      const render=async(engine,slide,sceneRel,directions={},examples={})=>{
        const out=joinPath(dir,'marketing','comparison',engine);
        const [res]=await renderSlides({facts,plan:{slides:[slide]},art,scenes:sceneRel?{[slide.scene]:joinPath(dir,sceneRel)}:{},examples,outDir:out,engine,directions});
        const rel=`marketing/comparison/${engine}/${hero.id}.png`;
        return {file:rel,sha256:sha(await this.store.readBytes(p,rel)),share:productShare(res.artwork,res.width)};
      };
      // Factory: its own hero with the campaign's tabletop scene (none when scenes are switched off).
      // The hero's own scene from the format's plan (greeting cards: tabletop).
      const heroScene=planSlides(facts,{strategy}).slides[0].scene;
      const fPrompt=heroScene?scenePrompt({scene:heroScene,brief:null,facts,strategy}):'', fBrief=fPrompt.split('\n')[1]??'';
      const fScene=this.marketingScenes>0&&heroScene?await image(`marketing/engines/factory/scenes/${hero.id}.png`,fPrompt,true,
        ()=>{this.#routeGate(productId,{engine:'factory',facts,brief:fBrief,others:others('factory')});return null;}):null;
      const f=await render('factory',{...hero,scene:fScene?heroScene:undefined},fScene?.file);
      engines.factory={image:{file:f.file,sha256:f.sha256},scene:fScene,route:routeOf(routeContract('factory',facts)),brief:fBrief};
      // Colouring books (ADR-060): Hybrid / AI Creative heroes are the campaign's own creative hero card, so the comparison
      // shows what the campaign will lead with. Same cost: 1 direction call + 1 backplate per engine; no coloured example is
      // generated here (an existing example of the hero page is shown when one is on disk).
      const cr=adapterOf(facts).creative;
      for(const engine of ['hybrid','ai-creative']){
        // Each engine's hero card follows its own route contract (ADR-064): a different composition, not a different adjective.
        const cHero=cr?.concept?cr.plan(facts,{strategy,engine}).slides[0]:null, contract=routeContract(engine,facts), route=routeOf(contract);
        let {direction=null,campaign=null}=prev[engine]??{};
        if(cHero){
          if(!direction?.composition){
            this.log(`#${productId} hero comparison: ${engine} creative direction (1 AI text call).`);
            const d=await generateArtDirection(this.ai,{engine,facts,strategy,slides:[cHero],toneSlides:[],artwork:await this.#representative(facts,art),art});
            const fin=cr.finalise?.({slides:[cHero],directions:d.data.slides,concept:d.data.campaign?.concept},facts);
            direction=(fin?.directions??d.data.slides)[cHero.id];campaign=d.data.campaign;
            p=await commit(p);
          }
          const scene=await image(`marketing/engines/${engine}/scenes/${cHero.id}.png`,creativeEnvironmentPrompt({direction,facts,strategy,campaign}),false,()=>{
            const g=this.#routeGate(productId,{engine,facts,brief:direction.scene_brief,others:others(engine)});
            if(!g.redirected)return null;
            direction={...direction,scene_brief:cHero.creative.scene_brief,fallbacks:[...(direction.fallbacks??[]),'scene_brief (route gate)']};
            return creativeEnvironmentPrompt({direction,facts,strategy,campaign});});
          // Only a route that demonstrates the transformation shows the coloured example (Hybrid); AI Creative reveals one page.
          const exId=`example-p${Number(String(direction.focal_asset).slice(5))}`, exRel=`marketing/examples/${exId}.png`, withEx=!!cHero.example&&await has(exRel);
          const e=await render(engine,{...cHero,scene:`env-${cHero.id}`,...(withEx?{example:exId}:{})},scene.file,{[cHero.id]:direction},withEx?{[exId]:joinPath(dir,exRel)}:{});
          this.log(`#${productId} hero comparison: ${engine} hero ${!cHero.example?'has no coloured example by route':withEx?`shows the existing coloured example ${exRel}`:'has no coloured example yet (made in the full campaign)'}.`);
          engines[engine]={image:{file:e.file,sha256:e.sha256},scene,direction,campaign,route:direction.route??route,brief:direction.scene_brief};
          continue;
        }
        if(!direction){
          this.log(`#${productId} hero comparison: ${engine} art direction (1 AI text call).`);
          const d=await generateArtDirection(this.ai,{engine,facts,strategy,slides:[hero],toneSlides:[],artwork:await this.#representative(facts,art)});
          direction=d.data.slides[hero.id];campaign=d.data.campaign;
          p=await commit(p);   // flush the metered call into the ledger now
        }
        const lead=slideArtwork(hero,facts,art)[0], envPrompt=dr=>environmentPrompt({engine,slide:hero,direction:dr,facts,strategy,campaign,aspect:lead.width/lead.height,route:contract});
        const scene=await image(`marketing/engines/${engine}/scenes/${hero.id}.png`,envPrompt(direction),false,()=>{
          const g=this.#routeGate(productId,{engine,facts,brief:direction.scene_brief,others:others(engine)});
          if(!g.redirected)return null;
          direction={...direction,scene_brief:g.brief};return envPrompt(direction);});
        const e=await render(engine,{...hero,scene:`env-${hero.id}`},scene.file,{[hero.id]:direction});
        engines[engine]={image:{file:e.file,sha256:e.sha256},scene,direction,campaign,route,brief:direction.scene_brief};
      }
      const m=p.marketing??{listing:null,plan:null,images:null,qc:null,pending_scope:null,approved_at:null};
      return {...p,marketing:{...m,comparison:{at:this.now().toISOString(),engines}},updated_at:this.now().toISOString()};
    });
    if(r.outcome!=='ok')return r;
    const p=await this.store.load(productId), chatId=p.request.chat_id, E=p.marketing.comparison.engines;
    const items=await Promise.all([['factory','🧱 Factory'],['hybrid','🎨 Hybrid'],['ai-creative','✨ AI Creative']].map(async([k,label])=>({bytes:await this.store.readBytes(p,E[k].image.file),fileName:`${p.product_id}-${k}-01-hero.png`,caption:`#${p.product_id} · ${label} — 01 Hero`})));
    for(const it of items)await this.#quiet(()=>this.telegram.sendPhoto({chatId:String(chatId),...it}));
    const c=this.#productCost(p), row=c?.rows.find(x=>x.key==='marketing');
    await this.#sayAction(p,[`🆚 PRODUCT #${p.product_id} — HERO COMPARISON`,'','The same real product artwork in each style. Which direction should I use?',
      ...(c?['',`Comparison cost so far (marketing): ${gbp(row?.gbp??0)}`,`Product total: ${gbp(c.total)}`]:[])].join('\n'),comparisonKeyboard(p),{label:'Hero comparison is ready.'});
    return {outcome:'hero_comparison_ready',productId};
  }

  /**
   * One campaign image (AWAITING_MARKETING_APPROVAL): regenerate its scene or
   * its art direction (paid), or rebuild its composite from the existing assets
   * (free). Only that image (and, for a shared Factory scene, the images using
   * it) is re-rendered; the whole campaign is then QC'd again before review.
   */
  async runMarketingAsset(productId,actor,{index,op,feedback=null}){
    const r=await this.#guarded(productId,'marketing',actor,async(p,commit)=>{
      const dir=this.store.dirOf(p), sha=b=>createHash('sha256').update(b).digest('hex');
      p=await commit(transition(p,'marketing_started',{actor,now:this.now()}));
      const facts=await deriveFacts(dir), strategy=await this.store.readJson(p,'marketing/strategy.json');
      const plan=await this.store.readJson(p,'marketing/plan.json'), slide=plan.slides[index-1], engine=plan.engine?.id??'factory';
      const art=await prepareArt(facts,dir,joinPath(dir,'marketing','work'));
      p=await commit(transition(p,'marketing_planned',{actor,now:this.now()}));
      let only=[slide.id];
      let sc=engine==='factory'?plan.scenes.find(x=>x.id===slide.scene):plan.scenes.find(x=>x.slide===slide.id||(slide.creative?.scene_of&&x.id===slide.scene));
      const replaceScene=async()=>{
        if(!sc)throw Object.assign(new Error(`${slide.id} has no AI scene to regenerate.`),{retryable:false});
        if(await this.store.exists(p,sc.file))await this.#archiveAsset(p,sc.file);
        this.log(`#${productId} marketing asset ${slide.id}: new environment (1 AI image call).`);
        const img=engine==='factory'?await generateScene(this.ai,{prompt:sc.prompt}):await generateEnvironment(this.ai,{prompt:sc.prompt});
        await this.store.writeBytes(p,sc.file,img.bytes);Object.assign(sc,{sha256:sha(img.bytes),model:img.model,size:img.size});
        if(engine==='factory')only=plan.slides.filter(s=>s.scene===sc.id).map(s=>s.id);   // a shared scene re-renders every image using it
      };
      if(op==='scene')await replaceScene();
      if(op==='direction'&&slide.template==='creative'){
        // ADR-058: re-direct one creative card. A paid scene is regenerated only when the card has (or now asks for) an environment.
        const d=await generateArtDirection(this.ai,{engine,facts,strategy,slides:[slide],toneSlides:[],artwork:await this.#representative(facts,art),feedback,campaign:plan.campaign_direction,art});
        const next=d.data.slides[slide.id], others=plan.slides.filter(s=>s.id!==slide.id&&usesCreativeEnvironment(s,plan.directions?.[s.id])&&!s.creative?.scene_of).length;
        plan.directions={...plan.directions,[slide.id]:next.background==='environment'&&!sc&&others>=environmentCap(plan.slides,plan.creative?.max_environments)?{...slide.creative,id:slide.id,source:'baseline',fallbacks:['background (environment limit)']}:next};
        plan.slides[index-1]=creativeSlides([slide],plan.directions)[0];
        p=await commit(p);
        if(usesCreativeEnvironment(slide,plan.directions[slide.id])){
          const prompt=creativeEnvironmentPrompt({direction:plan.directions[slide.id],facts,strategy,campaign:plan.campaign_direction});
          if(sc)sc.prompt=prompt;
          else{sc={id:`env-${slide.id}`,slide:slide.id,purpose:slide.purpose,prompt,file:`marketing/engines/${engine}/scenes/${slide.id}.png`,sha256:null,model:null,size:null};
            plan.scenes.push(sc);plan.slides[index-1]={...plan.slides[index-1],scene:sc.id};}
          await replaceScene();
        }
      }
      else if(op==='direction'){
        const d=await generateArtDirection(this.ai,{engine,facts,strategy,slides:[slide],toneSlides:[],artwork:await this.#representative(facts,art),feedback,campaign:plan.campaign_direction});
        plan.directions={...plan.directions,[slide.id]:d.data.slides[slide.id]};
        const lead=slideArtwork(slide,facts,art)[0];
        sc.prompt=environmentPrompt({engine,slide,direction:plan.directions[slide.id],facts,strategy,campaign:plan.campaign_direction,aspect:lead.width/lead.height});
        p=await commit(p);
        await replaceScene();
      }
      // ADR-065: the owner deliberately replacing the approved hero's scene or direction is a NEW owner decision: recorded, not policed.
      if(plan.approved_hero&&!plan.approved_hero.superseded&&(op==='scene'||op==='direction')&&(slide.id===plan.approved_hero.slide||sc?.slide===plan.approved_hero.slide||sc?.id===plan.slides.find(s=>s.id===plan.approved_hero.slide)?.scene))
        plan.approved_hero={...plan.approved_hero,superseded:{op,slide:slide.id,by:actor,at:this.now().toISOString()}};
      await this.store.writeJson(p,'marketing/plan.json',plan);
      p=await commit({...p,marketing:{...p.marketing,plan:{file:'marketing/plan.json',sha256:sha(await this.store.readBytes(p,'marketing/plan.json'))}}});
      const fresh=await renderSlides({facts,plan,art,scenes:Object.fromEntries(plan.scenes.filter(x=>x.sha256).map(x=>[x.id,joinPath(dir,x.file)])),examples:this.#examplePaths(dir,plan),
        outDir:joinPath(dir,'marketing','images'),engine,directions:plan.directions??{},only});
      const prev=await this.store.readJson(p,'marketing/images/render.json');
      const rec=x=>{const {outPath,thumbPath,contactSheet,...rest}=x;return {...rest,file:outPath.split(/[\\/]/).at(-1),thumb:`thumbs/${thumbPath.split(/[\\/]/).at(-1)}`};};
      const merged=prev.map(x=>{const f=fresh.find(y=>y.slide===x.slide);return f?rec(f):x;});
      await this.store.writeJson(p,'marketing/images/render.json',merged);
      const results=merged.map(x=>({...x,outPath:joinPath(dir,'marketing','images',x.file),thumbPath:joinPath(dir,'marketing','images',x.thumb)}));
      p=await commit(transition({...p,marketing:{...p.marketing,images:{count:results.length,dir:'marketing/images',digest:this.#imagesDigest({plan,art,facts})},
        asset_ops:[...(p.marketing.asset_ops??[]),{slide:slide.id,op,at:this.now().toISOString(),by:actor}].slice(-200)}},'marketing_generated',{actor,now:this.now()}));
      const qc=await this.#marketingQc({dir,facts,plan,listing:await this.store.readJson(p,'marketing/listing.json'),results,art});
      const at=this.now().toISOString();
      await this.store.writeJson(p,'marketing/qc.json',{...qc,at});
      p={...p,marketing:{...p.marketing,qc:{passed:qc.passed,report:'marketing/qc.json',at}}};
      if(!qc.passed){await commit(p);const e=new Error(`marketing QC failed: ${qc.checks.filter(c=>!c.ok).map(c=>`${c.name}: ${c.detail}`).join('; ')}`);e.name='MarketingQcError';e.retryable=false;throw e;}
      return transition({...p,marketing:{...p.marketing,pending_scope:null}},'marketing_qc_passed',{actor,now:this.now()});
    });
    if(r.outcome!=='ok')return r;
    return this.#sendMarketingReview(productId,{only:[index]});
  }
  /** Move a replaced paid asset to marketing/history/assets/ (never deleted). */
  async #archiveAsset(p,rel){
    const dir=this.store.dirOf(p), base=rel.split('/').at(-1).replace(/\.png$/,'');
    let v=1;while(await accessFs(joinPath(dir,'marketing','history','assets',`${base}-v${String(v).padStart(2,'0')}.png`)).then(()=>true,()=>false))v++;
    await mkdir(joinPath(dir,'marketing','history','assets'),{recursive:true});
    await rename(joinPath(dir,rel),joinPath(dir,'marketing','history','assets',`${base}-v${String(v).padStart(2,'0')}.png`));
  }
  /** Calls the chosen engine's next full run would make, with the ledger's recent average cost. */
  async #marketingEstimate(p,engine){
    const has=rel=>this.store.exists(p,rel);
    let text=await has('marketing/listing.json')?0:1, image=0;
    if(engine==='factory'){text+=1;image=await this.#plannedScenes(p);}
    else{
      text+=1;
      try{
        const facts=await deriveFacts(this.store.dirOf(p)), ad=adapterOf(facts);
        // Creative plans (ADR-058): one image per baseline environment card; the hero comparison is not reused.
        // ADR-065: an approved comparison hero's backplate is reused, so it is not estimated again.
        if(ad.creative)image=this.#creativeImages(ad,facts)-(p.marketing?.comparison?.engines?.[engine]?.scene?1:0);
        else{const sk=planSlides(facts,{maxScenes:0}), env=sk.slides.filter(usesEnvironment);
          image=env.length-(p.marketing?.comparison?.engines?.[engine]?.scene?1:0)+(sk.examples?.length??0);}
      }catch{image=5;}
    }
    const l=this.#ledgerEvents();
    return estimateCalls(l?l.events:[],{text,image});
  }

  /** AI images a creative plan requests: one per backplate it owns (a shared backplate is one image) plus its coloured examples. */
  #creativeImages(ad,facts){
    const cp=ad.creative.plan(facts,{});
    return cp.slides.filter(s=>usesCreativeEnvironment(s)&&!s.creative.scene_of).length+(cp.examples?.length??0);
  }

  /** AI images (environment scenes + coloured examples) the next visual (re)generation will request, from the CURRENT configuration. */
  async #plannedScenes(p){
    try{
      const facts=await this.store.exists(p,'marketing/facts.json')?await this.store.readJson(p,'marketing/facts.json'):await deriveFacts(this.store.dirOf(p));
      if((p.marketing?.engine??'factory')!=='factory'&&adapterOf(facts).creative)return this.#creativeImages(adapterOf(facts),facts);
      const plan=planSlides(facts,{maxScenes:this.marketingScenes});
      return plan.scenes.length+(plan.examples?.length??0);
    }catch{return this.marketingScenes;}
  }

  /** Summary, full description, the actual listing images (PNG), then the buttons with their AI cost. Sends only. */
  async #sendMarketingReview(productId,{only=null}={}){
    const p=await this.store.load(productId), chatId=p.request.chat_id;
    const [listing,plan,qc,render]=await Promise.all(['marketing/listing.json','marketing/plan.json','marketing/qc.json','marketing/images/render.json'].map(f=>this.store.readJson(p,f)));
    const strategy=await this.store.exists(p,'marketing/strategy.json')?await this.store.readJson(p,'marketing/strategy.json'):null;
    await this.#say(chatId,marketingSummary(p,{listing,plan,qc,strategy}));
    await this.#say(chatId,`Description:\n\n${listing.description}`.slice(0,4000));
    const items=await Promise.all(render.filter((x,i)=>!only||only.includes(i+1)).map(async x=>({bytes:await this.store.readBytes(p,`marketing/images/${x.file}`),fileName:`${p.product_id}-${x.file}`,caption:`#${p.product_id} · ${x.file.replace(/\.png$/,'')}`})));
    // What Etsy search shows: every image at 300 px, side by side.
    if(await this.store.exists(p,'marketing/images/thumbs/contact-sheet.png')){
      const bytes=await this.store.readBytes(p,'marketing/images/thumbs/contact-sheet.png');
      await this.#quiet(()=>this.telegram.sendPhoto({chatId:String(chatId),bytes,fileName:`${p.product_id}-thumbnails.png`,caption:`#${p.product_id} · Etsy thumbnail check (300 px)`}));
    }
    for(let i=0;i<items.length;i+=10){
      const chunk=items.slice(i,i+10);
      await this.#quiet(()=>chunk.length>1?this.telegram.sendPhotoAlbum(String(chatId),chunk):this.telegram.sendPhoto({chatId:String(chatId),...chunk[0]}));
    }
    const c=this.#productCost(p), row=c?.rows.find(x=>x.key==='marketing');
    const costText=c?['Marketing generation',`Estimated API cost: ${gbp(row?.gbp??0)}`,'','Product total:',gbp(c.total)]:['Estimated API cost: not tracked (no cost ledger configured)'];
    const style=plan.engine?.id?`Marketing style: ${ENGINE_LABEL(plan.engine.id)}`:null;
    const warn=(qc.warnings??[]).length?['',...qc.warnings.map(w=>`⚠️ ${w}`)]:[];
    await this.#sayAction(p,[style,...warn,style||warn.length?'':null,...costText,'','Approve this listing and these images? Nothing is published.'].filter(x=>x!==null).join('\n').replace(/^\n+/,''),marketingKeyboard(p,{scenes:await this.#plannedScenes(p)}));
    return {outcome:'awaiting_marketing_approval',productId};
  }

  /** Move this scope's paid artefacts to marketing/history/vNN/ so they are regenerated (never deleted). */
  async #archiveMarketing(p,scope){
    const dir=this.store.dirOf(p), paths={copy:['listing.json','tag-selection.json'],marketing:['plan.json','scenes','examples','images'],all:['listing.json','tag-selection.json','strategy.json','plan.json','scenes','examples','images']}[scope];
    let v=1;while(await accessFs(joinPath(dir,'marketing','history',`v${String(v).padStart(2,'0')}`)).then(()=>true,()=>false))v++;
    const dest=joinPath(dir,'marketing','history',`v${String(v).padStart(2,'0')}`);
    await mkdir(dest,{recursive:true});
    for(const x of paths){const from=joinPath(dir,'marketing',x);if(await accessFs(from).then(()=>true,()=>false))await rename(from,joinPath(dest,x));}
    return `marketing/history/v${String(v).padStart(2,'0')}`;
  }

  async #cancelMarketing(p,actor){
    await this.store.save(transition(p,'marketing_cancelled',{actor,now:this.now()}));
    await this.#say(p.request.chat_id,`Marketing cancelled for #${p.product_id}. It stays production-approved and all files are kept. Send /market ${p.product_id} to continue.`);
    return {outcome:'marketing_cancelled',productId:p.product_id};
  }

  // ---------- Stage 4: Etsy draft, then (separately) an owner-confirmed publish ----------
  /** /etsy <id> [confirm-no-draft | section]: prepare/resume the DRAFT, or re-verify an existing one. Never publishes. */
  async #etsyCommand(p,sub,actor,chatId){
    const cfg=this.stage4.config;
    if(sub==='section'){
      if(p.status!=='AWAITING_ETSY_PUBLISH_APPROVAL'){await this.#say(chatId,`Etsy section: #${p.product_id} has no Etsy draft to organise (it is ${p.status}).`);return {outcome:'nothing_to_do'};}
      return this.runEtsySection(p.product_id,actor);
    }
    if(sub==='confirm-no-draft'){
      if(!(p.status==='FAILED'&&inEtsy(p)&&/UNCERTAIN_CREATE/.test(p.last_error?.message??''))){await this.#say(chatId,'Nothing to confirm: there is no uncertain draft creation.');return {outcome:'nothing_to_do'};}
      const {engine}=await this.#stage4Engine(p);
      await engine.confirmNoDraft();
      // The owner has resolved the uncertainty, so a retry is now safe (the engine also requires this record).
      const cleared={...p,last_error:{...p.last_error,message:`Owner confirmed on Etsy that no draft exists; the draft creation can be retried. (${p.last_error.message.replace(/UNCERTAIN_CREATE/g,'uncertain create')})`},updated_at:this.now().toISOString()};
      await this.store.save(cleared);
      await this.#say(chatId,`Recorded: you checked Etsy and #${p.product_id} has no draft. Retry creates it.`,failureKeyboard(cleared));
      return {outcome:'etsy_no_draft_confirmed',productId:p.product_id};
    }
    if(p.status==='PUBLISHED'){await this.#say(chatId,`Product #${p.product_id} is already live on Etsy (listing ${p.etsy?.listing_id}).`);return {outcome:'nothing_to_do'};}
    // A dry-run record is simulated: switching the server to live starts Stage 4 afresh (no real Etsy object exists).
    if(p.etsy?.mode==='dry-run'&&cfg.mode==='live'&&(p.status==='AWAITING_ETSY_PUBLISH_APPROVAL'||(p.status==='FAILED'&&inEtsy(p)))){
      const {etsy,...rest}=p;
      p=transition(rest,'etsy_dry_run_reset',{actor,now:this.now()});await this.store.save(p);
      this.log(`#${p.product_id} Stage 4: discarded the dry-run record (kept in etsy/dry-run/) to start a live draft.`);
    }
    if(p.status==='AWAITING_ETSY_PUBLISH_APPROVAL')return this.runEtsyRefresh(p.product_id,actor);   // read-only re-check + review
    if(p.status==='FAILED'&&inEtsy(p)){
      const step=p.last_error?.step;await this.store.save(transition(p,'retry',{actor,now:this.now()}));
      if(step==='etsy-publish')return this.runEtsyPublishReconcile(p.product_id,actor);
      if(step==='etsy-refresh')return this.runEtsyRefresh(p.product_id,actor);
      return this.runEtsyDraft(p.product_id,actor);
    }
    if(p.status!=='MARKETING_APPROVED'){await this.#say(chatId,`Stage 4 needs an approved listing and images (MARKETING_APPROVED). #${p.product_id} is ${p.status}.`);return {outcome:'not_approved',productId:p.product_id};}
    const problems=stage4Problems(cfg);
    if(problems.length){await this.#say(chatId,[`Stage 4 cannot start for #${p.product_id}. Nothing was sent to Etsy.`,...problems.map(x=>`• ${x}`)].join('\n'));return {outcome:'etsy_not_configured',productId:p.product_id};}
    await this.#setActive(chatId,p.product_id);
    await this.#say(chatId,cfg.mode==='live'
      ?`Product #${p.product_id}: creating the Etsy DRAFT (not live), uploading the approved images and customer ZIP, then verifying it on Etsy. No OpenAI calls. Nothing will be published.`
      :`Product #${p.product_id}: Stage 4 DRY RUN. Building the Etsy payload and customer ZIP and simulating the draft. Nothing is sent to Etsy.`);
    return this.runEtsyDraft(p.product_id,actor);
  }

  /** The Stage 4 engine for this product. A record keeps the mode it was created in (dry-run never mixes with live). */
  async #stage4Engine(p){
    const cfg=this.stage4.config, mode=p.etsy?.mode??cfg.mode, dir=this.store.dirOf(p);
    if(mode==='blocked')throw new Stage4Error('CONFIG','Etsy writes are disabled on this server (ETSY_DRAFT_WRITES_ENABLED is not true).',{retryable:false});
    let client;
    if(mode==='dry-run')client=new DryRunEtsy({dir:etsyDirFor(dir,'dry-run')});
    else{
      if(cfg.mode!=='live'||!this.stage4.liveClient)throw new Stage4Error('CONFIG','This product has a LIVE Etsy draft but the server is not configured for live Etsy access (ETSY_STAGE4_DRY_RUN=false and ETSY_DRAFT_WRITES_ENABLED=true). Nothing was sent.',{retryable:false});
      client=await this.stage4.liveClient();
    }
    const engine=new Stage4({productDir:dir,product:p,client,mode,now:this.now,log:this.log,secrets:client.secrets??[],
      config:{shopId:mode==='live'?cfg.shopId:client.shopId,seller:cfg.seller,publishEnabled:mode==='live'&&cfg.publishEnabled===true,
        ...(cfg.deliveryLimits?{deliveryLimits:cfg.deliveryLimits}:{})}});
    return {engine,client};
  }
  #engineRead(p,name){return readJsonIf(joinPath(etsyDirFor(this.store.dirOf(p),p.etsy?.mode??'dry-run'),name));}
  /** Human-safe error for storage and Telegram: classified and sanitized. */
  #etsyError(err,engine){
    // VERIFY_FAILED carries a short bullet per mismatching field: allow room for all of them.
    const code=classify(err), msg=engine?engine.sanitize(err?.message??String(err),code==='VERIFY_FAILED'?1200:400):'Etsy request failed';
    const retryable=err instanceof Stage4Error?err.retryable:['RATE_LIMIT','NETWORK_ERROR','ETSY_SERVER_ERROR'].includes(code);
    return new Stage4Error(code,`[${code}] ${msg}`,{retryable});
  }
  async #withEtsy(p,fn){
    const {engine,client}=await this.#stage4Engine(p);
    try{return await (client.withLock?client.withLock(()=>fn(engine)):fn(engine));}
    catch(err){throw this.#etsyError(err,engine);}
  }
  #publishAllowed(p){const c=this.stage4.config;return p.etsy?.mode==='live'&&c.mode==='live'&&c.publishEnabled===true&&p.etsy?.verification?.passed===true;}
  #publishBlockedReason(p){
    const c=this.stage4.config;
    return [`#${p.product_id} was NOT published.`,
      p.etsy?.mode!=='live'?'• This is a dry-run record: no Etsy listing exists.':'',
      c.publishEnabled!==true?'• Publishing is switched off on this server (ETSY_PUBLISH_ENABLED is not true).':'',
      p.etsy?.verification?.passed!==true?`• The latest Etsy verification did not pass. Send /etsy ${p.product_id} to re-check.`:''].filter(Boolean).join('\n');
  }

  /** MARKETING_APPROVED -> verified Etsy DRAFT. Resumable; never publishes; zero OpenAI. */
  async runEtsyDraft(productId,actor){
    const r=await this.#guarded(productId,'etsy',actor,async(p,commit)=>this.#withEtsy(p,async engine=>{
      if(p.status==='MARKETING_APPROVED')
        p=await commit(transition({...p,etsy:{mode:engine.mode,listing_id:null,shop_id:null,payload_sha256:null,verification:null,publish_request:null,published_at:null,listing_url:null}},'etsy_started',{actor,now:this.now()}));
      engine.product=p;
      const ctx=await engine.prepare();
      p=await commit({...p,etsy:{...p.etsy,payload_sha256:ctx.payloadSha,shop_id:ctx.shop.shopId}});
      const draft=await engine.ensureDraft(ctx);
      p=await commit(transition({...p,etsy:{...p.etsy,listing_id:draft.listing_id}},'etsy_draft_created',{actor,now:this.now()}));
      p=await commit(transition(p,'etsy_uploading',{actor,now:this.now()}));
      await engine.uploadAssets(ctx,draft);
      await engine.organise(ctx,draft);   // shop section (ADR-054): never fatal, recorded in section.json
      p=await commit(transition(p,'etsy_verifying',{actor,now:this.now()}));
      const v=await engine.verify({expectState:'draft'});
      if(v.critical)throw new Stage4Error('CRITICAL_ACTIVE','The Etsy listing is ACTIVE although publishing was never confirmed. Inspect it on Etsy now.',{retryable:false});
      if(!v.passed)throw new Stage4Error('VERIFY_FAILED',verifyFailedMessage(v),{retryable:true});
      return transition({...p,etsy:{...p.etsy,verification:{passed:true,fingerprint:v.fingerprint,at:v.at},publish_request:null}},'etsy_draft_ready',{actor,now:this.now()});
    }));
    if(r.outcome!=='ok')return r;
    return this.#sendEtsyReview(productId);
  }

  /** Only after remote verification passed: the review, with PUBLISH only if the server allows publishing. */
  async #sendEtsyReview(productId){
    const p=await this.store.load(productId), chatId=p.request.chat_id;
    const [payload,uploads,verification,section]=await Promise.all(['payload.json','uploads.json','verification.json','section.json'].map(f=>this.#engineRead(p,f)));
    const publishable=this.#publishAllowed(p);
    const text=etsyDraftSummary(p,{payload,verification,uploads,section,mode:p.etsy.mode,publishable,publishEnabled:this.stage4.config.publishEnabled===true});
    await this.#sayAction(p,text,etsyReviewKeyboard(p,{publishable,editorUrl:p.etsy.mode==='live'&&p.etsy.listing_id?editorUrl(p.etsy.listing_id):null}));
    return {outcome:'awaiting_etsy_publish_approval',productId,publishable};
  }

  /**
   * /etsy <id> section: retry ONLY the shop-section step (ADR-054) for an existing draft. No prepare, no
   * uploads, no earlier stage, no OpenAI; the product state does not change.
   */
  async runEtsySection(productId,actor){
    let rec=null;
    // Never moves the product to FAILED: a section problem is reported, the verified draft stays as it is.
    const r=await this.#guarded(productId,'etsy-section',actor,async p=>{
      try{await this.#withEtsy(p,async engine=>{rec=await engine.organiseOnly();});}
      catch(err){this.log(`#${productId} Etsy section retry failed: ${err.message}`);rec={status:'failed',section:null,error:err.message};}
      return p;
    });
    if(r.outcome!=='ok')return r;
    const p=await this.store.load(productId);
    await this.#say(p.request.chat_id,etsySectionLines(rec,p).join('\n'));
    return {outcome:'etsy_section',productId,status:rec.status};
  }

  /** REFRESH DRAFT: read-only re-verification (detects manual Etsy edits). Never writes to Etsy. */
  async runEtsyRefresh(productId,actor,{sendReview=true}={}){
    let drift=null;
    const r=await this.#guarded(productId,'etsy-refresh',actor,async p=>this.#withEtsy(p,async engine=>{
      const v=await engine.verify({expectState:'draft'});
      if(v.critical)throw new Stage4Error('CRITICAL_ACTIVE','The Etsy listing is ACTIVE although publishing was never confirmed here. Inspect it on Etsy now.',{retryable:false});
      if(!v.passed)drift=driftLines(v);
      return {...p,etsy:{...p.etsy,verification:{passed:v.passed,fingerprint:v.fingerprint,at:v.at},publish_request:null},review:{...p.review,nonce:newNonce()},updated_at:this.now().toISOString()};
    }));
    if(r.outcome!=='ok')return r;
    // Control panel: the caller renders the product screen (never the Stage 4 review keyboard).
    if(!sendReview)return {outcome:drift?'etsy_drift':'etsy_verified',productId,drift};
    if(!drift)return this.#sendEtsyReview(productId);
    const p=await this.store.load(productId);
    await this.#sayAction(p,[`⚠️ #${p.product_id}: the Etsy draft differs from the approved listing. Publishing is blocked.`,'',...drift,'',
      'Nothing was changed on Etsy. Undo the change in Etsy (or keep it as a draft), then REFRESH DRAFT.'].join('\n'),etsyReviewKeyboard(p,{publishable:false,editorUrl:p.etsy.mode==='live'&&p.etsy.listing_id?editorUrl(p.etsy.listing_id):null}),{label:'The Etsy draft needs checking.'});
    return {outcome:'etsy_drift',productId,drift};
  }

  /** CONFIRM PUBLISH: revalidate everything, activate once, then only a remote read-back showing ACTIVE marks PUBLISHED. */
  async runEtsyPublish(productId,actor){
    let result=null;
    const r=await this.#guarded(productId,'etsy-publish',actor,async(p,commit)=>this.#withEtsy(p,async engine=>{
      const expected=p.etsy.publish_request.fingerprint;
      p=await commit(transition(p,'etsy_publishing',{actor,now:this.now()}));
      engine.product=p;
      result=await engine.publish({expectedFingerprint:expected});
      if(result.outcome==='aborted')
        return transition({...p,etsy:{...p.etsy,publish_request:null,verification:{...p.etsy.verification,passed:false}}},'etsy_publish_aborted',{actor,now:this.now()});
      if(result.outcome==='published')
        return transition({...p,etsy:{...p.etsy,publish_request:null,published_at:result.record.published_at,listing_url:result.record.listing_url??null}},'etsy_published',{actor,now:this.now()});
      throw new Stage4Error('PUBLISH_FAILED','Etsy did not report the listing as active after the publish request. Nothing more was sent. RETRY only re-reads Etsy; it never publishes again.',{retryable:true});
    }));
    if(r.outcome!=='ok')return r;
    const p=await this.store.load(productId);
    if(result.outcome==='aborted'){
      await this.#say(p.request.chat_id,[`#${p.product_id} was NOT published: something changed since you pressed PUBLISH.`,...result.reasons.map(x=>`• ${x}`),'',`The listing is still a draft. Send /etsy ${p.product_id} to re-check it.`].join('\n'));
      return {outcome:'etsy_publish_aborted',productId,reasons:result.reasons};
    }
    await this.#setActive(p.request.chat_id,null);
    await this.#say(p.request.chat_id,etsyPublishedText(p,{payload:await this.#engineRead(p,'payload.json'),record:result.record}));
    return {outcome:'published',productId};
  }

  /** RETRY after an interrupted publish: read Etsy; confirm a completed publish, or go back to review. Never activates. */
  async runEtsyPublishReconcile(productId,actor){
    let published=null;
    const r=await this.#guarded(productId,'etsy-publish',actor,async p=>this.#withEtsy(p,async engine=>{
      engine.product=p;
      const done=await engine.confirmPublished();
      if(done.outcome==='published'){
        published=done.record;
        const mid=transition(p,'etsy_publishing',{actor,now:this.now()});
        return transition({...mid,etsy:{...mid.etsy,publish_request:null,published_at:done.record.published_at,listing_url:done.record.listing_url??null}},'etsy_published',{actor,now:this.now()});
      }
      const v=await engine.verify({expectState:'draft'});
      if(v.critical)throw new Stage4Error('CRITICAL_ACTIVE','The listing is ACTIVE on Etsy but does not match the approved draft. Inspect it on Etsy now.',{retryable:false});
      return {...p,etsy:{...p.etsy,publish_request:null,verification:{passed:v.passed,fingerprint:v.fingerprint,at:v.at}},review:{...p.review,nonce:newNonce()},updated_at:this.now().toISOString()};
    }));
    if(r.outcome!=='ok')return r;
    const p=await this.store.load(productId);
    if(published){await this.#say(p.request.chat_id,etsyPublishedText(p,{payload:await this.#engineRead(p,'payload.json'),record:published}));return {outcome:'published',productId};}
    await this.#say(p.request.chat_id,`#${p.product_id} is still a draft on Etsy (nothing was published). Review it again below; publishing needs PUBLISH and CONFIRM PUBLISH.`);
    return p.etsy.verification.passed?this.#sendEtsyReview(productId):this.runEtsyRefresh(productId,actor);
  }

  // ---------- Control panel (navigation is read-only; product actions reuse the a1 buttons) ----------
  /** Edit the menu message in place when possible; otherwise send a new one. */
  async #showScreen(chatId,messageId,screen,outcome){
    if(messageId!==undefined&&messageId!==null&&this.telegram.editMessageText){
      try{await this.telegram.editMessageText(String(chatId),messageId,screen.text,screen.keyboard);return {outcome,edited:true};}
      catch(err){this.log(`telegram edit failed, sending instead: ${describeError(err)}`);}
    }
    await this.#say(chatId,screen.text,screen.keyboard);
    return {outcome,edited:false};
  }
  async #myProducts(chatId){return (await this.store.list()).filter(p=>p.request?.chat_id===String(chatId));}
  #ledgerEvents(){
    if(!this.costs?.ledger)return null;
    try{return this.costs.ledger.events();}catch(err){this.log(`cost ledger unreadable: ${describeError(err)}`);return null;}
  }
  #productCost(p){const l=this.#ledgerEvents();return l?productCost(p,l.events,this.costs.ledger.startedAt()):null;}
  #costsScreen(){
    const l=this.#ledgerEvents();
    if(!l)return costsUnavailableScreen();
    return costsScreen(factoryTotals(l.events,this.now()),{trackingStartedAt:this.costs.ledger.startedAt(),corrupt:l.corrupt});
  }
  async #homeScreen(chatId){
    const l=this.#ledgerEvents();
    return homeScreen({products:await this.#myProducts(chatId),spend:l?factoryTotals(l.events,this.now()).all:null});
  }
  /** Local state and configuration only: no API call of any kind. */
  async #factoryScreen(chatId){
    const products=await this.#myProducts(chatId), c=this.stage4.config;
    return statusScreen({counts:productCounts(products),openaiConfigured:!!this.ai?.client,
      etsy:{mode:c.mode,connected:this.stage4.connected?.()===true,publishFlag:c.publishFlag===true||c.publishEnabled===true},
      // Ready only when the whole path works: a full-book adapter also needs Stage 1 full-book generation.
      adapters:Object.entries(ADAPTERS).map(([f,a])=>({format:f,label:ADAPTER_LABEL[f]??f,ready:a.artwork!=='full-book'||FULL_ARTWORK_FORMATS.includes(f),note:'Stage 1 incomplete'}))});
  }
  /** Register the owner-facing commands with Telegram's native "/" menu (one Bot API call, no product change). */
  async registerCommands(){
    if(!this.telegram.setMyCommands)return {outcome:'unsupported'};
    try{await this.telegram.setMyCommands(BOT_COMMANDS);return {outcome:'registered',count:BOT_COMMANDS.length};}
    catch(err){this.log(`telegram setMyCommands failed: ${describeError(err)}`);return {outcome:'error'};}
  }
  async #onMenu(cq,answer){
    const m=parseMenu(cq.data);
    if(!m){await answer('Unrecognised button.');return {outcome:'unparseable'};}
    const chatId=cq.message?.chat?.id, userId=cq.from?.id, mid=cq.message?.message_id;
    if(chatId===undefined||userId===undefined||!this.auth(chatId,userId)){await answer('Not authorised.');return {outcome:'unauthorized'};}
    await answer();
    const show=(screen,outcome)=>this.#showScreen(chatId,mid,screen,outcome);
    if(m.screen.startsWith('seo')&&this.seo)return this.seo.onMenu(m,{chatId,mid});
    const product=async()=>{const p=/^\d{3}$/.test(m.a)?await this.store.load(m.a).catch(()=>null):null;return p&&p.request.chat_id===String(chatId)?p:null;};
    switch(m.screen){
      case 'home':return show(await this.#homeScreen(chatId),'menu');
      case 'new':return show(newProductScreen(),'menu_new');
      case 'describe':
        await this.seo?.clearEntry(chatId);
        await this.registry.update(r=>{(r.pending_by_chat??={})[String(chatId)]={kind:'new_product',at:this.now().toISOString()};});
        return show(describePrompt(),'awaiting_description');
      case 'help':return show(helpScreen(),'help');
      case 'tools':return show(toolsScreen(),'tools');
      case 'prods':return show(productsScreen(await this.#myProducts(chatId),{page:Number(m.a||0)}),'menu_products');
      case 'etsy':return show(etsyDraftsScreen(await this.#myProducts(chatId)),'menu_etsy');
      case 'costs':return show(this.#costsScreen(),'costs');
      case 'costp':{const l=this.#ledgerEvents();return show(costByProductScreen(l?byProduct(l.events):[]),'costs_by_product');}
      case 'costm':{const l=this.#ledgerEvents();return show(costByModelScreen(l?byModel(l.events):[],this.costs?.pricing),'costs_by_model');}
      case 'status':return show(await this.#factoryScreen(chatId),'status');
      case 'ctx':if(!/^\d{3}$/.test(m.a))return show(contextHelpScreen(m.a),'context_help');break;
    }
    const p=await product();
    if(!p)return show({text:'Unknown product.',keyboard:homeScreen().keyboard},'unknown_product');
    if(m.screen==='prod')return show(await this.#productScreen(p),'menu_product');
    if(['book','bsheet','bpages','bpage','bpview','brej'].includes(m.screen))return this.#bookMenu(p,m,{chatId,show});
    if(m.screen==='ctx')return show(contextHelpScreen(p.product_id,p),'context_help');
    if(m.screen==='fail')return show(p.status==='FAILED'?failureScreen(p):productScreen(p,{cost:this.#productCost(p)}),p.status==='FAILED'?'failure_details':'stale');
    if(m.screen==='pcost'){const c=this.#productCost(p);return show(c?productCostScreen(p,c):{text:'Cost tracking is not configured on this bot.',keyboard:homeScreen().keyboard},'product_cost');}
    if(m.screen==='mmode'){
      if(p.status!=='PRODUCTION_APPROVED'||p.lock)return show(productScreen(p,{cost:this.#productCost(p)}),'stale');
      return show(marketingModeScreen(p,{comparison:p.marketing?.comparison??null}),'marketing_mode');
    }
    if(m.screen==='mcomp')return show(compareModesScreen(p),'marketing_modes_help');
    if(m.screen==='vis'){
      if(p.lock||!p.crochet_visuals||!canStartVisuals(p))return show(await this.#productScreen(p),'stale');
      return show(visualsScreen(p,{mode:m.b}),m.b==='p'?'visual_previews':'visual_set');
    }
    if(m.screen==='ask'&&(['vgen','vrh','vra','vstop'].includes(m.b)||/^vrp\d{2}$/.test(m.b))){
      // Crochet visual set (ADR-063): offered only when valid for the product's CURRENT state; states the image count and cost.
      if(!this.#visualActionOk(p,m.b)){const scr=await this.#productScreen(p);return show({...scr,text:`That action is no longer available.\n\n${scr.text}`},'stale');}
      if(m.b==='vstop')return show(confirmScreen(p,'vstop'),'confirm');
      const op=m.b==='vrh'?'restyle-hero':m.b==='vra'?'restyle-all':m.b==='vgen'?null:'restyle-preview', n=op==='restyle-preview'?Number(m.b.slice(3)):null;
      const targets=op?restyleTargets(p,op,n):[], calls=plannedVisualCalls(p,{op,targets}), l=this.#ledgerEvents();
      const estimate=calls.total?estimateLine(estimateCalls(l?l.events:[],{image:calls.total},{steps:VISUAL_IMAGE_STEPS})):null;
      const label=n?`${pad(n)} ${patternName(p,p.crochet_visuals.assets.find(e=>e.id===targets[0]).pattern_id)}`:null;
      return show(visualsConfirmScreen(p,op==='restyle-preview'?`vrp.${pad(n)}`:m.b,{calls,estimate,reopen:p.status==='PRODUCTION_APPROVED',label}),'confirm');
    }
    if(['mslides','mslide','mview'].includes(m.screen)){
      if(p.status!=='AWAITING_MARKETING_APPROVAL'||p.lock)return show(productScreen(p,{cost:this.#productCost(p)}),'stale');
      const [plan,qc]=await Promise.all(['marketing/plan.json','marketing/qc.json'].map(f=>this.store.readJson(p,f)));
      const engine=plan.engine?.id??'factory';
      const warnOf=id=>(qc.warnings??[]).find(w=>w.startsWith(`${id}:`))??(qc.checks.some(c=>!c.ok&&c.detail.includes(id))?'QC problem':null);
      if(m.screen==='mslides')return show(marketingSlidesScreen(p,{plan,engine,status:Object.fromEntries(plan.slides.map(s=>[s.id,warnOf(s.id)?'warn':'ok']))}),'marketing_slides');
      const index=Number(m.b), slide=plan.slides[index-1];
      if(!slide)return show(marketingSlidesScreen(p,{plan,engine}),'stale');
      if(m.screen==='mview'){
        const render=await this.store.readJson(p,'marketing/images/render.json'), x=render[index-1];
        await this.#quiet(async()=>this.telegram.sendPhoto({chatId:String(chatId),bytes:await this.store.readBytes(p,`marketing/images/${x.file}`),fileName:`${p.product_id}-${x.file}`,caption:`#${p.product_id} · ${slideLabel(slide)}`}));
      }
      const sc=engine==='factory'?plan.scenes.find(x=>x.id===slide.scene):null;
      return show(marketingSlideScreen(p,{slide,index,engine,warning:warnOf(slide.id)?.replace(/^[^:]+:\s*/,'')??null,sceneShared:sc?plan.slides.filter(s=>s.scene===sc.id).map(s=>s.id):[]}),m.screen==='mview'?'marketing_slide_viewed':'marketing_slide');
    }
    if(m.screen==='ask'&&(['bgen','bdir','bstop'].includes(m.b)||/^bp[rd]\d{3}$/.test(m.b)||(m.b==='reject'&&p.status==='AWAITING_BOOK_APPROVAL'))){
      // Full-book confirmations: valid only for the product's CURRENT state.
      const n=/^bp[rd]\d{3}$/.test(m.b)?Number(m.b.slice(3)):null;
      const ok=!p.lock&&(m.b==='bgen'?awaitingFullArtwork(p):m.b==='bstop'?p.status==='FAILED'&&inBook(p)
        :p.status==='AWAITING_BOOK_APPROVAL'&&(n===null||!!p.book?.pages.some(e=>e.page_number===n)));
      if(!ok){const scr=await this.#productScreen(p);return show({...scr,text:`That action is no longer available.\n\n${scr.text}`},'stale');}
      if(m.b==='bgen'){const plan=await this.#bookPlan(p);return show(bookGenerateScreen(p,{plan,estimate:this.#bookEstimate(plan.toGenerate),size:plan.size}),'confirm');}
      return show(confirmScreen(p,m.b,{estimate:n?estimateLine(this.#bookEstimate(1)):null,slide:n?pageId(n):null}),'confirm');
    }
    if(m.screen==='ask'){
      // Offer the confirmation only if that action is valid for the product's CURRENT state (and screen).
      const key=confirmKey(m.b), engineAction=Object.hasOwn(ENGINE_OF_ACTION,m.b)||m.b==='mcmp', slideAction=!!CONFIRM[key]?.slide;
      let offered=JSON.stringify(productScreen(p).keyboard).includes(`"m1|ask|${p.product_id}|${m.b}"`);
      if(engineAction)offered=p.status==='PRODUCTION_APPROVED'&&!p.lock;
      if(slideAction){
        const plan=p.status==='AWAITING_MARKETING_APPROVAL'&&!p.lock?await this.store.readJson(p,'marketing/plan.json'):null, slide=plan?.slides[Number(m.b.slice(3))-1], engine=plan?.engine?.id??'factory';
        offered=!!slide&&(key==='mrs'?(engine!=='factory'||!!slide.scene):engine!=='factory');
      }
      if(!offered)return show({...productScreen(p,{cost:this.#productCost(p)}),text:`That action is no longer available.\n\n${productScreen(p,{cost:this.#productCost(p)}).text}`},'stale');
      const l=this.#ledgerEvents(), ev=l?l.events:[];
      const estimate=engineAction?estimateLine(m.b==='mcmp'?estimateCalls(ev,{text:2,image:this.marketingScenes>0?3:2}):await this.#marketingEstimate(p,ENGINE_OF_ACTION[m.b]))
        :slideAction?estimateLine(estimateCalls(ev,key==='mrs'?{image:1}:{text:1,image:1}))
        // Retrying the full book: only the pages still without artwork (and a pending page operation) are paid for.
        :m.b==='retry'&&p.last_error?.step==='book'?estimateLine(this.#bookEstimate(bookProgress(p)?.toGenerate??p.pages.length))
        // Retrying the crochet visual set: only the images still missing are paid for.
        :m.b==='retry'&&p.last_error?.step==='visuals'?estimateLine(estimateCalls(ev,{image:visualsProgress(p)?.toGenerate??1+(p.crochet?.approval?.pattern_count??0)},{steps:VISUAL_IMAGE_STEPS}))
        // Crochet patterns: the plan (once) plus one text call per pattern still to draft.
        :m.b==='cgen'?estimateLine(estimateCalls(ev,{text:(p.crochet?.plan?0:1)+(p.crochet?.plan?p.crochet.patterns.filter(e=>!e.file).length:p.crochet?.brief?.pattern_count??0)}))
        :m.b==='cregen'?estimateLine(estimateCalls(ev,{text:p.crochet?.patterns.filter(e=>e.status==='invalid').length??0}))
        :m.b==='crev'?estimateLine(estimateCalls(ev,{text:1}))
        // Style proofs after a crochet restyle: 3 image calls.
        :m.b==='regen'&&p.status==='SPEC_READY'?estimateLine(estimateCalls(ev,{image:3})):null;
      return show(confirmScreen(p,m.b,{estimate}),'confirm');
    }
    if(m.screen==='refresh'){
      if(p.status!=='AWAITING_ETSY_PUBLISH_APPROVAL'||p.lock)return show(productScreen(p,{cost:this.#productCost(p)}),'stale');
      const r=await this.runEtsyRefresh(p.product_id,actorOf(cq.from),{sendReview:false});
      const fresh=await this.store.load(p.product_id), scr=productScreen(fresh,{cost:this.#productCost(fresh)});
      const note=r.outcome==='etsy_verified'?'✅ Etsy draft re-checked: it matches the approved listing.':r.outcome==='etsy_drift'?`⚠️ The Etsy draft differs from the approved listing:\n${r.drift.join('\n')}`:`⚠️ Refresh did not complete (${r.outcome}).`;
      return show({...scr,text:`${note}\n\n${scr.text}`},'etsy_refreshed');
    }
    if(m.screen==='view'){
      // Read-only: re-send the current review material. Never generates anything.
      if(p.status==='AWAITING_CONCEPT_SELECTION')return this.#sendPreviews(p.product_id);
      if(p.status==='AWAITING_CREATIVE_APPROVAL')return this.#sendProofImages(p);
      if(p.status==='AWAITING_BOOK_APPROVAL')return this.#sendBookReview(p.product_id,{sheets:true});
      if(p.status==='AWAITING_PATTERN_APPROVAL')return this.#sendPatternReview(p.product_id);
      if(p.status==='AWAITING_VISUALS_APPROVAL')return this.#sendVisualsReview(p.product_id,{images:true});
      if(p.status==='AWAITING_PRODUCTION_APPROVAL')return this.#sendProductionReview(p.product_id);
      if(p.status==='AWAITING_MARKETING_APPROVAL')return this.#sendMarketingReview(p.product_id);
      if(p.status==='AWAITING_ETSY_PUBLISH_APPROVAL'){
        const [payload,uploads,verification]=await Promise.all(['payload.json','uploads.json','verification.json'].map(f=>this.#engineRead(p,f)));
        if(payload&&uploads&&verification)await this.#say(chatId,etsyDraftSummary(p,{payload,verification,uploads,mode:p.etsy.mode,publishable:false,publishEnabled:true}));
        return show(productScreen(p,{cost:this.#productCost(p)}),'product_summary');
      }
      return show(productScreen(p,{cost:this.#productCost(p)}),'stale');
    }
    return show(homeScreen(),'menu');
  }
  /** Full-book navigation (read-only: it only sends existing pages and sheets, never generates). */
  async #bookMenu(p,m,{chatId,show}){
    const stale=async()=>show(await this.#productScreen(p),'stale');
    if(p.lock)return stale();
    if(m.screen==='book'){
      if(awaitingFullArtwork(p)){const plan=await this.#bookPlan(p);return show(bookGenerateScreen(p,{plan,estimate:this.#bookEstimate(plan.toGenerate),size:plan.size}),'book_plan');}
      if(p.status!=='AWAITING_BOOK_APPROVAL')return stale();
      const qc=JSON.parse(await this.store.readBytes(p,BOOK_QC)), l=this.#ledgerEvents(), c=this.#productCost(p);
      return show({text:bookReviewText(p,{qc,progress:bookProgress(p),spend:l?stepSpend(l.events,p.product_id,['book-page']):null,total:c?c.total:null}),keyboard:bookReviewKeyboard(p,{qc,total:p.pages.length})},'book_review');
    }
    if(p.status!=='AWAITING_BOOK_APPROVAL')return stale();
    const qc=JSON.parse(await this.store.readBytes(p,BOOK_QC));
    if(m.screen==='bsheet'){
      const x=qc.sheets[Number(m.b)-1];
      if(!x)return stale();
      await this.#quiet(async()=>this.telegram.sendPhoto({chatId:String(chatId),bytes:await this.store.readBytes(p,x.file),fileName:`${p.product_id}-${x.file.split('/').at(-1)}`,caption:`#${p.product_id} · pages ${x.from}–${x.to} of ${p.pages.length}`}));
      // The review buttons again, below the sheet.
      return this.#showScreen(chatId,null,{text:bookReviewText(p,{qc,progress:bookProgress(p)}),keyboard:bookReviewKeyboard(p,{qc,total:p.pages.length})},'book_sheet');
    }
    if(m.screen==='bpages')return show(bookPagesScreen(p,{qc,total:p.pages.length,mode:m.b}),'book_pages');
    if(m.screen==='brej')return show(bookRejectScreen(p,{generated:p.book.pages.filter(e=>e.status==='generated').length}),'book_reject');
    const n=Number(m.b), entry=p.book.pages.find(e=>e.page_number===n);
    if(!entry)return stale();
    const manifest=await this.store.readJson(p,BOOK_MANIFEST);
    const screen=bookPageScreen(p,{entry,manifestPage:manifest.pages[n-1],qcPage:qc.pages[entry.page_id],estimate:this.#bookEstimate(1)});
    if(m.screen==='bpview'){await this.#sendBookPagePhoto(p,n);return this.#showScreen(chatId,null,screen,'book_page_viewed');}
    return show(screen,'book_page');
  }
  /** Re-send the latest creative proofs with the existing review buttons (read-only). */
  async #sendProofImages(p){
    const attempt=p.proofs.attempts.at(-1), chatId=p.request.chat_id;
    const items=await Promise.all((attempt?.images??[]).map(async im=>({bytes:await this.store.readBytes(p,im.file),fileName:`${p.product_id}-${im.file.split('/').at(-1)}`,caption:`#${p.product_id} · page ${im.page_number}`})));
    if(items.length>1)await this.#quiet(()=>this.telegram.sendPhotoAlbum(String(chatId),items));
    else if(items.length===1)await this.#quiet(()=>this.telegram.sendPhoto({chatId:String(chatId),...items[0]}));
    await this.#sayAction(p,`Creative proofs for #${p.product_id}.`,proofKeyboard(p));
    return {outcome:'proofs_resent',productId:p.product_id};
  }

  /** After a restart: nothing stays locked or stuck in a generating state. */
  async recover(){
    const out=[];
    for(const p of await this.store.list()){
      if(!p.lock&&!GENERATING.includes(p.status))continue;
      const step=p.lock?.op??(p.status==='CONCEPT_PREVIEWS_GENERATING'?'concept-previews':p.status==='BOOK_GENERATING'?'book':p.status==='PATTERNS_GENERATING'?'patterns':p.status==='VISUALS_GENERATING'?'visuals':p.status.startsWith('PRODUCTION')?'production':p.status.startsWith('MARKETING')?'marketing'
        :p.status.startsWith('ETSY')?'etsy':p.status==='PUBLISHING'?'etsy-publish':'proofs');
      const interrupted=a=>a.status==='generating'?{...a,status:'interrupted',error:'Interrupted by a restart',finished_at:this.now().toISOString()}:a;
      let cur={...p,proofs:{...p.proofs,attempts:p.proofs.attempts.map(interrupted)},
        ...(p.concept_previews?{concept_previews:{batches:p.concept_previews.batches.map(interrupted)}}:{}),
        ...(p.book?.generation?{book:{...p.book,generation:interrupted(p.book.generation)}}:{}),
        ...(p.crochet_visuals?.generation?.status==='generating'?{crochet_visuals:{...p.crochet_visuals,generation:{...p.crochet_visuals.generation,status:'interrupted',error:'Interrupted by a restart',finished_at:this.now().toISOString()}}}:{}),
        ...(p.crochet?.generation?{crochet:{...p.crochet,generation:p.crochet.generation.status==='generating'?{...p.crochet.generation,status:'interrupted',error:'Interrupted by a restart',finished_at:this.now().toISOString()}:p.crochet.generation}}:{})};
      const resumeState=resumeStateOf(cur);
      cur={...releaseLock(cur),last_error:{step,message:'Interrupted by a restart',at:this.now().toISOString(),retryable:true}};
      if(cur.status!=='FAILED')cur=transition(cur,'failed',{actor:'recovery',now:this.now(),resumeState});
      await this.store.save(cur);
      await this.#sayAction(cur,failureText(cur),failureKeyboard(cur));
      out.push(cur.product_id);
    }
    // Status messages left RUNNING by the previous process are closed from the persisted state; nothing is restarted.
    await this.status?.recover({loadProduct:id=>this.store.load(id)});
    return out;
  }
}
