import { loadPrompt, render } from './prompts.mjs';
import { canvasPrompt } from '../orchestrator/canvas.mjs';
import { VARIATIONS } from '../orchestrator/proofs.mjs';
import { isCrochetFormat, crochetImageDirection, crochetImageAvoid } from '../../../marketing/src/stage3/index.mjs';
const NA=/^\s*(not applicable|n\/a|none)\s*\.?$/i;
/** product_format of the selected concept (undefined for concepts made before formats existed). */
export function productFormat(p){
  const s=p.concepts?.selected;
  return s?p.concepts.batches.find(b=>b.batch===s.batch)?.concepts.find(c=>c.concept_id===s.concept_id)?.product_format:undefined;
}
/** Deterministic prompt: shared visual system + this page's spec + canvas + avoid list. */
export async function buildImagePrompt({direction,product,page,role=null}){
  if(!product.canvas)throw new Error(`Product #${product.product_id} has no canvas; regenerate its specification`);
  // Fields such as character_language may be "not applicable" (e.g. a typographic card): leave them out.
  const style=['illustration_style','line_weight','line_quality','detail_level','character_language','background_density',
    'composition','palette','colour_mode','shading','texture','mood'].filter(k=>direction[k]&&!NA.test(direction[k]))
    .map(k=>`${k.replace(/_/g,' ')}: ${direction[k]}`).join('; ');
  // Crochet only: the authoritative two-layer direction (marketing/src/stage3/crochet-visual-direction.mjs) follows the page brief.
  const crochet=isCrochetFormat(productFormat(product));
  return render(await loadPrompt('artwork-generation'),{shared_prompt:direction.shared_prompt,style_summary:style,
    // Before patterns: a concept/style proof; after Restyle: the traceable, pattern-derived product visual (ADR-047).
    subject:`PAGE ${page.page_number} of "${product.name}" (${page.page_type}): ${page.generation_prompt}${crochet?`\n\n${crochetImageDirection({stage:product.restyles?.length?'traceable':'style'})}`:''}`,
    variation:VARIATIONS[role]?`\n\n${VARIATIONS[role]}`:'',
    canvas:canvasPrompt(product.canvas,productFormat(product)),avoid:(crochet?crochetImageAvoid(direction.avoid).avoid:direction.avoid).join('; ')}).trim();
}
export async function generateProofImage(ai,{prompt,size}){
  return ai.client.image({step:'proof-image',model:ai.imageModel,prompt,size,quality:ai.imageQuality});
}
/** Concept previews: same model, cheaper quality (ai.previewQuality). */
export async function generatePreviewImage(ai,{prompt,size}){
  return ai.client.image({step:'concept-preview',model:ai.imageModel,prompt,size,quality:ai.previewQuality});
}
