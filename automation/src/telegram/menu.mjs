// LumiumX Telegram control panel: navigation screens (pure functions: data ->
// {text, keyboard}), built on the shared presentation layer (ui.mjs).
// Navigation buttons use "m1|<screen>|<a>|<b>" (read-only, validated, no
// nonce needed). Every button that CHANGES a product is an existing "a1"
// action carrying the product's current nonce, so it runs the same operation
// as the slash command and a stale or repeated press is refused.
// Etsy publishing is never offered here: the owner publishes on Etsy by hand.
import { encode, REVALIDATE_EDITED } from './approvals.mjs';
import { gbp, table, STAGES } from '../costs/report.mjs';
import { knownFailure, knownFailureText } from './ui.mjs';
import { SCREENS, menuData, nav, link, HOME, helpButton, heading, compose, rows, money, pid, dateOnly, retrySafety, shortError, OPENAI_USAGE_URL, STATUS, L } from './ui.mjs';
import { awaitingFullArtwork, inBook, needsFullArtwork } from '../orchestrator/book-state.mjs';
import { bookStatusLines, generateLabel } from './book.mjs';
import { awaitingPatterns, inPatterns, canReopenPatterns } from '../orchestrator/crochet.mjs';
import { canRestyle } from '../orchestrator/restyle.mjs';
import { visualsApplicable, visualsApproved, visualsProgress, inVisuals } from '../orchestrator/crochet-visuals.mjs';

export { menuData, OPENAI_USAGE_URL };
// Product actions that need an explicit confirmation first (cost or irreversible).
export const CONFIRM=Object.freeze({
  go:{title:'Generate three concepts with previews',cost:true},more:{title:'Generate three new concepts',cost:true},
  prev:{title:'Make the three concept preview images',cost:true},
  regen:{title:'Regenerate the three style proofs',cost:true},reject:{title:'Reject this product',destructive:true},
  pcancel:{title:'Cancel production (back to creative approval)',destructive:true},market:{title:'Write the Etsy listing and build the listing images',cost:true},
  mcopy:{title:'Regenerate the listing copy',cost:true},mimages:{title:'Regenerate the marketing images',cost:true},mall:{title:'Regenerate listing copy and images',cost:true},
  mcancel:{title:'Cancel marketing (back to production approval)',destructive:true},edraft:{title:'Create the Etsy DRAFT (not published)',etsy:true},
  retry:{title:'Retry the failed step',maybeCost:true},
  // Stage 3 marketing engines (the choice is stored with the run) and per-image operations.
  mfac:{title:'Create the listing and marketing with 🧱 Factory',cost:true,engine:'factory'},mhyb:{title:'Create the listing and marketing with 🎨 Hybrid',cost:true,engine:'hybrid'},
  mai:{title:'Create the listing and marketing with ✨ AI Creative',cost:true,engine:'ai-creative'},mcmp:{title:'Generate the hero comparison (01-hero in all three styles)',cost:true},
  mrs:{title:'Regenerate the scene for this image',cost:true,slide:true},mrd:{title:'Change the art direction for this image',cost:true,slide:true},
  // Stage 1 full book (ADR-030). bgen has its own screen: pages required, reusable, to generate, image calls and cost.
  bgen:{title:'Generate the full colouring book',cost:true,book:true},
  bpr:{title:'Regenerate this page (same specification and style)',cost:true,page:true},bpd:{title:'Change the direction for this page',cost:true,page:true},
  bdir:{title:'Change the whole book\'s direction',book:true},bstop:{title:'Stop the full-book generation (every page made so far is kept)',destructive:true},
  // Stage 1 crochet pattern content (ADR-041). Drafts are AI-assisted and unverified; approval is a separate owner step.
  cgen:{title:'Draft the candidate crochet patterns (AI-assisted, unverified drafts for your review)',cost:true},
  cregen:{title:'Redraft the patterns that failed validation',cost:true},
  crev:{title:'Revise one pattern (1 AI text call after you send the change)',cost:true},
  creject:{title:'Reject the candidate patterns (every file is archived, not deleted)',destructive:true},
  // Crochet restyle (ADR-044): free on confirm; the new proofs are a separate, paid confirmation (regen).
  rstyle:{title:'Restyle',restyle:true},
  // Crochet visual set (ADR-063). Each has its own screen: image count, what is kept, cost (telegram/crochet-visuals.mjs).
  vgen:{title:'Generate the crochet visual set',cost:true,visuals:true},vrh:{title:'Restyle the collection hero',cost:true,visuals:true},
  vra:{title:'Restyle every crochet visual',cost:true,visuals:true},vrp:{title:'Restyle this pattern preview',cost:true,visuals:true},
  vstop:{title:'Stop the crochet visual set (every image made so far is kept)',destructive:true}});
