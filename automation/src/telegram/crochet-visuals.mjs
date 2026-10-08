// Telegram screens for the crochet VISUAL SET (ADR-063). Text and keyboards
// only (deterministic, never model-written); the workflow decides what is
// allowed. Every paid action is reached through its confirmation, which states
// the image count and the estimated cost.
import { encode } from './approvals.mjs';
import { nav, HOME, helpButton } from './ui.mjs';
import { visualsProgress, previewLabel } from '../orchestrator/crochet-visuals.mjs';
import { HERO_ASSET, PREVIEW_CAPTION } from '../../../production/src/index.mjs';

const act=(text,action,p)=>({text,callback_data:encode(action,p.product_id,p.review.nonce)});
const ask=(text,action,p)=>nav(text,'ask',p.product_id,action);
const plural=(n,one,many=`${one}s`)=>`${n} ${n===1?one:many}`;
export const patternName=(p,pid)=>p.crochet?.patterns?.find(e=>e.pattern_id===pid)?.name??pid;
const previews=p=>(p.crochet_visuals?.assets??[]).filter(a=>a.role==='pattern-preview');

/**
 * The paid confirmation. calls: plannedVisualCalls(); kind: 'vgen' | 'vrh' | 'vra' | 'vrp.NN'.
 * reopen: the product is PRODUCTION_APPROVED (its production approval is cleared first).
 */
export function visualsConfirmScreen(p,kind,{calls,estimate=null,reopen=false,label=null}){
  const title=kind==='vgen'?'Crochet Visual Set':kind==='vrh'?'Restyle Collection Hero':kind==='vra'?'Restyle All Crochet Visuals':`Restyle Preview ${label??''}`.trim();
  const lines=[`🎨 Product #${p.product_id} — ${title}`,''];
  if(calls.total){
    lines.push(kind==='vgen'?'Generate:':'Regenerate:');
    if(calls.hero)lines.push('• 1 collection hero');
    if(calls.previews)lines.push(`• ${plural(calls.previews,'pattern preview image')}`);
    lines.push('',`Total: ${plural(calls.total,'image generation')}`);
    if(!calls.fresh&&calls.reused)lines.push(`Kept, not regenerated: ${plural(calls.reused,'finished image')}.`);
    if(kind!=='vgen')lines.push('The replaced images are archived (kept), not deleted.');
    lines.push('Approved patterns and their fingerprints are not changed.','','⚠️ This will incur image API cost.');
    if(estimate)lines.push(estimate);
  }else lines.push('Every image is already made: this only re-runs the free QC and shows the review.','No image API cost.');
  if(reopen)lines.push('','Production approval will be cleared: rebuild the production files afterwards (no API cost).');
  const go=kind==='vgen'?(calls.total?'Generate Visuals':'Show Review'):'Regenerate';
  return {text:lines.join('\n'),keyboard:{inline_keyboard:[[act(go,kind,p)],[nav('Cancel','prod',p.product_id)]]}};
}

/** The review after generation: what code checked, what only the owner can check, and the provenance. */
export function visualsReviewText(p,{qc}){
  const pr=visualsProgress(p), v=p.crochet_visuals;
  const mark=a=>a.status==='generated'?'✅':a.status==='failed'?'❌':'⏳';
  const hero=v.assets.find(a=>a.id===HERO_ASSET);
  return [`🎨 #${p.product_id} — crochet visual set ready for review`,'',
    `${pr.done} of ${pr.total} images: 1 collection hero + ${plural(pr.previews,'pattern preview')}.`,'',
    `Collection hero ${mark(hero)}`,'','Pattern previews:',
    ...previews(p).map((a,i)=>`${previewLabel(i,patternName(p,a.pattern_id))} ${mark(a)}`),'',
    qc.passed?'✅ Visual QC passed: every image maps to an approved pattern and its fingerprint; one preview per pattern; files, resolution and crop fit the PDF slot.'
      :`❌ Visual QC failed (${plural(qc.problems.length,'problem')}):`,
    ...(qc.passed?[]:qc.problems.slice(0,6).map(x=>`• ${x}`)),...(qc.warnings?.length?[`⚠️ ${qc.warnings.slice(0,3).join('; ')}`]:[]),'',
    'Code cannot see what an image shows. Check each one for wrong or extra crochet items before approving.',
    `These are AI illustrations ("${PREVIEW_CAPTION}" in the PDF), never photographs of test-crocheted items. The patterns stay unverified unless test-crocheted.`,
    'Approving binds these exact files (SHA-256) for production.'].join('\n');
}
export function visualsReviewKeyboard(p,{qc}){
  return {inline_keyboard:[...(qc.passed?[[act('✅ Approve Visual Set','vapprove',p)]]:[]),
    [ask('🔁 Restyle Hero','vrh',p),nav('🔁 Restyle a Preview','vis',p.product_id,'p')],[ask('🔁 Restyle All Visuals','vra',p)],
    [ask('✖️ Stop (keep every image)','vstop',p)],[helpButton(p.product_id),...HOME]]};
}

/** Restyle menu (read-only navigation; every regeneration goes through its paid confirmation). mode '' | 'p' (preview list). */
export function visualsScreen(p,{mode=''}={}){
  const pr=visualsProgress(p);
  if(mode==='p')return {text:[`🔁 #${p.product_id} — restyle one pattern preview`,'','Only that image is regenerated (1 image generation). The pattern and its fingerprint are not changed.'].join('\n'),
    keyboard:{inline_keyboard:[...previews(p).map((a,i)=>[ask(`🔁 ${previewLabel(i,patternName(p,a.pattern_id))}`,`vrp${String(i+1).padStart(2,'0')}`,p)]),
      [nav('Back','vis',p.product_id),nav('📦 Product','prod',p.product_id)]]}};
  return {text:[`🎨 #${p.product_id} — crochet visual set`,'',pr?`${pr.done} of ${pr.total} images${p.crochet_visuals.approval?', approved':''}.`:'No visual set yet.','',
    'Restyle regenerates only the images you choose. Approved patterns and fingerprints never change.',
    ...(p.crochet_visuals?.approval?['Restyling clears the visual approval: review and approve the set again.']:[])].join('\n'),
    keyboard:{inline_keyboard:[[ask('🔁 Restyle Hero','vrh',p)],[nav('🔁 Restyle a Preview','vis',p.product_id,'p')],[ask('🔁 Restyle All Visuals','vra',p)],
      [nav('📦 Product','prod',p.product_id),...HOME]]}};
}

/** Why /produce refuses a crochet product whose visual set exists but is not approved. */
export const visualsNotApprovedText=p=>{const pr=visualsProgress(p);
  return [`❌ #${p.product_id} cannot enter production`,'Its crochet visual set is not approved.',pr?`${pr.done} of ${pr.total} images made.`:'',
    '','Finish the visual set and press ✅ Approve Visual Set first.'].filter(x=>x!==null).join('\n');};
