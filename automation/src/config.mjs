import { dirname, join, resolve } from 'node:path';
import { imageFamily, IMAGE_SIZES, IMAGE_QUALITIES } from './orchestrator/canvas.mjs';
import { fileURLToPath } from 'node:url';

export const automationRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const repoRoot=resolve(automationRoot,'..');

const list=v=>v?String(v).split(/[\s,]+/).filter(Boolean):[];
const blank=v=>v===undefined||v===null||String(v).trim()===''?undefined:String(v).trim();

export function loadAutomationConfig(env=process.env){
  return {
    telegram:{
      botToken:blank(env.AUTOMATION_TELEGRAM_BOT_TOKEN),
      chatId:blank(env.AUTOMATION_TELEGRAM_CHAT_ID)??blank(env.TELEGRAM_CHAT_ID),
      allowedUserIds:list(blank(env.AUTOMATION_TELEGRAM_ALLOWED_USER_IDS)??blank(env.TELEGRAM_ALLOWED_USER_IDS)),
      sharedTokenAllowed:blank(env.AUTOMATION_ALLOW_SHARED_TOKEN)==='true',
      reviewBotToken:blank(env.TELEGRAM_BOT_TOKEN)
    },
    openai:{
      apiKey:blank(env.OPENAI_API_KEY),
      textModel:blank(env.OPENAI_TEXT_MODEL),
      imageModel:blank(env.OPENAI_IMAGE_MODEL),
      // Deprecated and ignored: the size now follows each product's orientation.
      legacyImageSize:blank(env.OPENAI_IMAGE_SIZE),
      // Creative proofs. Unset: the family default (IMAGE_QUALITIES.proof).
      imageQuality:blank(env.OPENAI_IMAGE_QUALITY),
      // Concept previews (one per concept, before selection). Unset: the family's cheapest.
      previewQuality:blank(env.AUTOMATION_PREVIEW_QUALITY),
      baseUrl:blank(env.OPENAI_BASE_URL)??'https://api.openai.com/v1'
    },
    productsDir:blank(env.AUTOMATION_PRODUCTS_DIR)??join(repoRoot,'products'),
    stateDir:blank(env.AUTOMATION_STATE_DIR)??join(automationRoot,'state'),
    maxReferences:Number(blank(env.AUTOMATION_MAX_REFERENCES)??6),
    // Concept batches per product, including the first (each = 1 text call + 3 preview images).
    maxConceptBatches:Number(blank(env.AUTOMATION_MAX_CONCEPT_BATCHES)??3),
    // Stage 3: AI background scenes per marketing run (0 = deterministic studio backgrounds only).
    marketingScenes:Number(blank(env.AUTOMATION_MARKETING_SCENES)??4),
    // Stage 4 (ADR-026). Safe defaults: dry run, no Etsy writes, no publishing.
    etsy:stage4Config(env)
  };
}

/**
 * Stage 4 switches. Three independent layers:
 *   ETSY_STAGE4_DRY_RUN       default true  -> simulated Etsy, zero network requests
 *   ETSY_DRAFT_WRITES_ENABLED default false -> required (with dry run off) to create real drafts
 *   ETSY_PUBLISH_ENABLED      default false -> required, with two owner confirmations, to publish
 * Only the exact string "true" / "false" flips a default.
 */
export function stage4Config(env=process.env){
  const dryRun=blank(env.ETSY_STAGE4_DRY_RUN)!=='false';
  const draftWritesEnabled=blank(env.ETSY_DRAFT_WRITES_ENABLED)==='true';
  const publishEnabled=blank(env.ETSY_PUBLISH_ENABLED)==='true';
  const shopId=blank(env.ETSY_SHOP_ID)?Number(blank(env.ETSY_SHOP_ID)):undefined;
  return {dryRun,draftWritesEnabled,publishEnabled:publishEnabled&&!dryRun,publishFlag:publishEnabled,
    mode:dryRun?'dry-run':draftWritesEnabled?'live':'blocked',shopId,
    seller:{whoMade:blank(env.ETSY_SELLER_WHO_MADE)??null,whenMade:blank(env.ETSY_SELLER_WHEN_MADE)??null,
      quantity:Number(blank(env.ETSY_DIGITAL_QUANTITY)??999)}};
}
/** Why Stage 4 cannot run in its configured mode ([] = ready). Never includes secret values. */
export function stage4Problems(e){
  const p=[];
  if(e.mode==='blocked')p.push('ETSY_STAGE4_DRY_RUN=false but ETSY_DRAFT_WRITES_ENABLED is not true: no Etsy writes are allowed. Set ETSY_DRAFT_WRITES_ENABLED=true for a real draft, or remove ETSY_STAGE4_DRY_RUN for a dry run.');
  if(e.mode==='live'&&!(Number.isSafeInteger(e.shopId)&&e.shopId>0))p.push('ETSY_SHOP_ID is not set to the numeric shop ID.');
  if(!e.seller.whoMade)p.push('ETSY_SELLER_WHO_MADE is not set (Etsy requires it: i_did, collective or someone_else; this is your declaration to Etsy).');
  if(!e.seller.whenMade)p.push('ETSY_SELLER_WHEN_MADE is not set (Etsy requires it, e.g. made_to_order or 2020_2026).');
  if(!(Number.isInteger(e.seller.quantity)&&e.seller.quantity>=1&&e.seller.quantity<=999))p.push('ETSY_DIGITAL_QUANTITY must be 1-999 (default 999).');
  return p;
}