/** "mrs04" / "bpr017" (menu data) -> CONFIRM key "mrs" / "bpr" and product action "mrs.04" / "bpr.017". */
const ITEM=/^((mrs|mrd|vrp)\d{2}|(bpr|bpd)\d{3})$/;
export const confirmKey=b=>ITEM.test(b)?b.slice(0,3):b;
const actionFor=b=>ITEM.test(b)?`${b.slice(0,3)}.${b.slice(3)}`:b;
const PRODUCT_SCREENS=['prod','pcost','ask','view','refresh','fail','mmode','mcomp','mslides','mslide','mview','book','bsheet','bpages','bpage','bpview','brej','vis'];
const SEO_SESSION_SCREENS=['seoses','seonext','seoterm','seoplan','seoev','seowhy','seofin','seores','seocopy'];
export function parseMenu(raw){
  if(typeof raw!=='string'||Buffer.byteLength(raw)>64)return null;
  const p=raw.split('|');if(p.length!==4||p[0]!=='m1')return null;
  const [,screen,a,b]=p;
  if(!SCREENS.includes(screen)||!/^[a-z0-9]{0,12}$/.test(a)||!/^[a-z0-9]{0,12}$/.test(b))return null;
  if(PRODUCT_SCREENS.includes(screen)&&!/^\d{3}$/.test(a))return null;
  if(screen==='ctx'&&!/^(\d{3}|home|costs|etsy|factory|tools|products)$/.test(a))return null;
  if(screen==='ask'&&!Object.hasOwn(CONFIRM,confirmKey(b)))return null;
  if(['mslide','mview'].includes(screen)&&!/^\d{2}$/.test(b))return null;
  if(['bpage','bpview'].includes(screen)&&!/^\d{3}$/.test(b))return null;
  if(screen==='bsheet'&&!/^\d{1,2}$/.test(b))return null;
  if(screen==='bpages'&&!['','regen'].includes(b))return null;
  if(screen==='vis'&&!['','p'].includes(b))return null;
  // SEO screens (ADR-036): product screens take a product id, session screens a session id ("s" + 10 hex).
  if(['seoprod','seolist','seostart','seoidea'].includes(screen)&&!/^\d{3}$/.test(a))return null;
  if(SEO_SESSION_SCREENS.includes(screen)&&!/^s[0-9a-f]{10}$/.test(a))return null;
  if(screen==='seoprods'&&!/^\d{0,3}$/.test(a))return null;
  if(screen==='seoterm'&&!/^(p\d{2}|r\dn\d{2})$/.test(b))return null;
  if(screen==='seohist'&&(!/^[0-9a-f]{10}$/.test(b)||!/^(s[0-9a-f]{10})?$/.test(a)))return null;
  return {screen,a,b};
}
const act=(text,action,p)=>({text,callback_data:encode(action,p.product_id,p.review.nonce)});

// ---------- product stage presentation (read from product.json state; no second state system) ----------
const GROUPS=[
  ['creative','🎨 Creative',['DRAFT','REFERENCES_RECEIVED','IDEAS_READY','CONCEPT_PREVIEWS_GENERATING','AWAITING_CONCEPT_SELECTION','CONCEPT_SELECTED','SPEC_READY','PROOFS_GENERATING','AWAITING_CREATIVE_APPROVAL','BOOK_GENERATING','AWAITING_BOOK_APPROVAL','PATTERNS_GENERATING','AWAITING_PATTERN_APPROVAL','VISUALS_GENERATING','AWAITING_VISUALS_APPROVAL']],
  ['production','🏭 Production',['CREATIVE_APPROVED','PRODUCTION_READY','PRODUCTION_BUILDING','PRODUCTION_QC','AWAITING_PRODUCTION_APPROVAL']],
  ['marketing','🛍 Marketing',['PRODUCTION_APPROVED','MARKETING_PLANNING','MARKETING_GENERATING','MARKETING_QC','AWAITING_MARKETING_APPROVAL']],
  ['ready','✅ Ready for Etsy',['MARKETING_APPROVED']],
  ['etsy','🏪 Etsy draft',['ETSY_PREPARING','ETSY_DRAFT_CREATED','ETSY_ASSETS_UPLOADING','ETSY_DRAFT_VERIFYING','AWAITING_ETSY_PUBLISH_APPROVAL','PUBLISHING']],
  ['live','🟢 Live on Etsy',['PUBLISHED']],['cancelled','⛔ Cancelled',['REJECTED']]];
export function stageOfProduct(p){
  // A colouring book whose style is approved is still in Stage 1 until its full artwork is approved.
  if(awaitingFullArtwork(p)||awaitingPatterns(p))return {key:'creative',label:'🎨 Creative',stage:'creative'};
  if(p.status==='FAILED'&&(inBook(p)||inPatterns(p)||inVisuals(p)))return {key:'failed',label:'⚠️ Failed (Creative)',stage:'creative'};
  if(p.status==='FAILED'){const g=GROUPS.find(([,,s])=>s.includes(p.resume_state));return {key:'failed',label:`⚠️ Failed (${g?g[1].replace(/^\S+\s/,''):'step'})`,stage:g?.[0]??null};}
  const g=GROUPS.find(([,,s])=>s.includes(p.status));return g?{key:g[0],label:g[1],stage:g[0]}:{key:'other',label:p.status,stage:null};
}
const WORKING=['CONCEPT_PREVIEWS_GENERATING','PROOFS_GENERATING','BOOK_GENERATING','PATTERNS_GENERATING','VISUALS_GENERATING','PRODUCTION_BUILDING','PRODUCTION_QC','MARKETING_PLANNING','MARKETING_GENERATING','MARKETING_QC',
  'ETSY_PREPARING','ETSY_DRAFT_CREATED','ETSY_ASSETS_UPLOADING','ETSY_DRAFT_VERIFYING','PUBLISHING'];
const HUMAN={AWAITING_CONCEPT_SELECTION:'choose a concept',AWAITING_CREATIVE_APPROVAL:'creative review',AWAITING_PRODUCTION_APPROVAL:'production review',
  AWAITING_MARKETING_APPROVAL:'marketing review',MARKETING_APPROVED:'ready for an Etsy draft',AWAITING_ETSY_PUBLISH_APPROVAL:'Etsy draft (publish manually on Etsy)',
  CREATIVE_APPROVED:'ready to build production files',PRODUCTION_APPROVED:'ready for listing & marketing',AWAITING_BOOK_APPROVAL:'full book review',AWAITING_PATTERN_APPROVAL:'crochet pattern review',AWAITING_VISUALS_APPROVAL:'crochet visual set review'};
const human=p=>awaitingFullArtwork(p)?'style approved — full artwork needed':awaitingPatterns(p)?'style approved — crochet patterns need approval'
  :p.status==='CREATIVE_APPROVED'&&p.crochet_visuals&&!visualsApproved(p)?'crochet visual set needs approval':HUMAN[p.status];
