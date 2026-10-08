import { structured } from './prompts.mjs';
export const REFERENCE_OMIT=['analysed_at','model','reference_files'];
/** references: [{file, mime, bytes}] */
export async function analyseReferences(ai,{requestText,references}){
  const user=[`Owner's product request: ${JSON.stringify(requestText)}`,
    `Reference files, in order: ${references.map(r=>r.file).join(', ')}`,
    'Analyse the general visual characteristics of these references.'].join('\n');
  const r=await structured(ai,{step:'reference-analysis',prompt:'reference-analysis',user,
    images:references.map(r=>({mime:r.mime,bytes:r.bytes})),schemaName:'reference-analysis',omit:REFERENCE_OMIT});
  const names=r.data.reference_summaries.map(s=>s.reference_file);
  for(const ref of references)if(!names.includes(ref.file))r.data.reference_summaries.push({reference_file:ref.file,summary:'(not individually summarised by the model)'});
  return r;
}
