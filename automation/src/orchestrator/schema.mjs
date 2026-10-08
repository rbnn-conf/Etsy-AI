// Minimal JSON Schema (draft 2020-12 subset) validator — enough for the
// Stage 1 schemas without adding a dependency. Unsupported keywords are
// rejected at load time so a schema can never silently validate less than
// it claims.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { automationRoot } from '../config.mjs';

const KNOWN=new Set(['$schema','$id','title','description','type','enum','const','required','properties',
  'additionalProperties','items','minItems','maxItems','minLength','maxLength','pattern','minimum','maximum','format']);

function checkKeywords(schema,path='#'){
  if(typeof schema!=='object'||schema===null)return;
  for(const k of Object.keys(schema))if(!KNOWN.has(k))throw new Error(`Unsupported schema keyword ${k} at ${path}`);
  for(const [k,v] of Object.entries(schema.properties??{}))checkKeywords(v,`${path}/properties/${k}`);
  if(typeof schema.items==='object')checkKeywords(schema.items,`${path}/items`);
  if(typeof schema.additionalProperties==='object')checkKeywords(schema.additionalProperties,`${path}/additionalProperties`);
}
const typeOf=v=>v===null?'null':Array.isArray(v)?'array':Number.isInteger(v)?'integer':typeof v;
const typeOk=(t,v)=>{const a=typeOf(v);return t===a||(t==='number'&&a==='integer');};

export function validate(schema,value,path='$'){
  const errors=[];
  const walk=(s,v,p)=>{
    if(s.type){const types=[].concat(s.type);if(!types.some(t=>typeOk(t,v))){errors.push(`${p}: expected ${types.join('|')}, got ${typeOf(v)}`);return;}}
    if(s.enum&&!s.enum.some(e=>e===v))errors.push(`${p}: must be one of ${s.enum.join(', ')}`);
    if('const' in s&&s.const!==v)errors.push(`${p}: must equal ${JSON.stringify(s.const)}`);
    if(typeof v==='string'){
      if(s.minLength!==undefined&&v.length<s.minLength)errors.push(`${p}: shorter than ${s.minLength}`);
      if(s.maxLength!==undefined&&v.length>s.maxLength)errors.push(`${p}: longer than ${s.maxLength}`);
      if(s.pattern&&!new RegExp(s.pattern).test(v))errors.push(`${p}: does not match ${s.pattern}`);
      if(s.format==='date-time'&&Number.isNaN(Date.parse(v)))errors.push(`${p}: not a date-time`);
    }
    if(typeof v==='number'){
      if(s.minimum!==undefined&&v<s.minimum)errors.push(`${p}: below ${s.minimum}`);
      if(s.maximum!==undefined&&v>s.maximum)errors.push(`${p}: above ${s.maximum}`);
    }
    if(Array.isArray(v)){
      if(s.minItems!==undefined&&v.length<s.minItems)errors.push(`${p}: fewer than ${s.minItems} items`);
      if(s.maxItems!==undefined&&v.length>s.maxItems)errors.push(`${p}: more than ${s.maxItems} items`);
      if(s.items)v.forEach((x,i)=>walk(s.items,x,`${p}[${i}]`));
    }
    if(typeOf(v)==='object'){
      for(const r of s.required??[])if(!(r in v))errors.push(`${p}: missing ${r}`);
      for(const [k,x] of Object.entries(v)){
        if(s.properties?.[k])walk(s.properties[k],x,`${p}.${k}`);
        else if(s.additionalProperties===false)errors.push(`${p}: unexpected property ${k}`);
        else if(typeof s.additionalProperties==='object')walk(s.additionalProperties,x,`${p}.${k}`);
      }
    }
  };
  walk(schema,value,path);
  return errors;
}

export const schemaPath=name=>join(automationRoot,'schemas',`${name}.schema.json`);
// Loaded once per process: a running bot keeps the schemas it started with,
// so it must be restarted after a schema change (see validationDiagnostic).
const cache=new Map();
export async function loadSchema(name){
  if(!cache.has(name)){
    const s=JSON.parse(await readFile(schemaPath(name),'utf8'));
    checkKeywords(s);cache.set(name,s);
  }
  return cache.get(name);
}

