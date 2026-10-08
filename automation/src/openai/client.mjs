// Minimal OpenAI HTTP client (Responses API + Images API) using fetch.
// Scope: automation/ only (ADR-023). The production pipeline never imports this.
// Errors carry a safe message and a `retryable` flag; the API key is never
// included in any error or log line.

export class OpenAIError extends Error{
  constructor(message,{status=null,retryable=false,code=null}={}){
    super(message);this.name='OpenAIError';this.status=status;this.retryable=retryable;this.code=code;
  }
}
export class InvalidModelOutputError extends Error{
  constructor(message){super(message);this.name='InvalidModelOutputError';this.retryable=true;}
}

export class OpenAIClient{
  #key;#fetch;#base;
  constructor({apiKey,baseUrl='https://api.openai.com/v1',fetchImpl=fetch}){
    if(!apiKey)throw new OpenAIError('OPENAI_API_KEY is not configured.');
    this.#key=apiKey;this.#fetch=fetchImpl;this.#base=baseUrl.replace(/\/+$/,'');
  }
  async #post(path,body,timeoutMs){
    // FormData bodies (image edits) set their own multipart content type.
    const form=body instanceof FormData;
    let res;
    try{
      res=await this.#fetch(`${this.#base}${path}`,{method:'POST',
        headers:{authorization:`Bearer ${this.#key}`,...(form?{}:{'content-type':'application/json'})},
        body:form?body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});
    }catch(e){
      throw new OpenAIError(e?.name==='TimeoutError'?`OpenAI ${path} timed out after ${timeoutMs/1000}s`:`OpenAI ${path}: network failure`,{retryable:true});
    }
    const text=await res.text();
    let json;try{json=text?JSON.parse(text):null;}catch{json=null;}
    if(!res.ok){
      const msg=json?.error?.message??text.slice(0,200)??'no body';
      throw new OpenAIError(`OpenAI ${path} failed (HTTP ${res.status}): ${msg}`,
        {status:res.status,code:json?.error?.code??null,retryable:res.status===429||res.status>=500});
    }
    return json;
  }

  /**
   * Structured JSON via the Responses API (strict json_schema). `images` are
   * {mime, bytes} and are sent inline as data URLs for vision analysis.
   */
  async json({model,system,user,images=[],schemaName,schema,timeoutMs=180_000}){
    const content=[{type:'input_text',text:user},
      ...images.map(i=>({type:'input_image',image_url:`data:${i.mime};base64,${Buffer.from(i.bytes).toString('base64')}`}))];
    const body={model,input:[{role:'system',content:[{type:'input_text',text:system}]},{role:'user',content}],
      text:{format:{type:'json_schema',name:schemaName,schema,strict:true}}};
    const r=await this.#post('/responses',body,timeoutMs);
    if(r?.status&&r.status!=='completed')throw new InvalidModelOutputError(`Model response ${r.status}${r.incomplete_details?.reason?` (${r.incomplete_details.reason})`:''}`);
    const parts=(r?.output??[]).filter(o=>o.type==='message').flatMap(o=>o.content??[]);
    const refusal=parts.find(c=>c.type==='refusal');
    if(refusal)throw new OpenAIError(`Model refused: ${String(refusal.refusal).slice(0,200)}`,{retryable:false,code:'refusal'});
    const text=parts.filter(c=>c.type==='output_text').map(c=>c.text).join('');
    if(!text)throw new InvalidModelOutputError('Model returned no text output');
    let data;try{data=JSON.parse(text);}catch{throw new InvalidModelOutputError('Model output was not valid JSON');}
    return {data,usage:r.usage??null,model:r.model??model};
  }

  /** One image via the Images API. Returns PNG bytes. */
  async image({model,prompt,size,quality,timeoutMs=300_000}){
    const body={model,prompt,size,n:1};
    if(quality)body.quality=quality;
    return this.#png(await this.#post('/images/generations',body,timeoutMs),model);
  }

  /**
   * One image EDIT of an input image via the Images API (multipart). Used to
   * colour in a real approved page for a marketing example. Returns PNG bytes.
   * @param image {bytes, mime, name}
   */
  async imageEdit({model,prompt,image,size,quality,timeoutMs=300_000}){
    const form=new FormData();
    form.append('model',model);form.append('prompt',prompt);form.append('n','1');
    if(size)form.append('size',size);
    if(quality)form.append('quality',quality);
    form.append('image',new Blob([image.bytes],{type:image.mime??'image/png'}),image.name??'page.png');
    return this.#png(await this.#post('/images/edits',form,timeoutMs),model);
  }

  #png(r,model){
    const b64=r?.data?.[0]?.b64_json;
    if(!b64)throw new InvalidModelOutputError('Image API returned no image data');
    const bytes=Buffer.from(b64,'base64');
    if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new InvalidModelOutputError('Image API did not return a PNG');
    return {bytes,usage:r.usage??null,model,revisedPrompt:r.data[0].revised_prompt??null};
  }
}
