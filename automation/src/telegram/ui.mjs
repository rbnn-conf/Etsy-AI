// LumiumX Telegram presentation layer: one vocabulary for headings, status
// words, money, product IDs, button labels and navigation rows, so every
// screen and workflow message looks and reads the same. Pure functions only.
//
// Button data:
//   m1|<screen>|<a>|<b>   navigation (read-only, validated, harmless when stale)
//   a1|<action>|<id>|<nonce>   product actions (approvals.mjs; one-time nonce)
// Etsy publishing is never offered by any button built here.
import { gbp } from '../costs/report.mjs';

// ---------- vocabulary ----------
export const STATUS=Object.freeze({ok:'🟢',partial:'🟡',warn:'⚠️',off:'⛔',lock:'🔒',test:'🧪',busy:'⏳'});
export const money=gbp;
export const pid=p=>`#${typeof p==='string'?p:p.product_id}`;
export const heading=(emoji,title)=>`${emoji} ${String(title).toUpperCase()}`;
/** Two-column block (labels padded, mobile friendly). */
export const rows=list=>list.map(([l,v])=>`${String(l).padEnd(20,' ')}${v}`).join('\n');
/** Title, blank line, body lines (falsy lines dropped, '' kept as spacing). */
export const compose=(title,...lines)=>[title,'',...lines.flat().filter(l=>l!==null&&l!==undefined&&l!==false)].join('\n').replace(/\n{3,}/g,'\n\n').trim().slice(0,4000);
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
/** "28 Sep 2026" (UTC), independent of the server locale. */
export const dateOnly=iso=>{if(!iso)return null;const d=new Date(iso);return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;};

// Official OpenAI Platform page for account usage and billing. The bot never
// reads it, logs in, or claims to know the remaining credit.
export const OPENAI_USAGE_URL='https://platform.openai.com/usage';

// ---------- navigation data ----------
export const SCREENS=Object.freeze(['home','new','prods','prod','etsy','costs','costp','costm','pcost','status','help','ask','view','refresh','tools','ctx','fail','describe','vis',
  // Stage 3 marketing: choose a style, compare styles, the campaign's images, one image, view one image.
  'mmode','mcomp','mslides','mslide','mview',
  // Stage 1 full book: overview/review, one contact sheet, the page picker, one page, view one page, reject/change direction.
  'book','bsheet','bpages','bpage','bpview','brej',
  // SEO & market research (ADR-036; automation/src/seo): dashboard, products, audit, current listing, start research, new research,
  // describe, product idea, library, search, keywords, keyword history, recent, active, and one research session's screens.
  'seo','seoprods','seoprod','seolist','seostart','seonew','seodesc','seoidea','seolib','seosrch','seokeys','seohist','seorec','seoact',
  'seoses','seonext','seoterm','seoplan','seoev','seowhy','seofin','seores','seocopy']);
const MAX=64;
export function menuData(screen,a='',b=''){
  if(!SCREENS.includes(screen)||!/^[a-z0-9]{0,12}$/.test(a)||!/^[a-z0-9]{0,12}$/.test(b))throw new Error('unsafe menu data');
  const s=`m1|${screen}|${a}|${b}`;if(Buffer.byteLength(s)>MAX)throw new Error('menu data too long');return s;
}
export const nav=(text,screen,a,b)=>({text,callback_data:menuData(screen,a,b)});
export const link=(text,url)=>({text,url});
export const HOME=Object.freeze([nav('🏠 Home','home')]);
/** Contextual help for a screen: 'home', 'costs', 'etsy', or a product ID. */
export const helpButton=ctx=>nav('❓ What can I do here?','ctx',ctx);

// ---------- labels (one wording everywhere) ----------
export const L=Object.freeze({
  create:'✨ Create Product',products:'📦 My Products',drafts:'🏪 Etsy Drafts',seo:'🔎 SEO',costs:'💰 Costs',factory:'📊 Factory',tools:'⚙️ Tools',help:'❓ Help',
  product:'📦 Product',details:'📋 Details',retry:'🔄 Retry Safe Step',retryPaid:'🔄 Retry (API cost)',back:'⬅️ Back',refresh:'🔄 Refresh',
  openai:'🌐 OpenAI Usage / Billing',byProduct:'📦 By Product',byModel:'🤖 By Model',productCost:'💰 Product Cost',summary:'🧾 Product Summary',
  editor:'🔗 Open Etsy Editor'});

// ---------- retry safety (from the product's recorded state, never guessed) ----------
// Steps that call OpenAI (a retry may cost money: confirmation first) and
// deterministic/journalled steps (free; resume skips finished work).
const PAID_STEPS=new Set(['ideation','concept-previews','specification','proofs','direction-change','book','patterns','visuals','marketing','marketing-compare']);
const FREE_STEPS=new Set(['production','etsy','etsy-refresh','etsy-publish','restyle']);
/**
 * {safe, paid, reason}. Safe only when the step is known and its resume path
 * is idempotent; an Etsy draft creation of unknown outcome or a listing found
 * ACTIVE unexpectedly needs the owner first, so no retry button is offered.
 */
