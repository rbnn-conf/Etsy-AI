// Cost accounting: every OpenAI attempt is recorded, including calls that
// fail at the API and calls whose output is later rejected by local
// validation (they are still billed). The workflow drains the records into
// product.json api_usage. Nothing secret is stored: errors are shortened and
// key-shaped text (including OpenAI's masked "sk-proj***…" echoes) is redacted.
const KEYISH=[/(Incorrect API key provided:)\s*\S+/gi,/\S*sk-[A-Za-z0-9_*.-]{6,}\S*/g,/\bBearer\s+\S+/gi];
export const sanitizeError=m=>KEYISH.reduce((s,re)=>s.replace(re,x=>re.source.startsWith('(Incorrect')?'Incorrect API key provided: [REDACTED]':'[REDACTED]'),String(m??'')).slice(0,200);

export function meteredClient(client,{now=()=>new Date()}={}){
  let pending=[];
  const wrap=(kind,method)=>async(args={})=>{
    const rec={step:args.step??kind,model:args.model??'unknown',kind,usage:null,at:now().toISOString(),outcome:'ok',error:null,
      // For the cost ledger only (the workflow strips it before product.json): what was requested, never the prompt.
      request:kind==='image'?{images:1,size:args.size??null,quality:args.quality??null,...(method==='imageEdit'?{input_images:1}:{})}:{vision_inputs:args.images?.length??0}};
    try{
      const r=await client[method](args);
      rec.model=r?.model??rec.model;rec.usage=r?.usage??null;pending.push(rec);
      return r;
    }catch(e){
      rec.outcome='api_error';rec.error=sanitizeError(`${e?.name??'Error'}: ${e?.message??e}`);pending.push(rec);
      throw e;
    }
  };
  return {
    client:{json:wrap('text','json'),image:wrap('image','image'),imageEdit:wrap('image','imageEdit')},
    /** Records since the last drain (then cleared). */
    drain(){const out=pending;pending=[];return out;},
    /** The last successful call's output failed local validation: still billed, marked as rejected. */
    markLastRejected(reason){const last=pending.at(-1);if(last?.outcome==='ok'){last.outcome='rejected';last.error=sanitizeError(reason);}}
  };
}