export const editorUrl=id=>`https://www.etsy.com/your/shops/me/listing-editor/edit/${id}`;
const liveEditor=p=>p.etsy?.mode==='live'&&p.etsy.listing_id?editorUrl(p.etsy.listing_id):null;
export const productCounts=products=>products.reduce((c,p)=>{const k=stageOfProduct(p).key;c[k]=(c[k]??0)+1;return c;},{});

// ---------- home ----------
/** @param d {products, spend, trackingStartedAt} (all optional: the dashboard never fails for lack of data) */
export function homeScreen(d={}){
  const products=d.products??[], c=productCounts(products);
  const active=products.filter(p=>!['REJECTED','PUBLISHED'].includes(p.status)).length, failed=c.failed??0;
  return {text:compose(heading('✨','LumiumX Factory'),'Create, manufacture and prepare digital products for Etsy.','',
    '🏭 Factory',failed?`${STATUS.warn} ${failed} product${failed>1?'s need':' needs'} attention`:'Running normally','',
    `📦 Active products: ${active}`,`🏪 Etsy drafts: ${c.etsy??0}`,'',
    '💰 Tracked API spend',d.spend===undefined||d.spend===null?'not tracked':money(d.spend),'',
    'What would you like to do?'),keyboard:{inline_keyboard:[
    [nav(L.create,'new')],[nav(L.products,'prods','0'),nav(L.drafts,'etsy')],[nav(L.seo,'seo')],[nav(L.costs,'costs'),nav(L.factory,'status')],[nav(L.tools,'tools'),nav(L.help,'help')]]}};
}
export function newProductScreen(){
  return {text:compose(heading('✨','Create product'),'Describe the product in one message, for example:',
    '• christmas greetings card for adults','• christmas colouring book for adults','• minimalist weekly planner','',
    'Press ✏️ Describe a product, then send your description.','(Or send /newproduct <description>.)','',
    'Creating a product is free. Generating concepts asks for confirmation first because it uses OpenAI.'),
    keyboard:{inline_keyboard:[[nav('✏️ Describe a product','describe')],[helpButton('home'),...HOME]]}};
}
export const describePrompt=()=>({text:compose(heading('✏️','New product'),'Send your product description as your next message.','','Example: christmas colouring book for adults','',
  'Nothing is generated until you press Generate concepts.'),keyboard:{inline_keyboard:[[nav(L.back,'new'),...HOME]]}});
export function productsScreen(products,{page=0,size=8}={}){
  const list=[...products].sort((a,b)=>b.product_id.localeCompare(a.product_id)), pages=Math.max(1,Math.ceil(list.length/size)), pg=Math.min(Math.max(0,page),pages-1);
  const slice=list.slice(pg*size,pg*size+size);
  const btns=slice.map(p=>[nav(`${pid(p)}  ${stageOfProduct(p).label}${p.name?` · ${p.name}`:''}`.slice(0,60),'prod',p.product_id)]);
  const pager=[...(pg>0?[nav('◀️ Newer','prods',String(pg-1))]:[]),...(pg<pages-1?[nav('Older ▶️','prods',String(pg+1))]:[])];
  return {text:list.length?`${heading('📦','My products')}${pages>1?` (page ${pg+1}/${pages})`:''}\n\nChoose a product:`:`${heading('📦','My products')}\n\nNo products yet. Use ${L.create}.`,
    keyboard:{inline_keyboard:[...btns,...(pager.length?[pager]:[]),[nav(L.create,'new'),...HOME]]}};
}

// ---------- product ----------
/** Cancel appropriate to where a failed product stopped (always behind a confirmation). */
const failedCancel=p=>{if(inBook(p))return 'bstop';if(inPatterns(p))return 'creject';if(inVisuals(p))return 'vstop';const s=stageOfProduct(p).stage;return s==='production'?'pcancel':s==='marketing'?'mcancel':s==='creative'?'reject':null;};
/**
 * Buttons offered for the product's CURRENT state only. Never an Etsy publish button.
 * @param book  the full-book plan (colouring books), when the caller has computed it
 */
