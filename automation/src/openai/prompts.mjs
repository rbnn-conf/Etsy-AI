import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { automationRoot } from '../config.mjs';
import { loadSchema, strictSchema, validate } from '../orchestrator/schema.mjs';
import { InvalidModelOutputError } from './client.mjs';

export const loadPrompt=name=>readFile(join(automationRoot,'prompts',`${name}.md`),'utf8');
export function render(template,vars){
  return template.replace(/\{\{(\w+)\}\}/g,(_,k)=>{if(!(k in vars))throw new Error(`Prompt variable ${k} missing`);return String(vars[k]);});
}
export function withoutProps(schema,omit){
  return {...schema,required:(schema.required??[]).filter(k=>!omit.includes(k)),
    properties:Object.fromEntries(Object.entries(schema.properties).filter(([k])=>!omit.includes(k)))};
}
/**
 * Call the model with a strict schema, then re-validate locally with full rules.
 * `normalize(data)` (optional) is a deterministic, lossless step run between
 * parsing and validation; it returns {data, changes}. Validation always runs
 * after it, on its result, and decides.
 * `modelSchema(full)` (optional) adjusts only what the MODEL is told (e.g. a
 * per-request exact item count, stated in the description by strictSchema);
 * local validation always uses the committed schema.
 */
export async function structured(ai,{step,prompt,user,images,schemaName,omit=[],normalize=null,modelSchema=null}){
  const full=await loadSchema(schemaName);
  const local=withoutProps(full,omit);
  const r=await ai.client.json({step,model:ai.textModel,system:await loadPrompt(prompt),user,images,
    schemaName:schemaName.replace(/[^a-zA-Z0-9_-]/g,'_'),schema:strictSchema(modelSchema?modelSchema(full):full,omit)});
  if(normalize){const n=normalize(r.data);r.data=n.data;if(n.changes.length)r.normalized=n.changes;}
  const errors=validate(local,r.data);
  if(errors.length)throw new InvalidModelOutputError(`${step}: model output rejected: ${errors.slice(0,3).join('; ')}`);
  return r;
}
