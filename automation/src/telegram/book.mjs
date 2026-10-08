// Stage 1 full-book screens (ADR-030): generation plan (the paid confirmation),
// book review with contact-sheet batches, the page picker, one page, and
// reject / change direction. Pure functions: data -> {text, keyboard}.
// Paid buttons go through a confirmation that states the image calls and cost;
// every product-changing button is an a1 action with the product's nonce.
import { encode } from './approvals.mjs';
import { nav, HOME, helpButton, heading, compose, rows, money, pid, STATUS, L } from './ui.mjs';
import { batches, ranges, pageId } from '../orchestrator/book-state.mjs';
import { effectiveBookQc, overflowReview } from '../../../production/src/index.mjs';

const act=(text,action,p)=>({text,callback_data:encode(action,p.product_id,p.review.nonce)});
const n3=n=>String(n).padStart(3,'0');
const chunk=(list,k)=>Array.from({length:Math.ceil(list.length/k)},(_,i)=>list.slice(i*k,i*k+k));
const QC_MARK={ok:'✅',warn:'⚠️',fail:'❌'};
const costLine=e=>e?.gbp===null||e?.gbp===undefined?'Estimated API cost: not known yet (no priced image calls in the cost log; OpenAI bills per image)':`Estimated API cost: ${money(e.gbp)}`;

/** Lines for the product screen: where the full artwork stands. */
export function bookStatusLines(p,plan){
  if(!plan)return [];
  if(p.book?.approval)return [`📖 Full artwork approved: ${plan.total}/${plan.total} pages`];
  return ['Style approved',`📖 Full artwork: ${plan.available}/${plan.total} available`];
}
/** Generate button label for the product screen and next-step keyboards. */
export const generateLabel=plan=>!plan?'🎨 Generate Full Colouring Book':plan.toGenerate===0?'📖 Check & Review Full Book (no API cost)'
  :plan.available>0?`🎨 Generate Remaining ${plan.toGenerate} Page${plan.toGenerate>1?'s':''}`:'🎨 Generate Full Colouring Book';

/**
 * 📖 FULL BOOK GENERATION: the confirmation before any paid page image.
 * @param plan {total, available, reusable, toGenerate, notReused:[{page_number,reason}]}
 * @param estimate {image, gbp|null}
 */
export function bookGenerateScreen(p,{plan,estimate,size}){
  const n=plan.toGenerate;
  const lines=[`${pid(p)} ${p.name??''}`.trim(),'',
    `${plan.total} pages required`,
    plan.reusable?`${plan.reusable} approved style page${plan.reusable>1?'s':''} reusable`:'No approved style page is reusable',
    ...(plan.available>plan.reusable?[`${plan.available-plan.reusable} page${plan.available-plan.reusable>1?'s':''} already generated (kept, never paid twice)`]:[]),
    n?`${n} page${n>1?'s':''} need generation`:'Every page has artwork',
    ...(plan.notReused?.length?['',...plan.notReused.map(r=>`Not reused: page ${r.page_number} proof (${r.reason})`)]:[]),'',
    `Estimated new image calls: ${n}`,n?costLine(estimate):'Estimated API cost: £0.00',
    ...(size?['',`Pages are generated at ${size.replace('x','×')} px (the largest size the image model offers for this page shape). Stage 2 calculates the real print resolution.`]:[]),
    n?'Progress is saved after every page: an interruption resumes from the first missing page.':'Runs the creative QC and sends the book for review.'];
  return {text:compose(heading('📖','Full book generation'),...lines),
    keyboard:{inline_keyboard:[[act(n?`🎨 Generate ${n} Page${n>1?'s':''}`:'📖 Check & Review (no API cost)','bgen',p)],[nav('Cancel','prod',p.product_id)]]}};
}

/** 📖 FULL BOOK REVIEW text. @param spend {gbp,events}|null  @param total product total £|null */
/**
 * ADR-067: the creative QC as the owner should act on it: passed, passed with this product's owner override, an
 * owner review of decorative artwork overflow (the only overridable rule), or a hard failure.
 */