export function productActions(p,{locked=false,book=null}={}){
  if(locked||p.lock||WORKING.includes(p.status))return [];
  const ask=(label,action)=>nav(label,'ask',p.product_id,action);
  const view=label=>nav(label,'view',p.product_id);
  switch(p.status){
    case 'DRAFT':case 'REFERENCES_RECEIVED':return [[ask('▶️ Generate Concepts','go')],[ask('✖️ Cancel Product','reject')]];
    case 'IDEAS_READY':return [[ask('🖼 Make Concept Previews','prev')],[ask('🔄 New Ideas','more')],[ask('✖️ Cancel Product','reject')]];
    case 'AWAITING_CONCEPT_SELECTION':return [[view('👀 View Concepts')],[ask('🔄 New Ideas','more')],[ask('✖️ Cancel Product','reject')]];
    case 'AWAITING_CREATIVE_APPROVAL':return [[view('👀 View Proofs')],[act('✅ Approve Creative','approve',p)],[act('✏️ Give Feedback','change',p),ask('🔄 Regenerate','regen')],[ask('❌ Reject','reject')]];
    case 'CREATIVE_APPROVED':
      if(awaitingFullArtwork(p))return [[ask(generateLabel(book),'bgen')],...(p.book?.pages?.length?[[nav('📖 Full Book','book',p.product_id)]]:[])];
      if(awaitingPatterns(p))return [...(p.crochet?.brief?[[ask(`🧶 Draft ${p.crochet.brief.pattern_count} Candidate Patterns (AI)`,'cgen')]]:[]),
        [act(p.crochet?.brief?'✏️ Change Pattern Count':'🧶 Set Pattern Count & Terms','cbrief',p)],[act('📂 Validate Supplied patterns.json (free)','cval',p)]];
      return [[act('🏭 Build Production Files','produce',p)],...visualSetActions(p,ask),...(canRestyle(p)?[[ask('🎨 Restyle Product','rstyle')]]:[]),...(canReopenPatterns(p)?[[act(REVALIDATE_EDITED,'cval',p)]]:[])];
    // A restyled crochet product waits at the style-proof gate until the owner confirms the (paid) proofs.
    case 'SPEC_READY':return p.restyles?.length?[[ask('🎨 Generate Style Proofs','regen')]]:[];
    case 'AWAITING_PATTERN_APPROVAL':return [[view('👀 Review Patterns')],...(p.crochet?.validation?.ok?[[act('✅ Approve Patterns','capprove',p)]]:[]),
      ...(p.crochet?.plan&&p.crochet.patterns.some(r=>r.status==='invalid')?[[ask('🔁 Redraft Invalid Patterns (AI)','cregen')]]:[]),
      ...(p.crochet?.plan?[[ask('✏️ Revise a Pattern (AI)','crev')]]:[]),[act('🔄 Re-validate patterns.json (free)','cval',p)],[ask('❌ Reject Patterns','creject')]];
    // ADR-067: passed, or this product's owner-approved overflow exception for this exact QC report (re-checked on approval).
    case 'AWAITING_BOOK_APPROVAL':return [[nav('📖 Book Review','book',p.product_id)],...(p.book?.qc?.passed||(p.book?.qc?.override&&p.book.qc.override.qc_sha256===p.book.qc.sha256)?[[act('✅ Approve Full Book','bapprove',p)]]:[]),
      [nav('🔎 Inspect Individual Page','bpages',p.product_id)],[nav('❌ Reject / Change Direction','brej',p.product_id)]];
    case 'AWAITING_PRODUCTION_APPROVAL':return [[view('📦 View Deliverables')],[act('✅ Approve Production','papprove',p)],[act('🔄 Rebuild (no API cost)','prebuild',p)],[ask('✖️ Cancel Production','pcancel')]];
    case 'PRODUCTION_APPROVED':return [[nav('🛍 Create Listing & Marketing','mmode',p.product_id)],...visualSetActions(p,ask)];
    case 'AWAITING_VISUALS_APPROVAL':return [[view('👀 View Visual Set')],...(p.crochet_visuals?.qc?.passed?[[act('✅ Approve Visual Set','vapprove',p)]]:[]),
      [ask('🔁 Restyle Hero','vrh'),nav('🔁 Restyle a Preview','vis',p.product_id,'p')],[ask('🔁 Restyle All Visuals','vra')],[ask('✖️ Stop (keep every image)','vstop')]];
    case 'AWAITING_MARKETING_APPROVAL':return [[view('👀 View Marketing')],[act('✅ Approve Marketing','mapprove',p)],[nav('🧩 Edit Individual Images','mslides',p.product_id)],
      [ask('✏️ Regenerate Listing Copy','mcopy')],[ask('🖼 Regenerate Marketing Images','mimages')],[ask('🔄 Regenerate All','mall')],[ask('✖️ Cancel Marketing','mcancel')]];
    case 'MARKETING_APPROVED':return [[ask('🏪 Create Etsy Draft','edraft')],[view(L.summary)]];
    case 'AWAITING_ETSY_PUBLISH_APPROVAL':return [
      ...(liveEditor(p)?[[link(L.editor,liveEditor(p))]]:[]),[nav('🔄 Refresh Draft','refresh',p.product_id)],[view(L.summary)]];
    case 'PUBLISHED':return p.etsy?.listing_url&&/^https:\/\/www\.etsy\.com\//.test(p.etsy.listing_url)?[[link('🔗 Open on Etsy',p.etsy.listing_url)]]:[];
    case 'FAILED':{
      const s=retrySafety(p), cancel=failedCancel(p);
      return [...(s.safe?[[s.paid?ask(L.retryPaid,'retry'):act(L.retry,'retry',p)]]:[]),...(canReopenPatterns(p)?[[act(REVALIDATE_EDITED,'cval',p)]]:[]),[nav(L.details,'fail',p.product_id)],...(cancel?[[ask('✖️ Cancel',cancel)]]:[])];
    }
    default:return [];
  }
}
/** Crochet visual set (ADR-063) buttons for an approved-patterns crochet product: generate / finish, or restyle an approved set. */
function visualSetActions(p,ask){
  if(!visualsApplicable(p))return [];
  if(visualsApproved(p))return [[nav('🎨 Restyle Crochet Visuals','vis',p.product_id)]];
  const pr=visualsProgress(p);
  return [[ask(!pr?'🖼 Generate Crochet Visual Set':pr.toGenerate?`🖼 Finish Crochet Visual Set (${pr.toGenerate} to make)`:'🖼 Review Crochet Visual Set','vgen')]];
}
export function productScreen(p,{cost,locked=false,book=null}={}){
  const st=stageOfProduct(p);
  const lines=[p.name??p.request?.text??'','',`Stage: ${st.label}${human(p)?` — ${human(p)}`:''}`];
  if(needsFullArtwork(p)&&book&&['CREATIVE_APPROVED','AWAITING_BOOK_APPROVAL'].includes(p.status))lines.push(...bookStatusLines(p,book));
  if(p.lock||WORKING.includes(p.status))lines.push(`${STATUS.busy} Working… (buttons appear when this step finishes)`);
  if(p.status==='FAILED'&&p.last_error)lines.push('',knownFailure(p)?`❌ Failed at ${knownFailure(p).stage}: ${knownFailure(p).lines[0]}`:`${STATUS.warn} ${shortError(p.last_error.message)}`);
  if(p.status==='AWAITING_ETSY_PUBLISH_APPROVAL')lines.push('',p.etsy?.mode==='live'?`Etsy listing ${p.etsy.listing_id} is a DRAFT. Review and publish it yourself on Etsy.`:'Dry-run record: no Etsy listing exists.');
  lines.push('',...costLines(cost));
  return {text:compose(heading('📦',`Product ${pid(p)}`),...lines),keyboard:{inline_keyboard:[...productActions(p,{locked,book}),
    [nav(L.productCost,'pcost',p.product_id),helpButton(p.product_id)],[nav(L.back,'prods','0'),...HOME]]}};
}
/** ⚠️ needs attention: short error first, then details and what is safe to do. */
export function failureScreen(p){
  const e=p.last_error??{}, s=retrySafety(p), known=knownFailureText(p);
  // A known failure: the plain summary only (the exception stays in the log).
  if(known)return {text:known,keyboard:{inline_keyboard:[...productActions(p).filter(r=>r.some(b=>/Retry|Cancel/.test(b.text))),[nav(L.product,'prod',p.product_id),...HOME]]}};
  return {text:compose(`${STATUS.warn} Product ${pid(p)} needs attention`,shortError(e.message),'',
    rows([['Step',e.step??'—'],['When',e.at?e.at.slice(0,16).replace('T',' ')+' UTC':'—'],['Resumes from',p.resume_state??'—']]),'',
    s.safe?`${s.paid?'🔄 Retry (API cost)':'🔄 Retry Safe Step'}: ${s.reason}`:`No retry offered: ${s.reason}`,'',
    'Full message:',String(e.message??'').slice(0,1500)),
    keyboard:{inline_keyboard:[...productActions(p).filter(r=>r.some(b=>/Retry|Cancel/.test(b.text))),[nav(L.product,'prod',p.product_id),...HOME]]}};
}
function costLines(c){
  if(!c)return ['Estimated API cost: not tracked (no cost ledger configured)'];
  // Never show £0.00 for a product whose calls all happened before tracking began.
  if(!c.events&&c.untrackedCalls)return [`Estimated API cost: not tracked — all ${c.untrackedCalls} OpenAI call${c.untrackedCalls>1?'s':''} predate cost tracking`,
    ...(c.trackingStartedAt?[`Tracked since ${c.trackingStartedAt.slice(0,16).replace('T',' ')} UTC`]:[])];
  const out=[`Estimated API cost: ${gbp(c.total)}${c.unpriced?` (+${c.unpriced} unpriced call${c.unpriced>1?'s':''})`:''}${!c.events?' (no OpenAI calls yet)':''}`];
  if(c.trackingStartedAt)out.push(`Tracked since ${c.trackingStartedAt.slice(0,16).replace('T',' ')} UTC`);
  if(c.untrackedCalls)out.push(`${c.untrackedCalls} earlier OpenAI call${c.untrackedCalls>1?'s were':' was'} made before tracking began and ${c.untrackedCalls>1?'are':'is'} not included.`);
  return out;
}
export function productCostScreen(p,c){
  const r=c.rows.map(r=>[r.label,r.deterministic?'£0.00 (no API calls)':`${gbp(r.gbp)}${r.unpriced?` +${r.unpriced} unpriced`:''}`]);
  return {text:[heading('💰',`Product ${pid(p)} — estimated API cost`),'',r.length?table(r):'No tracked API calls yet.','─'.repeat(30),table([['Total',gbp(c.total)]]),'',...costLines(c).slice(1)].join('\n'),
    keyboard:{inline_keyboard:[[nav(L.back,'prod',p.product_id),...HOME]]}};
}
/** @param estimate  optional line: the operation's estimated OpenAI calls and cost */
export function confirmScreen(p,action,{estimate=null,slide=null}={}){
  const c=CONFIRM[confirmKey(action)];
  if(c.restyle)return {text:[`Restyle ${pid(p)}?`,'Current proofs will be archived.','Patterns will not be changed.','New proofs will require 3 image calls.'].join('\n'),
    keyboard:{inline_keyboard:[[act('Confirm Restyle','rstyle',p)],[nav('Cancel','prod',p.product_id)]]}};
  const warn=c.cost?'⚠️ This will incur OpenAI API cost.':action==='bdir'?'The generated pages are archived (kept in book/history/) and marked for regeneration. Nothing is generated until you confirm the new generation and its cost.':c.maybeCost?'⚠️ Retrying an AI step may incur OpenAI API cost.':c.destructive?'⚠️ This cannot be undone from here.':c.etsy?'Creates a DRAFT only. Nothing is published; you publish on Etsy yourself.':'';
  const label=c.cost?`${c.title.split(' ')[0]} — API cost will be incurred`:c.destructive?'Confirm':c.etsy?'🏪 Create Etsy Draft':'Confirm';
  const back=c.slide?nav('Cancel','mslide',p.product_id,action.slice(3)):c.page?nav('Cancel','bpage',p.product_id,action.slice(3)):c.book&&action==='bdir'?nav('Cancel','book',p.product_id)
    :c.engine||action==='mcmp'?nav('Cancel','mmode',p.product_id):nav(c.destructive?'Keep Product':'Cancel','prod',p.product_id);
  return {text:[heading('📦',`Product ${pid(p)}`),'',`${c.title}${slide?` (${slide})`:''}?`,warn,estimate].filter(Boolean).join('\n'),
    keyboard:{inline_keyboard:[[act(label,actionFor(action),p)],[back]]}};
}

