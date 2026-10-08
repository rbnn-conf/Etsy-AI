import { structured } from './prompts.mjs';
import { InvalidModelOutputError } from './client.mjs';
import { pageCountProblems } from '../orchestrator/page-rules.mjs';
import { canvasProblems, specificationSchemaFor, normaliseCanvas } from '../orchestrator/canvas.mjs';
import { isCrochetFormat, crochetDirectionBrief } from '../../../marketing/src/stage3/index.mjs';
export async function generateSpecification(ai,{requestText,concept,direction}){
  const user=[`Owner's product request: ${JSON.stringify(requestText)}`,
    `Selected concept:\n${JSON.stringify(concept,null,2)}`,
    `Creative direction (follow exactly):\n${JSON.stringify(direction,null,2)}`,
    isCrochetFormat(concept.product_format)?crochetDirectionBrief():'',
    `Write the full specification with exactly ${concept.page_count} pages.`].filter(Boolean).join('\n\n');
  const r=await structured(ai,{step:'specification',prompt:'product-specification',user,schemaName:'specification',
    // The format's canvas invariants are part of the contract, not a model choice (ADR-061).
    modelSchema:full=>specificationSchemaFor(full,concept.product_format,concept.orientation),
    normalize:d=>normaliseCanvas(concept.product_format,d)});
  const s=r.data;
  if(s.page_count!==s.pages.length)throw new InvalidModelOutputError(`specification: page_count ${s.page_count} but ${s.pages.length} pages`);
  s.pages.forEach((p,i)=>{if(p.page_number!==i+1)throw new InvalidModelOutputError(`specification: page ${i+1} is numbered ${p.page_number}`);});
  // The concept's format still governs: the spec cannot turn a card into a book, or a book into a card.
  const errors=[...pageCountProblems({product_format:concept.product_format,product_type:s.product_type,name:s.name,page_count:s.page_count}),
    ...canvasProblems(concept.product_format,s.canvas),
    // The owner chose this concept from a preview in this orientation.
    ...(concept.orientation&&s.canvas.orientation!==concept.orientation?[`$.canvas.orientation: ${s.canvas.orientation} but the chosen concept preview is ${concept.orientation}`]:[])];
  if(errors.length)throw new InvalidModelOutputError(`specification: model output rejected: ${errors.slice(0,3).join('; ')}`);
  return r;
}