export function bookQcState(p,qc){
  const eff=effectiveBookQc(qc,p.book?.qc?.sha256,p.book?.qc?.override??null), review=overflowReview(qc);
  return {passed:eff.passed,overridden:eff.overridden,statement:eff.statement,review:!eff.passed&&review.reviewable?review:null};
}
export function bookReviewText(p,{qc,progress,spend=null,total=null}){
  const fails=Object.entries(qc.pages).filter(([,x])=>x.status==='fail'), s=bookQcState(p,qc);
  return compose(heading('📖',`Product ${pid(p)} — full book review`),p.name??'','',
    `${progress.available}/${progress.total} pages generated${progress.reused?` (${progress.reused} reused style proof${progress.reused>1?'s':''})`:''}`,
    `Creative QC: ${s.overridden?s.statement:qc.passed?'PASS':s.review?'OWNER REVIEW REQUIRED':'FAIL'}${qc.warnings.length?` (${qc.warnings.length} warning${qc.warnings.length>1?'s':''})`:''}`,
    ...(qc.passed||s.overridden||s.review?[]:[`Failed: ${qc.checks.filter(c=>!c.ok).map(c=>c.name).join('; ')}`]),
    ...(s.review?['',`⚠️ Product ${pid(p)}: decorative artwork reaches past the page edge on ${s.review.pages.length} page${s.review.pages.length>1?'s':''}:`,
      ...s.review.pages.slice(0,12).map(x=>`• ${x.page_id}: ${x.reason}`),...(s.review.pages.length>12?[`• …and ${s.review.pages.length-12} more`]:[]),
      'Inspect them (🔎 below). ✅ ACCEPT OVERFLOW records an owner-approved exception for these pages of this product only; every other check stays in force.']
      :fails.slice(0,8).map(([id,x])=>`❌ ${id} ${x.fails.join('; ')}`)),...(!s.review&&fails.length>8?[`❌ …and ${fails.length-8} more`]:[]),
    ...qc.warnings.slice(0,6).map(w=>`⚠️ ${w}`),...(qc.warnings.length>6?[`⚠️ …and ${qc.warnings.length-6} more`]:[]),'',
    spend?`Estimated generation cost: ${money(spend.gbp)}${spend.unpriced?` (+${spend.unpriced} unpriced)`:''}`:'Estimated generation cost: not tracked',
    ...(total!==null?[`Product total: ${money(total)}`]:[]),'',
    s.passed?'Check every page, then approve the full artwork. Production only starts after ✅ Approve Full Book.'
      :s.review?'Accept the overflow, fix / regenerate the pages, or cancel (nothing changes).'
      :'Approval is available once Creative QC passes: regenerate the ❌ pages (🔎 Inspect Individual Page).');
}
export function bookReviewKeyboard(p,{qc,total}){
  const s=qc?bookQcState(p,qc):{passed:false,review:null};
  return {inline_keyboard:[...batches(total).map(b=>[nav(`👀 View Pages ${b.from}–${b.to}`,'bsheet',p.product_id,String(b.index))]),
    // Owner review (ADR-067): each flagged page opens with its render; then accept, fix or cancel.
    ...(s.review?chunk(s.review.pages.slice(0,12).map(x=>nav(`🔎 ${x.page_id}`,'bpage',p.product_id,n3(Number(x.page_id.slice(1))))),4):[]),
    ...(s.review?[[act('✅ ACCEPT OVERFLOW','bovr',p)],[nav('🔁 FIX / REGENERATE','bpages',p.product_id,'regen')],[nav('❌ CANCEL','book',p.product_id)]]:[]),
    [nav('🔎 Inspect Individual Page','bpages',p.product_id)],[nav('✏️ Regenerate Page','bpages',p.product_id,'regen')],
    ...(s.passed?[[act('✅ Approve Full Book','bapprove',p)]]:[]),[nav('❌ Reject / Change Direction','brej',p.product_id)],
    [helpButton(p.product_id),...HOME]]};
}