// ---------- Stage 3: marketing style ----------
/** Choose how the campaign is produced. Hybrid is recommended but never chosen automatically. */
export function marketingModeScreen(p,{comparison=null}={}){
  return {text:compose(heading('🛍','Marketing'),`${pid(p)} ${p.name??''}`.trim(),'','Choose a marketing style:','',
    '✨ AI Creative','Premium AI-directed advertising compositions','',
    '🎨 Hybrid','AI art direction + verified real product artwork','Recommended','',
    '🧱 Factory','Existing deterministic LumiumX templates','',
    'Every style shows only the REAL approved product and code-rendered text.',
    comparison?'Your hero comparison is ready (sent above).':'Not sure? 🆚 Generate Hero Comparison makes only 01-hero in all three styles.'),
    keyboard:{inline_keyboard:[[nav('✨ AI Creative','ask',p.product_id,'mai')],[nav('🎨 Hybrid — Recommended','ask',p.product_id,'mhyb')],[nav('🧱 Factory','ask',p.product_id,'mfac')],
      [nav('🆚 Generate Hero Comparison','ask',p.product_id,'mcmp')],[nav('❓ Compare Modes','mcomp',p.product_id)],[nav(L.product,'prod',p.product_id),...HOME]]}};
}
export function compareModesScreen(p){
  return {text:compose(heading('❓','Marketing styles'),
    '🧱 Factory',"The existing LumiumX templates and coded layouts. Proven; can look template-like.",'',
    '🎨 Hybrid (recommended)','OpenAI art-directs each image and paints its environment around an empty product area. Code places the real approved artwork there, whole, with perspective and shadow, and renders all text.','',
    '✨ AI Creative','Like Hybrid, with more AI freedom over layout, scale, angle, light and décor. The AI composition is a reference: code rebuilds it with the real artwork and code-rendered text.','',
    'All three: real Stage 2 artwork only, never an AI recreation; the same factual and product-truth QC; every OpenAI call in the cost ledger.'),
    keyboard:{inline_keyboard:[[nav(L.back,'mmode',p.product_id),...HOME]]}};
}
const TEMPLATE_LABEL={hero:'Hero',designs:'Designs',inside:'Inside',included:"What's Included",design:'Design Detail',print:'Print at Home',sizes:'Sizes',gift:'Gift',digital:'Digital Download'};
export const slideLabel=s=>`${s.id.slice(0,2)} ${TEMPLATE_LABEL[s.template]??s.template}${s.design?` ${s.design}`:''}`;
/** @param status {[slideId]: 'ok'|'warn'} from QC and warnings */
export function marketingSlidesScreen(p,{plan,status={},engine='factory'}){
  const list=plan.slides.map(s=>[slideLabel(s),status[s.id]==='warn'?'⚠️':'✅']);
  return {text:compose(heading('🛍',`Product ${pid(p)} — marketing`),`Style: ${({factory:'🧱 Factory',hybrid:'🎨 Hybrid','ai-creative':'✨ AI Creative'})[engine]??engine}`,'',rows(list),'',
    'Choose an image to view or change it.'),
    keyboard:{inline_keyboard:[...plan.slides.map((s,i)=>[nav(`${status[s.id]==='warn'?'⚠️':'✅'} ${slideLabel(s)}`,'mslide',p.product_id,String(i+1).padStart(2,'0'))]),[nav(L.back,'prod',p.product_id),...HOME]]}};
}
/**
 * One image: view it; regenerate its scene or change its direction (paid, confirmed);
 * rebuild its composite from the existing assets (free, runs directly).
 */