// Stage 2 refused the pattern source: edited after approval, or the handoff predates a re-approval.
const patternsEdited=m=>/Approved content changed since handoff: crochet\/patterns\.json|crochet\/patterns\.json changed after APPROVE PATTERNS|document fonts cannot print/.test(m);
const staleHandoff=m=>/crochet pattern approval changed since the production handoff/.test(m);
// Windows held a production file open (antivirus, indexer, editor) beyond Stage 2's write retries. The raw path stays in the log.
const fileLocked=m=>/\b(EPERM|EBUSY|EACCES)\b/.test(m)&&/\b(rename|unlink|open|rmdir|lstat)\b/.test(m);
// Another process holds the product's build lock (production/.build.lock).
const buildRunning=m=>/Production is already running for this product/.test(m);
/** Stage 2 stopped on a temporary file lock: nothing lost, Retry resumes free. */
export const fileLockedText=p=>[`⚠️ Product #${p.product_id} build paused`,'Windows temporarily locked a production file.','','No work was lost.','Retry is free.'].join('\n');
/** The approved crochet source was edited and not approved again (ADR-053): plain, free next step. */
export const patternsEditedText=p=>[`❌ #${p.product_id} patterns changed after approval`,'crochet/patterns.json was edited and has not been approved again.','',
  'Press Re-validate edited patterns.json (free), then Approve Patterns.','No paid call is required.'].join('\n');
// Stage 4 could not resolve the Etsy category (ADR-039/059). The long category strings stay in the log and last_error.
const TAXONOMY_LABEL={'crochet-pattern-bundle':'Crochet patterns','colouring-book':'Colouring books','greeting-card':'Greeting cards'};
const taxonomyUnresolved=m=>/TAXONOMY_UNRESOLVED/.test(m);
const noApprovedCategory=m=>/The Etsy category for [\w-]+ is unresolved/.test(m);
/** Plain Telegram text for an unresolved Etsy category; the two cases differ in what the owner has to do. */
export function taxonomyFailureText(p){
  const m=String(p.last_error?.message??'');
  if(noApprovedCategory(m)){
    const label=TAXONOMY_LABEL[/category for ([\w-]+) is unresolved/.exec(m)?.[1]]??'This product type';
    return ['⚠️ Etsy category needs setup','',`${label} do not have an approved Etsy category yet.`,'','Nothing was lost.','Fix the category mapping, then Retry.','','Retry is free.'].join('\n');
  }
  return ['⚠️ Etsy category needs checking','',"The approved Etsy category does not match Etsy's current categories.",'','Nothing was created on Etsy.','Check the category mapping, then Retry.','','Retry is free.'].join('\n');
}
export function retrySafety(p){
  if(p?.status!=='FAILED'||!p.last_error)return {safe:false,paid:false,reason:'Nothing to retry.'};
  const {step,message=''}=p.last_error;
  if(/UNCERTAIN_CREATE/.test(message))return {safe:false,paid:false,reason:`Etsy may or may not have created the draft. Check Etsy first, then send /etsy ${p.product_id} confirm-no-draft if there is none.`};
  if(/CRITICAL_ACTIVE/.test(message))return {safe:false,paid:false,reason:'The Etsy listing is unexpectedly ACTIVE. Inspect it on Etsy first.'};
  // The approved pattern source was edited and not re-approved (ADR-052/053): a retry would fail the same way.
  if(step==='production'&&patternsEdited(message))return {safe:false,paid:false,reason:'Re-validate the edited patterns (free), then approve them again.'};
  if(FREE_STEPS.has(step))return {safe:true,paid:false,reason:step==='etsy-publish'?'Retry only re-reads Etsy; it never publishes again.':'Free: completed work is kept and skipped.'};
  if(PAID_STEPS.has(step))return {safe:true,paid:true,reason:'Completed paid work is kept and never paid for twice; the unfinished step may call OpenAI.'};
  return {safe:false,paid:false,reason:`Unknown step "${step}".`};
}
/**
 * A plain-language summary for known failures, or null (then the generic
 * text is shown). The full exception stays in the bot log and product.json
 * last_error; Telegram never shows it for these.
 */