/** Human-readable reasons the bot cannot start. Never includes secret values. */
export function configProblems(c){
  const p=[];
  if(!c.telegram.botToken)p.push('AUTOMATION_TELEGRAM_BOT_TOKEN is not set.');
  if(!c.telegram.chatId)p.push('AUTOMATION_TELEGRAM_CHAT_ID (or TELEGRAM_CHAT_ID) is not set.');
  if(c.telegram.botToken&&c.telegram.botToken===c.telegram.reviewBotToken&&!c.telegram.sharedTokenAllowed)
    p.push('AUTOMATION_TELEGRAM_BOT_TOKEN equals TELEGRAM_BOT_TOKEN. Telegram allows one poller per token, so this would steal the review bot\'s button presses. Use a second bot, or set AUTOMATION_ALLOW_SHARED_TOKEN=true and never run both bots at once.');
  if(!c.openai.apiKey)p.push('OPENAI_API_KEY is not set.');
  if(!c.openai.textModel)p.push('OPENAI_TEXT_MODEL is not set (a vision-capable model with structured JSON output).');
  if(!c.openai.imageModel)p.push('OPENAI_IMAGE_MODEL is not set.');
  if(c.openai.imageModel&&!imageFamily(c.openai.imageModel))p.push(`OPENAI_IMAGE_MODEL has no known size table (supported families: ${Object.keys(IMAGE_SIZES).join(', ')}). Add its documented sizes to src/orchestrator/canvas.mjs.`);
  const q=IMAGE_QUALITIES[imageFamily(c.openai.imageModel)];
  for(const [name,v] of [['OPENAI_IMAGE_QUALITY',c.openai.imageQuality],['AUTOMATION_PREVIEW_QUALITY',c.openai.previewQuality]])
    if(q&&v!==undefined&&!q.allowed.includes(v))p.push(`${name} must be one of ${q.allowed.join(', ')} for this image model.`);
  if(!(c.maxReferences>=1&&c.maxReferences<=10))p.push('AUTOMATION_MAX_REFERENCES must be 1-10.');
  if(!(Number.isInteger(c.maxConceptBatches)&&c.maxConceptBatches>=1&&c.maxConceptBatches<=10))p.push('AUTOMATION_MAX_CONCEPT_BATCHES must be 1-10.');
  if(!(Number.isInteger(c.marketingScenes)&&c.marketingScenes>=0&&c.marketingScenes<=4))p.push('AUTOMATION_MARKETING_SCENES must be 0-4.');
  return p;
}

/** Committed list of product numbers the allocator must never issue. */
export async function loadReservedIds(){
  const {readFile}=await import('node:fs/promises');
  const data=JSON.parse(await readFile(join(automationRoot,'reserved-product-ids.json'),'utf8'));
  return data.reserved.map(r=>r.id);
}

/** The shape services/src/config/env.ts#isTelegramActorAuthorized expects. */
export const authConfig=c=>({chatId:c.telegram.chatId,allowedUserIds:c.telegram.allowedUserIds});

/** Image qualities actually sent: previews use the cheapest documented one unless overridden. */
export function imageQualities(c){
  const q=IMAGE_QUALITIES[imageFamily(c.openai.imageModel)];
  return {proof:c.openai.imageQuality??q?.proof,preview:c.openai.previewQuality??q?.preview};
}
