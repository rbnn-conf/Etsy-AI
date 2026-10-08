import { structured } from './prompts.mjs';
import { isCrochetFormat, crochetDirectionBrief } from '../../../marketing/src/stage3/index.mjs';
export const DIRECTION_OMIT=['version','scope','source','based_on_references','feedback_applied','created_at'];
/** Create (or revise with owner feedback) the product's creative direction. */
export async function createDirection(ai,{requestText,analysis=null,concept=null,previous=null,feedback=null}){
  const user=['TASK: creative-direction',`Owner's product request: ${JSON.stringify(requestText)}`,
    analysis?`Reference analysis (general characteristics; do not copy the do_not_copy items):\n${JSON.stringify(analysis,null,2)}`:'No reference images were supplied.',
    concept?`Chosen concept:\n${JSON.stringify(concept,null,2)}`:'',
    isCrochetFormat(concept?.product_format)?crochetDirectionBrief():'',
    previous?`Previous creative direction (keep everything the feedback does not change):\n${JSON.stringify(Object.fromEntries(Object.entries(previous).filter(([k])=>!DIRECTION_OMIT.includes(k))),null,2)}`:'',
    feedback?`Owner feedback to apply: ${JSON.stringify(feedback)}`:''].filter(Boolean).join('\n\n');
  return structured(ai,{step:'creative-direction',prompt:'creative-director',user,schemaName:'creative-direction',omit:DIRECTION_OMIT});
}
