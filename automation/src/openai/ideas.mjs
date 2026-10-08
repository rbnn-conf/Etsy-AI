import { structured } from './prompts.mjs';
import { InvalidModelOutputError } from './client.mjs';
import { pageCountProblems } from '../orchestrator/page-rules.mjs';
import { diversityProblems, STYLE_FIELDS } from '../orchestrator/diversity.mjs';
export async function generateConcepts(ai,{requestText,direction=null,catalogue=[],previousConcepts=[]}){
  // Only the shared STYLE goes to ideation; each concept invents its own content.
  const style=direction&&Object.fromEntries([...STYLE_FIELDS,'age_suitability','avoid'].filter(k=>k in direction).map(k=>[k,direction[k]]));
  const user=['TASK: ideas',`Owner's product request: ${JSON.stringify(requestText)}`,
    style?`Shared visual STYLE to design all three routes in (style only: do not reuse any subject, object, pose or scene it mentions unless the owner's request requires it):\n${JSON.stringify(style,null,2)}`:'No visual direction yet; propose a fitting one per concept.',
    `Existing LumiumX catalogue (avoid near-duplicates): ${catalogue.length?catalogue.map(c=>`#${c.id} ${c.title}`).join('; '):'none listed'}`,
    previousConcepts.length?`Previously proposed concepts (propose clearly different visual routes):\n${previousConcepts.map(c=>`- ${c.proposed_name}: ${c.short_description}`).join('\n')}`:''
  ].filter(Boolean).join('\n\n');
  const r=await structured(ai,{step:'ideas',prompt:'creative-director',user,schemaName:'concepts'});
  if(r.data.concepts.map(c=>c.concept_id).join('')!=='ABC')throw new InvalidModelOutputError('ideas: concepts must be exactly A, B, C in order');
  const errors=r.data.concepts.flatMap((c,i)=>pageCountProblems({...c,name:c.proposed_name},`$.concepts[${i}]`));
  if(errors.length)throw new InvalidModelOutputError(`ideas: model output rejected: ${errors.slice(0,3).join('; ')}`);
  // Gate 1 is only useful if A/B/C are genuinely different: checked BEFORE any preview image is paid for.
  const same=diversityProblems(r.data.concepts,requestText);
  if(same.length)throw new InvalidModelOutputError(`ideas: concepts are not visually distinct: ${same.join('; ')}`);
  return r;
}