export function marketingSlideScreen(p,{slide,index,engine='factory',warning=null,sceneShared=[]}){
  // A creative card (ADR-058) has an AI scene only when its direction asks for an environment.
  const n=String(index).padStart(2,'0'), paidScene=engine!=='factory'&&slide.template!=='creative'?true:!!slide.scene;
  return {text:compose(heading('🖼',`${pid(p)} · ${slideLabel(slide)}`),slide.purpose??'',warning?`⚠️ ${warning}`:null,'',
    paidScene?`✨ Regenerate Scene: 1 new AI environment image${sceneShared.length>1?` (shared with ${sceneShared.filter(x=>x!==slide.id).join(', ')}, re-rendered too)`:''}.`:'This image uses a coded environment (no AI scene).',
    engine!=='factory'?`🎨 Change Direction: send an instruction; 1 art-direction call${slide.template==='creative'?' (+ 1 environment image only if the card uses an AI scene)':' + 1 environment image'}.`:null,
    '🧱 Rebuild Composite: re-render from the existing assets. £0.00 OpenAI cost.'),
    keyboard:{inline_keyboard:[[nav('👀 View','mview',p.product_id,n)],...(paidScene?[[nav('✨ Regenerate Scene','ask',p.product_id,`mrs${n}`)]]:[]),
      ...(engine!=='factory'?[[nav('🎨 Change Direction','ask',p.product_id,`mrd${n}`)]]:[]),[act('🧱 Rebuild Composite',`mrc.${n}`,p)],[nav(L.back,'mslides',p.product_id),...HOME]]}};
}

// ---------- Etsy ----------
export function etsyDraftsScreen(products){
  const drafts=products.filter(p=>stageOfProduct(p).key==='etsy'||p.status==='PUBLISHED').sort((a,b)=>b.product_id.localeCompare(a.product_id));
  const btns=drafts.map(p=>[nav(`${pid(p)}  ${stageOfProduct(p).label}${p.etsy?.listing_id?` · ${p.etsy.listing_id}`:''}`.slice(0,60),'prod',p.product_id)]);
  return {text:compose(heading('🏪','Etsy drafts'),drafts.length?'Drafts are published by you on Etsy.':'No Etsy drafts yet.','',`Publishing: ${STATUS.lock} manual (on Etsy)`),
    keyboard:{inline_keyboard:[...btns,[helpButton('etsy'),...HOME]]}};
}