export function knownFailure(p){
  const e=p?.last_error, m=String(e?.message??'');
  if(e?.step==='etsy'&&taxonomyUnresolved(m))return {stage:'Etsy',lines:[taxonomyFailureText(p).split('\n')[2]]};
  if(e?.step==='etsy'&&draftMismatch(m))return {stage:'Etsy',lines:['Etsy draft verification failed:',...draftMismatch(m)]};
  if(e?.step==='production'&&fileLocked(m))return {stage:'Production',lines:['Windows temporarily locked a production file.']};
  if(e?.step==='production'&&buildRunning(m))return {stage:'Production',lines:['Another bot process is building this product right now.']};
  if(e?.step==='production'&&/document fonts cannot print/.test(m))return {stage:'Production',lines:['The approved pattern text has characters the document fonts cannot print.']};
  if(e?.step==='production'&&patternsEdited(m))return {stage:'Production',lines:['crochet/patterns.json was edited after approval and not approved again.']};
  if(e?.step==='production'&&staleHandoff(m))return {stage:'Production',lines:['Patterns were re-approved, but the production handoff still references an older version.']};
  if(e?.step==='production'&&/CROCHET_VISUALS_UNCHECKED/.test(m))return {stage:'Production',lines:['Crochet visuals are not checked against the approved patterns. Run Restyle and approve the new proofs first.']};
  const plan=/crochet plan: model output rejected: (\d+) patterns planned; the owner asked for (\d+)/.exec(m);
  if(e?.step==='patterns'&&plan){
    const rest=m.replace(/^.*?model output rejected: /,'').replace(plan[0].replace(/^.*?model output rejected: /,''),'').replace(/^;\s*/,'').trim();
    const others=rest?rest.split('; ').length:0;
    return {stage:'Pattern Plan',lines:[`Planned ${plan[1]} patterns, but ${plan[2]} were requested.${others?` (${others} other plan problem${others>1?'s':''} in the log.)`:''}`]};
  }
  return null;
}
/** The short Telegram text for a known failure (null when unknown). */
/**
 * The mismatch bullets of a Stage 4 "draft does not match" VERIFY_FAILED, or
 * null for any other error. Never empty: an old message with nothing after the
 * colon still says where the details are.
 */
export function draftMismatch(m){
  const s=String(m??'');
  if(!/VERIFY_FAILED/.test(s)||!/does not match the approved listing/.test(s))return null;
  const bullets=s.split('\n').map(l=>l.trim()).filter(l=>l.startsWith('•')).map(l=>l.length>220?`${l.slice(0,217)}…`:l);
  if(bullets.length)return bullets.slice(0,7);
  const named=/approved listing \(([^)]+)\)/.exec(s)?.[1];
  return [named?`• ${named}`:'• details not recorded: see etsy/verification.json'];
}
export function knownFailureText(p){
  if(p?.last_error?.step==='etsy'&&taxonomyUnresolved(p.last_error.message??''))return taxonomyFailureText(p);
  const mismatch=p?.last_error?.step==='etsy'?draftMismatch(p.last_error.message):null;
  if(mismatch)return [`⚠️ Product #${p.product_id} Etsy draft verification failed`,'','Mismatch:',...mismatch,'',
    'Draft remains safe and unpublished.','Fix the cause before Retry.'].join('\n');
  if(p?.last_error?.step==='production'&&fileLocked(p.last_error.message??''))return fileLockedText(p);
  if(p?.last_error?.step==='production'&&buildRunning(p.last_error.message??''))
    return [`⚠️ Product #${p.product_id} build already running`,'Another bot process is building this product right now.','','Wait for it to finish, then Retry (free).'].join('\n');
  // The Stage 2 crochet visual gate (ADR-047), if it fires inside a production run.
  if(p?.last_error?.step==='production'&&/CROCHET_VISUALS_UNCHECKED/.test(p.last_error.message??''))
    return [`❌ #${p.product_id} cannot enter production`,'Crochet visuals are not checked against the approved patterns.','','Run Restyle and approve the new proofs first.'].join('\n');
  // Unprintable approved pattern text (ADR-052): the source is fixed by the owner, then re-validated free.
  if(p?.last_error?.step==='production'&&/document fonts cannot print/.test(p.last_error.message??'')){
    const chars=[...new Set([...String(p.last_error.message).matchAll(/"([^"]+)" (U\+[0-9A-F]{4,6})/g)].map(x=>`"${x[1]}" ${x[2]}`))];
    return [`❌ #${p.product_id} cannot enter production`,'Pattern text contains unsupported characters'+(chars.length?`: ${chars.join(', ')}`:'.'),'',
      'Fix crochet/patterns.json, then Re-validate (free) and approve the patterns again.','No model call was made.'].join('\n');
  }
  // The approved source was edited and not approved again (ADR-053).
  if(p?.last_error?.step==='production'&&patternsEdited(p.last_error.message??''))return patternsEditedText(p);
  // Should never be seen (re-approval and retry refresh the handoff), but plain if it is.
  if(p?.last_error?.step==='production'&&staleHandoff(p.last_error.message??''))
    return [`❌ #${p.product_id} production state is stale`,'Patterns were re-approved, but the production handoff still references an older version.','',
      'Refresh production state and retry.','No paid call is required.'].join('\n');
  const k=knownFailure(p);
  if(!k)return null;
  const s=retrySafety(p);
  return [`❌ Product #${p.product_id} failed at ${k.stage}`,...k.lines,'Completed files were kept.','',
    s.safe?(s.paid?'Retry will call OpenAI.':'Retry is free.'):s.reason].join('\n');
}
/** First line of an error, trimmed for a phone screen. */
export const shortError=m=>{const s=String(m??'').split('\n')[0].replace(/\s+/g,' ').trim();return s.length>220?`${s.slice(0,217)}…`:s;};
