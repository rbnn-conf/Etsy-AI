import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { repoRoot } from '../src/config.mjs';
import { OpenAIClient, OpenAIError, InvalidModelOutputError } from '../src/openai/client.mjs';
import { PNG } from './helpers.mjs';

async function walk(dir,out=[]){
  for(const e of await readdir(dir,{withFileTypes:true}).catch(()=>[])){
    if(['node_modules','output','qc','previews','.git','state'].includes(e.name))continue;
    const p=join(dir,e.name);
    if(e.isDirectory())await walk(p,out);else if(/\.(m?js|ts|cjs)$/.test(e.name))out.push(p);
  }
  return out;
}

test('production code never imports automation/ (ADR-013 pipeline stays LLM-free)',async()=>{
  const hits=[];
  for(const area of ['services/src','products','marketing/src','spreadsheet/src','production/src']){
    for(const f of await walk(join(repoRoot,area))){
      const text=await readFile(f,'utf8');
      if(/from\s+['"][^'"]*automation\//.test(text)||/import\(\s*['"][^'"]*automation\//.test(text))hits.push(f);
    }
  }
  assert.deepEqual(hits,[]);
});

test('automation reaches Etsy only through Stage 4 (one adapter, loaded only by bot.mjs); never product build/marketing scripts',async()=>{
  const src=join(repoRoot,'automation','src'), rel=f=>f.slice(src.length+1).split(/[\\/]/).join('/');
  for(const f of await walk(src)){
    const text=await readFile(f,'utf8'), r=rel(f);
    const specs=[...text.matchAll(/(?:from\s+|import\(\s*)['"]([^'"]+)['"]/g)].map(m=>m[1]);
    // The Etsy HTTP client (services/src/etsy) is imported by exactly one module.
    for(const s of specs.filter(s=>/services\/src\/etsy/.test(s)))assert.equal(r,'stage4/etsy-live.mjs',`${r} imports the Etsy client (${s})`);
    // ...and only bot.mjs loads that module.
    if(specs.some(s=>/etsy-live/.test(s)))assert.equal(r,'bot.mjs',`${r} loads the live Etsy adapter`);
    assert.ok(!/api\.etsy\.com|openapi\.etsy/i.test(text),`${r} names the Etsy API host`);
    // Stage 1-3 modules never touch Etsy at all.
    if(!r.startsWith('stage4/')&&!['bot.mjs','orchestrator/workflow.mjs','config.mjs','telegram/approvals.mjs','telegram/commands.mjs'].includes(r))
      assert.ok(!/etsy/i.test(specs.join(' ')),`${r} imports Etsy code`);
    assert.ok(!/products\/\d{3}-[^'"]*\/src\/(build|marketing)/.test(text),`${f} references a product build/marketing script`);
    for(const m of text.matchAll(/from\s+['"]([^'"]*marketing\/src[^'"]*)['"]/g))assert.equal(m[1],'../../../marketing/src/stage3/index.mjs',`${f}: only the Stage 3 core`);
  }
});

function fakeFetch(respond){const calls=[];const f=async(url,init)=>{calls.push({url,init,body:init.body?JSON.parse(init.body):null});return respond(url,init);};f.calls=calls;return f;}
const json=(status,obj)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json'}});

test('OpenAI client: strict json_schema request, vision input, parsed output',async()=>{
  const f=fakeFetch(()=>json(200,{status:'completed',model:'m-1',usage:{total_tokens:3},output:[{type:'message',content:[{type:'output_text',text:'{"a":1}'}]}]}));
  const c=new OpenAIClient({apiKey:'sk-test-key-123456',fetchImpl:f});
  const r=await c.json({model:'m',system:'sys',user:'u',images:[{mime:'image/png',bytes:PNG}],schemaName:'x',schema:{type:'object'}});
  assert.deepEqual(r.data,{a:1});assert.equal(r.model,'m-1');
  const b=f.calls[0].body;
  assert.equal(f.calls[0].url,'https://api.openai.com/v1/responses');
  assert.equal(b.text.format.type,'json_schema');assert.equal(b.text.format.strict,true);
  assert.match(b.input[1].content[1].image_url,/^data:image\/png;base64,/);
  assert.equal(f.calls[0].init.headers.authorization,'Bearer sk-test-key-123456');
});

test('OpenAI client: errors are typed, retry-aware and never contain the key',async()=>{
  const key='sk-test-key-123456';
  const cases=[
    [()=>json(429,{error:{message:'Rate limit'}}),e=>e instanceof OpenAIError&&e.retryable&&e.status===429],
    [()=>json(400,{error:{message:'Bad model'}}),e=>e instanceof OpenAIError&&!e.retryable],
    [()=>{throw new TypeError('fetch failed');},e=>e instanceof OpenAIError&&e.retryable],
    [()=>json(200,{status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'no'}]}]}),e=>e.code==='refusal'&&!e.retryable],
    [()=>json(200,{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'not json'}]}]}),e=>e instanceof InvalidModelOutputError],
    [()=>json(200,{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[]}),e=>e instanceof InvalidModelOutputError]
  ];
  for(const [respond,check] of cases){
    const c=new OpenAIClient({apiKey:key,fetchImpl:fakeFetch(respond)});
    await assert.rejects(c.json({model:'m',system:'s',user:'u',schemaName:'x',schema:{}}),e=>{assert.ok(!String(e.message).includes(key));return check(e);});
  }
});

test('OpenAI client: image generation returns PNG bytes, rejects non-PNG',async()=>{
  const ok=new OpenAIClient({apiKey:'k',fetchImpl:fakeFetch(()=>json(200,{data:[{b64_json:PNG.toString('base64')}],usage:{total_tokens:9}}))});
  const r=await ok.image({model:'img',prompt:'p',size:'1024x1536',quality:'low'});
  assert.deepEqual(r.bytes,PNG);
  const bad=new OpenAIClient({apiKey:'k',fetchImpl:fakeFetch(()=>json(200,{data:[{b64_json:Buffer.from('nope').toString('base64')}]}))});
  await assert.rejects(bad.image({model:'img',prompt:'p',size:'1024x1536'}),InvalidModelOutputError);
});

test('OpenAI client: image edit posts the input image as multipart to /images/edits and returns PNG bytes',async()=>{
  const calls=[];
  const fetchImpl=async(url,init)=>{calls.push({url,init});return json(200,{data:[{b64_json:PNG.toString('base64')}],usage:{total_tokens:9}});};
  const c=new OpenAIClient({apiKey:'k',fetchImpl});
  const page=Buffer.from('page-bytes');
  const r=await c.imageEdit({model:'img',prompt:'colour it',image:{bytes:page,mime:'image/png',name:'page.png'},size:'1024x1536',quality:'medium'});
  assert.deepEqual(r.bytes,PNG);
  assert.match(calls[0].url,/\/images\/edits$/);
  const form=calls[0].init.body;
  assert.ok(form instanceof FormData);
  assert.equal(calls[0].init.headers['content-type'],undefined,'multipart boundary set by fetch');
  assert.deepEqual(['model','prompt','n','size','quality'].map(k=>form.get(k)),['img','colour it','1','1024x1536','medium']);
  assert.deepEqual(Buffer.from(await form.get('image').arrayBuffer()),page);
  const bad=new OpenAIClient({apiKey:'k',fetchImpl:async()=>json(200,{data:[{b64_json:Buffer.from('nope').toString('base64')}]})});
  await assert.rejects(bad.imageEdit({model:'img',prompt:'p',image:{bytes:page}}),InvalidModelOutputError);
});