// ---------- costs ----------
export function costsScreen(t,{trackingStartedAt,corrupt=0}={}){
  return {text:compose(heading('💰','API costs'),
    trackingStartedAt?`Tracked since: ${dateOnly(trackingStartedAt)}`:'Cost tracking starts with the next OpenAI call.','',
    rows([['Today',money(t.today)],['Last 7 days',money(t.last7)],['This month',money(t.month)],['All tracked',money(t.all)]]),'',
    rows([['Average / product',t.average===null?'—':money(t.average)]]),
    t.unpriced?`${t.unpriced} call${t.unpriced>1?'s':''} could not be priced (see By Model).`:null,corrupt?`${corrupt} unreadable ledger line(s) skipped.`:null,'',
    'Factory costs are calculated from recorded API usage.',"OpenAI's dashboard is the source of truth for your account billing and remaining credits."),
    keyboard:{inline_keyboard:[[nav(L.byProduct,'costp'),nav(L.byModel,'costm')],[link(L.openai,OPENAI_USAGE_URL)],[helpButton('costs'),...HOME]]}};
}
export const costsUnavailableScreen=()=>({text:compose(heading('💰','API costs'),'Cost tracking is not configured on this bot.','',
  "OpenAI's dashboard is the source of truth for your account billing and remaining credits."),
  keyboard:{inline_keyboard:[[link(L.openai,OPENAI_USAGE_URL)],[...HOME]]}});
export function costByProductScreen(list){
  return {text:[heading('💰','Cost by product (estimated, tracked)'),'',list.length?table(list.map(r=>[pid(String(r.productId)),`${gbp(r.gbp)}${r.unpriced?` +${r.unpriced} unpriced`:''}`])):'No tracked API calls yet.'].join('\n'),
    keyboard:{inline_keyboard:[...list.slice(0,8).map(r=>[nav(`${pid(String(r.productId))} breakdown`,'pcost',r.productId)]),[nav(L.back,'costs'),...HOME]]}};
}
export function costByModelScreen(list,pricing){
  return {text:[heading('🤖','Cost by model (estimated, tracked)'),'',list.length?table(list.map(r=>[r.model,`${gbp(r.gbp)} · ${r.events} call${r.events>1?'s':''}${r.unpriced?` · ${r.unpriced} unpriced`:''}`])):'No tracked API calls yet.','',
    pricing?`Prices: ${pricing.version} (${pricing.currency}); GBP rate ${pricing.fx?`${pricing.fx.rate} (${pricing.fx.as_of})`:'not configured'}.`:''].join('\n'),
    keyboard:{inline_keyboard:[[nav(L.back,'costs'),...HOME]]}};
}

// ---------- factory ----------
/**
 * @param d {counts, openaiConfigured, etsy:{mode,connected,publishFlag}, adapters:[{format,label,ready,note}]}
 *   An adapter is ready only when the whole path works: e.g. a colouring book also needs Stage 1 full-book artwork.
 */
export function statusScreen({counts,openaiConfigured,etsy,adapters=[]}){
  const e=etsy.mode==='live'?(etsy.connected?`${STATUS.ok} Connected`:`${STATUS.warn} Not connected`):etsy.mode==='dry-run'?`${STATUS.test} Dry run${etsy.connected?' (shop connected)':''}`:`${STATUS.off} Blocked`;
  return {text:compose(heading('📊','Factory'),
    rows([['Telegram',`${STATUS.ok} Online`],['OpenAI',openaiConfigured?`${STATUS.ok} Configured`:`${STATUS.warn} Not configured`],['Production',`${STATUS.ok} Ready`],
      ['Marketing',`${STATUS.ok} Ready`],['Etsy',e],['Publishing',`${STATUS.lock} Manual`]]),
    etsy.publishFlag?'(ETSY_PUBLISH_ENABLED is on, but publishing is never offered from these screens.)':null,'',
    'Adapters',rows(adapters.map(a=>[a.label,a.ready?`${STATUS.ok} Ready`:`${STATUS.partial} ${a.note??'Not ready'}`])),'',
    'Products',rows([['Creative',counts.creative],['Production',counts.production],['Marketing',counts.marketing],['Ready for Etsy',counts.ready],['Etsy drafts',counts.etsy],
      ['Live',counts.live],['Failed',counts.failed]].map(([a,b])=>[a,String(b??0)])),'',
    '(Local state and configuration only. Refresh makes no API calls.)'),
    keyboard:{inline_keyboard:[[nav(L.refresh,'status')],[helpButton('factory'),...HOME]]}};
}

// ---------- tools ----------
export function toolsScreen(){
  return {text:compose(heading('⚙️','Tools'),'Owner shortcuts. Nothing here spends money or changes a product.','',
    '• 📋 All commands: every slash command, grouped','• 🌐 OpenAI Usage / Billing: your account on platform.openai.com','• 📊 Factory: services, adapters and product counts','',
    'Server checks (run on the machine):','npm --prefix automation run check-config'),
    keyboard:{inline_keyboard:[[nav('📋 All Commands','help')],[link(L.openai,OPENAI_USAGE_URL)],[nav(L.factory,'status')],[...HOME]]}};
}

// ---------- help ----------
/** Commands registered with Telegram's native "/" menu: owner-facing only. */
export const BOT_COMMANDS=Object.freeze([
  {command:'start',description:'Open LumiumX Factory'},{command:'newproduct',description:'Create a new product'},
  {command:'products',description:'Browse products'},{command:'status',description:'Product/factory status'},
  {command:'produce',description:'Build customer files for a product'},{command:'market',description:'Listing & marketing for a product'},
  {command:'etsy',description:'Etsy draft tools'},{command:'seo',description:'SEO & market research'},{command:'costs',description:'API cost tracking'},{command:'help',description:'Commands and help'}]);
/** Help, grouped. Buttons and commands are two interfaces over the same actions. */
export const HELP_GROUPS=Object.freeze([
  ['Menu',[['/start or /menu','open LumiumX Factory (buttons for everything below)'],['/help','this help']]],
  ['Product',[['/newproduct <request>','start a product'],['/products','browse products'],['/go','generate concepts for the active product'],['/previews','make or re-send concept previews'],['/status [number]','a product, or the factory'],['/cancel','cancel the active product']]],
  ['Review (buttons on each review message)',[['A / B / C','choose a concept'],['APPROVE STYLE · REGENERATE · CHANGE DIRECTION · REJECT','creative review'],['Reply with text','give feedback after CHANGE DIRECTION']]],
  ['Production & marketing',[['/produce <number>','build the customer files (no API cost)'],['/market <number>','Etsy listing and listing images (API cost)']]],
  ['Etsy',[['/etsy <number>','create and verify an Etsy DRAFT, or re-check an existing one'],['/etsy','Etsy drafts'],['/etsy <number> confirm-no-draft','only after checking Etsy when a draft creation was uncertain']]],
  ['SEO',[['/seo','SEO & market research: audit a product, research a new one, Marketplace Insights library (never changes Etsy)']]],
  ['Costs',[['/costs','estimated OpenAI cost: factory, per product, per model']]]]);