export class SchemaError extends Error{
  constructor(label,errors){super(`${label} failed validation: ${errors.slice(0,5).join('; ')}${errors.length>5?` (+${errors.length-5} more)`:''}`);this.name='SchemaError';this.errors=errors;}
}
export function assertValid(schema,value,label){
  const errors=validate(schema,value);
  if(errors.length)throw new SchemaError(label,errors);
  return value;
}

/**
 * The limits strictSchema() strips, as plain sentences for the model. Every
 * range keyword validate() enforces must appear here, so the model is told
 * the same limit the validator applies (a test walks every schema to check).
 */
export function limitText(s){
  const t=[], n=(k,one,many)=>`${k} ${k===1?one:many}`;
  if(s.minLength!==undefined&&s.minLength>1)t.push(`At least ${n(s.minLength,'character','characters')}.`);
  if(s.maxLength!==undefined)t.push(`Maximum ${n(s.maxLength,'character','characters')}.`);
  if(s.pattern!==undefined)t.push(`Must match the regular expression ${s.pattern}.`);
  if(s.minimum!==undefined)t.push(`Minimum value ${s.minimum}.`);
  if(s.maximum!==undefined)t.push(`Maximum value ${s.maximum}.`);
  if(s.minItems!==undefined&&s.minItems===s.maxItems)t.push(`Exactly ${n(s.minItems,'item','items')}.`);
  else{
    if(s.minItems!==undefined&&s.minItems>0)t.push(`At least ${n(s.minItems,'item','items')}.`);
    if(s.maxItems!==undefined)t.push(`Maximum ${n(s.maxItems,'item','items')}; more is rejected.`);
  }
  return t.join(' ');
}

/**
 * Model-facing schema for OpenAI structured outputs (strict mode): every
 * property required, no additional properties, and range keywords removed
 * (strict mode does not accept them all; validate() enforces them locally).
 * Each stripped limit (length, item count, numeric bound, pattern) is written
 * into the property's description instead by limitText(), so the model sees
 * the same limit the validator enforces.
 * `omit` drops top-level properties the code — not the model — owns.
 */
export function strictSchema(schema,omit=[]){
  const conv=s=>{
    const out={};
    if(s.type)out.type=s.type;
    const limit=limitText(s);
    if(s.description||limit)out.description=[s.description,limit].filter(Boolean).join(' ');
    if(s.enum)out.enum=s.enum;
    if(s.type==='object'||s.properties){
      out.type='object';
      out.properties=Object.fromEntries(Object.entries(s.properties??{}).map(([k,v])=>[k,conv(v)]));
      out.required=Object.keys(out.properties);
      out.additionalProperties=false;
    }
    if(s.items)out.items=conv(s.items);
    return out;
  };
  const top={...schema,properties:Object.fromEntries(Object.entries(schema.properties).filter(([k])=>!omit.includes(k)))};
  return conv(top);
}

/**
 * Every bound in a schema, read from the schema itself (never hardcoded):
 * [{path, kind: 'length'|'items', max, min, arrayItem}] with paths like
 * "abbreviations[].meaning". Used to tell the model the exact limits.
 */
export function fieldLimits(schema){
  const out=[];
  const walk=(s,path,arrayItem)=>{
    if(!s||typeof s!=='object')return;
    if(s.maxLength!==undefined)out.push({path,kind:'length',max:s.maxLength,min:s.minLength??0,arrayItem});
    if(s.maxItems!==undefined)out.push({path,kind:'items',max:s.maxItems,min:s.minItems??0,arrayItem});
    for(const [k,v] of Object.entries(s.properties??{}))walk(v,path?`${path}.${k}`:k,arrayItem);
    if(s.items)walk(s.items,`${path}[]`,true);
  };
  walk(schema,'',false);
  return out;
}
