// OpenAI pricing (versioned configuration, never hard-coded in business logic)
// and the single cost calculator. Prices come from automation/config/
// openai-pricing.json; the GBP rate from that file or AUTOMATION_FX_USD_GBP.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { automationRoot } from '../config.mjs';

export const PRICING_FILE=join(automationRoot,'config','openai-pricing.json');

/** Load and validate a pricing table. Throws on a malformed file (never guesses). */
export function loadPricing({file=PRICING_FILE,env=process.env,table}={}){
  const p=table??JSON.parse(readFileSync(file,'utf8'));
  if(p.schema_version!==1||typeof p.version!=='string'||!p.version||p.currency!=='USD'||typeof p.models!=='object')throw new Error('Invalid OpenAI pricing table');
  const num=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
  for(const [m,def] of Object.entries(p.models)){
    if(def.unit!=='per_1m_tokens')throw new Error(`Pricing for ${m}: unsupported unit ${def.unit}`);
    for(const group of [def.text,def.image].filter(Boolean))for(const [k,v] of Object.entries(group))if(!num(v))throw new Error(`Pricing for ${m}.${k} is not a number`);
  }
  const envRate=env.AUTOMATION_FX_USD_GBP?.trim();
  const rate=envRate?Number(envRate):p.fx?.rate;
  const fx=num(rate)&&rate>0?{pair:'USD_GBP',rate,as_of:envRate?'env':p.fx?.as_of??null,source:envRate?'AUTOMATION_FX_USD_GBP':p.fx?.source??null}:null;
  return {...p,fx};
}

const n=v=>Number.isFinite(v)?v:0;
/** Usage quantities from an OpenAI response `usage` object, in one normalised shape. */
export function usageQuantities(kind,usage){
  if(!usage||typeof usage!=='object')return null;
  if(kind==='text'){
    const d=usage.input_tokens_details??{}, o=usage.output_tokens_details??{};
    return {input_tokens:n(usage.input_tokens),cached_input_tokens:n(d.cached_tokens),cache_write_tokens:n(d.cache_write_tokens),
      output_tokens:n(usage.output_tokens),reasoning_tokens:n(o.reasoning_tokens)};
  }
  const d=usage.input_tokens_details??{}, o=usage.output_tokens_details??{};
  const inText=d.text_tokens??(d.image_tokens===undefined?usage.input_tokens:undefined);
  return {text_input_tokens:n(inText),image_input_tokens:n(d.image_tokens),
    image_output_tokens:n(o.image_tokens??(o.text_tokens===undefined?usage.output_tokens:undefined)),text_output_tokens:n(o.text_tokens)};
}

/**
 * Price one metered OpenAI attempt. Returns {priced, source_cost, reason}.
 * Never invents a value: unknown model, missing usage or an unpriced usage
 * category gives priced=false with the reason.
 */
export function priceUsage({kind,model,usage},pricing){
  const q=usageQuantities(kind,usage);
  if(!q)return {priced:false,source_cost:null,quantities:null,reason:'no usage reported by the API'};
  const def=pricing.models[model];
  if(!def)return {priced:false,source_cost:null,quantities:q,reason:`no price configured for model "${model}"`};
  const per=1e6;
  if(kind==='text'){
    if(!def.text)return {priced:false,source_cost:null,quantities:q,reason:`no text prices for "${model}"`};
    const t=def.text, uncached=Math.max(0,q.input_tokens-q.cached_input_tokens-q.cache_write_tokens);
    if(q.cache_write_tokens&&t.cache_write===undefined)return {priced:false,source_cost:null,quantities:q,reason:'cache-write tokens have no configured price'};
    const cost=(uncached*t.input+q.cached_input_tokens*(t.cached_input??t.input)+q.cache_write_tokens*(t.cache_write??0)+q.output_tokens*t.output)/per;
    return {priced:true,source_cost:round(cost),quantities:q,reason:null};
  }
  if(!def.image)return {priced:false,source_cost:null,quantities:q,reason:`no image prices for "${model}"`};
  const i=def.image;
  if(q.text_output_tokens&&i.text_output===undefined)return {priced:false,source_cost:null,quantities:q,reason:'image text-output tokens have no configured price'};
  const cost=(q.text_input_tokens*i.text_input+q.image_input_tokens*i.image_input+q.image_output_tokens*i.image_output+q.text_output_tokens*(i.text_output??0))/per;
  return {priced:true,source_cost:round(cost),quantities:q,reason:null};
}
const round=v=>Math.round(v*1e8)/1e8;
export const toGbp=(usd,fx)=>usd===null||!fx?null:Math.round(usd*fx.rate*1e8)/1e8;