export function helpScreen(){
  return {text:[heading('❓','Help'),'',...HELP_GROUPS.flatMap(([g,items])=>[g,...items.map(([c,d])=>`  ${c} — ${d}`),'']),
    'Every button runs the same action as its command; the commands remain available as shortcuts. Type / to see them.','Etsy listings are published by you on Etsy; the bot only creates drafts.'].join('\n'),
    keyboard:{inline_keyboard:[[...HOME]]}};
}
// What the owner can do on each product stage: button actions and their commands.
const HERE={
  DRAFT:[['Generate concepts (API cost, asks first)','/go'],['Send reference images',''],['Cancel the product','/cancel']],
  IDEAS_READY:[['Make concept previews (API cost, asks first)','/previews'],['Generate new ideas (API cost)',''],['Cancel the product','/cancel']],
  AWAITING_CONCEPT_SELECTION:[['View the concepts','/previews'],['Choose A, B or C (buttons on the concepts)',''],['Generate new ideas (API cost)',''],['Cancel the product','/cancel']],
  AWAITING_CREATIVE_APPROVAL:[['View the proofs',''],['Approve the creative',''],['Give feedback (new direction + proofs, API cost)',''],['Regenerate proofs (API cost)',''],['Reject the product','/cancel']],
  CREATIVE_APPROVED:[['Build the production files (no API cost)','/produce {id}']],
  // A colouring book after its style approval (awaitingFullArtwork).
  BOOK_PENDING:[['Generate the full colouring book: every page, reusing the approved style proofs that match (API cost, asks first)',''],['Open the full book review (when pages exist)',''],['Production starts only after the full artwork is approved','/produce {id}']],
  AWAITING_BOOK_APPROVAL:[['View the pages in batches of 8 (contact sheets)',''],['Inspect one page: view full size, regenerate, change its direction (API cost, asks first)',''],
    ['Approve the full book (only when Creative QC passes)',''],['Change the whole book direction, or reject the product',''],['Reject the product','/cancel']],
  AWAITING_PRODUCTION_APPROVAL:[['View the deliverables','/produce {id}'],['Approve production',''],['Rebuild (no API cost)',''],['Cancel production','/cancel']],
  PRODUCTION_APPROVED:[['Choose a marketing style: AI Creative, Hybrid (recommended) or Factory (API cost, asks first)',''],['Generate a hero comparison of the three styles (API cost)',''],['Factory marketing by command','/market {id}']],
  AWAITING_MARKETING_APPROVAL:[['View marketing','/market {id}'],['Approve marketing',''],['Edit individual images: view, regenerate scene, change direction, rebuild composite (free)',''],['Request changes: regenerate copy or images (API cost)',''],['Regenerate marketing (API cost)',''],['Cancel marketing','/cancel']],
  MARKETING_APPROVED:[['Create the Etsy draft (asks first; never published)','/etsy {id}'],['Product summary','']],
  AWAITING_ETSY_PUBLISH_APPROVAL:[['Open the Etsy editor (live drafts)',''],['Refresh the draft (read-only)','/etsy {id}'],['Publish: only by you, on Etsy','']],
  FAILED:[['See the error details',''],['Retry the safe step, when offered',''],['Cancel the stage','/cancel']]};
const SCREEN_HELP={
  home:[['Create a product','/newproduct <request>'],['Browse products','/products'],['Etsy drafts','/etsy'],['API costs','/costs'],['Factory status','/status'],['All commands','/help']],
  costs:[['Cost by product and by model',''],['Open your OpenAI usage and billing page',''],['API costs','/costs']],
  etsy:[['Open a draft to refresh it or open the Etsy editor',''],['Create a draft for a product','/etsy <number>'],['Publishing: only by you, on Etsy','']],
  factory:[['Refresh (no API calls)',''],['Factory status','/status']],
  tools:[['All commands','/help'],['Check the server configuration','npm --prefix automation run check-config']],
  products:[['Open a product',''],['Create a product','/newproduct <request>']]};
/** Contextual help: ONLY what applies to this screen or product state. */
export function contextHelpScreen(ctx,p=null){
  const items=p?[...(HERE[awaitingFullArtwork(p)?'BOOK_PENDING':p.status]??[]),['View the product cost',''],['Return home','/start']]:SCREEN_HELP[ctx]??SCREEN_HELP.home;
  const fill=s=>s.replaceAll('{id}',p?.product_id??'');
  const cmds=[...new Set(items.map(([,c])=>fill(c)).filter(Boolean)),...(p?[`/status ${p.product_id}`]:[])];
  const title=p?`${heading('❓',`Product ${pid(p)}`)} — ${stageOfProduct(p).label.replace(/^\S+\s/,'')}${human(p)?` (${human(p)})`:''}`:heading('❓','What can I do here?');
  const back=p?nav(L.back,'prod',p.product_id):nav(L.back,{costs:'costs',etsy:'etsy',factory:'status',tools:'tools',products:'prods'}[ctx]??'home',ctx==='products'?'0':'');
  return {text:compose(title,'Available here:',...items.map(([a])=>`• ${a}`),'','Commands:',...cmds.map(c=>` ${c}`)),keyboard:{inline_keyboard:[[back,...HOME]]}};
}
export { STAGES };