/** Page picker: every page with its QC mark, 4 per row. */
export function bookPagesScreen(p,{qc,total,mode=''}){
  const mark=id=>QC_MARK[qc?.pages?.[id]?.status]??'▫️';
  const ids=Array.from({length:total},(_,i)=>pageId(i+1));
  const btns=ids.map((id,i)=>nav(`${mark(id)} ${id}`,'bpage',p.product_id,n3(i+1)));
  const grid=[];for(let i=0;i<btns.length;i+=4)grid.push(btns.slice(i,i+4));
  return {text:compose(heading('📖',`Product ${pid(p)} — pages`),mode==='regen'?'Choose the page to regenerate.':'Choose a page to inspect it.','',
    '✅ QC ok · ⚠️ warning · ❌ QC failed'),keyboard:{inline_keyboard:[...grid,[nav('⬅️ Book Review','book',p.product_id),...HOME]]}};
}

/** One page: what it is, its QC, and what can be done with it. */
export function bookPageScreen(p,{entry,manifestPage,qcPage,estimate}){
  const id=entry.page_id, n=n3(entry.page_number);
  const src=entry.status==='reused'?'Approved style proof (reused as this page)':entry.status==='generated'?`Generated${entry.revision?` (revision ${entry.revision})`:''}`:'No artwork yet';
  return {text:compose(heading('🖼',`${pid(p)} · ${id}`),manifestPage?.title??'','',
    rows([['Source',src],['Size',entry.width?`${entry.width}×${entry.height} px`:'—'],['QC',qcPage?`${QC_MARK[qcPage.status]} ${qcPage.status==='ok'?'passed':qcPage.status==='warn'?'warning':'failed'}`:'—']]),
    ...(qcPage?.fails??[]).map(x=>`❌ ${x}`),...(qcPage?.warns??[]).map(x=>`⚠️ ${x}`),
    entry.instruction?`Last change: "${entry.instruction}"`:null,'',
    `✨ Regenerate: same specification and style, 1 image call. ${costLine(estimate).replace('Estimated API cost: ','≈ ')}`,
    '✏️ Change Direction: send an instruction; 1 image call, keeping the approved book style.',
    'The replaced artwork is archived in book/history/, never deleted.'),
    keyboard:{inline_keyboard:[[nav('👀 View Full Size','bpview',p.product_id,n)],[nav('✨ Regenerate','ask',p.product_id,`bpr${n}`)],
      [nav('✏️ Change Direction','ask',p.product_id,`bpd${n}`)],[nav('⬅️ Book Review','book',p.product_id),...HOME]]}};
}

export function bookRejectScreen(p,{generated}){
  return {text:compose(heading('❌',`Product ${pid(p)} — reject or change direction`),
    '✏️ Change Book Direction',`Send one instruction for the whole book. The ${generated} generated page${generated===1?'':'s'} are archived (kept in book/history/) and marked for regeneration; the reused style-proof pages are kept. Nothing is generated until you confirm the new generation and its cost.`,'',
    '✖️ Reject Product','Stops this product. All files are kept.','',
    'To change a single page instead, use 🔎 Inspect Individual Page.'),
    keyboard:{inline_keyboard:[[nav('✏️ Change Book Direction','ask',p.product_id,'bdir')],[nav('✖️ Reject Product','ask',p.product_id,'reject')],[nav('⬅️ Book Review','book',p.product_id),...HOME]]}};
}

/** Short reason the full artwork is not production-ready (for /produce and the handoff). */
export function bookNotReadyText(p,plan){
  const missing=plan?.missing?.length?` (missing ${ranges(plan.missing)})`:'';
  return compose(`${STATUS.warn} Product ${pid(p)}: full artwork not approved yet`,
    `A colouring book needs every page generated, checked and approved before production. Full artwork: ${plan?`${plan.available}/${plan.total} available${missing}`:'not started'}.`,
    'The approved style proofs are reused where they genuinely match their pages.');
}
export { L };
