// Shared fixture: a real colouring book taken through Stage 1 (full book),
// Stage 2 (production) and optionally Stage 3, with a fake OpenAI client and
// fake Telegram. No network. Used by the Stage 3 and Stage 4 colouring tests.
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ProductStore, Registry } from '../src/orchestrator/store.mjs';
import { Workflow } from '../src/orchestrator/workflow.mjs';
import { menuData } from '../src/telegram/ui.mjs';
import { OpenAIError } from '../src/openai/client.mjs';
import { fakeTelegram, msg, press, button, concept, bookDirection, CHAT, USER } from './helpers.mjs';
import { sharp } from '../../production/src/lib.mjs';

export const N=10;
export const sha=b=>createHash('sha256').update(b).digest('hex');

/** Distinct black line art on white, 1024x1536 like the real image model. */
export async function lineArt(seed){
  let s=seed*7919+17;const r=()=>{s=(s*9301+49297)%233280;return s/233280;};
  const shapes=Array.from({length:14},(_,i)=>{const cx=180+r()*664, cy=220+r()*1096, rr=30+r()*110;
    return i%2?`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rr.toFixed(1)}" fill="none" stroke="#111" stroke-width="6"/>`
      :`<rect x="${(cx-rr).toFixed(1)}" y="${(cy-rr).toFixed(1)}" width="${(rr*1.6).toFixed(1)}" height="${(rr*1.2).toFixed(1)}" fill="none" stroke="#111" stroke-width="5"/>`;});
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536"><rect width="100%" height="100%" fill="#ffffff"/><rect x="70" y="70" width="884" height="1396" fill="none" stroke="#111" stroke-width="8"/>${shapes.join('')}</svg>`)).png().toBuffer();
}
export const bookConcept=id=>concept(id,{proposed_name:`Winter Windows ${id}`,product_type:'Christmas colouring book',product_format:'colouring-book',page_count:N,orientation:'portrait'});
export const bookSpec=()=>({name:'Winter Windows Colouring Book',slug:'winter-windows-colouring-book',season:'Christmas',product_type:'Christmas colouring book',target_customer:'adults',page_count:N,
  canvas:{orientation:'portrait',background:'white',edge:'safe-margin',format_notes:'A window frame inset from the edges.'},
  pages:Array.from({length:N},(_,i)=>({page_number:i+1,page_type:i?'colouring':'cover',title:i?`Window ${i+1}`:'Winter Windows',concept:`scene ${i+1}`,instructions:null,
    artwork_description:`A detailed window scene number ${i+1}.`,generation_prompt:i?`Window scene ${i+1} with snow.`:'Cover with exact title text “Winter Windows”.',production_notes:i?'Keep open shapes.':'Verify the title.'}))});
export const LISTING=()=>({title:'Christmas Colouring Pages for Adults, Printable Winter Window Scenes, 10 Pages',
  description:'Settle in with a warm drink and a cosy winter scene to colour.\n\nWhat you receive:\n- 10 pages (a cover and 9 colouring pages)\n- A4 and US Letter PDFs\n- Every page as a PNG\n- Printing guide\n\nThis is a digital download. No physical item is shipped.',
  tag_candidates:['christmas colouring','adult colouring book','winter colouring','printable colouring','xmas coloring pages','colouring pages','window colouring','relaxing colouring','snowy scenes','festive colouring','cosy winter','instant download','seasonal colouring','holiday colouring'],
  materials:['Digital PDF','PNG files'],suggested_price_gbp:4.5,pricing_rationale:'Typical for 10-page printable colouring books.',category_suggestion:'Craft Supplies & Tools > Colouring',occasion:'Christmas',primary_colour:'Red',secondary_colour:'Green',
  hook:'Ten calm winter pages',customer_summary:'Ten printable winter window colouring pages.',what_you_receive:['10 pages','A4 and US Letter PDFs','PNG pages','Printing guide'],printing_summary:'Print at 100% on your paper size.',
  digital_download_disclaimer:'Digital download only. No physical item is shipped.',listing_claims:[{key:'page-count',text:'10 pages'},{key:'digital',text:'Digital download'}]});
/** Echo the tone-line and scene ids the model was given (as a well-behaved model would). */
export const COPY=user=>{const ids=section=>[...((user.split(`${section} `)[1]??'').split('\n\n')[0]).matchAll(/^- ([\w-]+):/gm)].map(m=>m[1]);
  return {lines:ids('LINES').map(id=>({id,text:'A calm winter hour with your favourite pencils.'})),scenes:ids('SCENES').map(id=>({id,brief:'Oak desk, pine sprigs at the edges, soft window light.'}))};};

/** Fake OpenAI: Stage 1 fixtures, line-art pages, Stage 3 copy, scenes and coloured examples (tinted real page). */
export function ai({failListingOnce=false,listing=null}={}){
  const calls=[];let listingFailed=false;
  const client={
    async json({schemaName,user,images}){
      calls.push({kind:'json',schemaName,user,images:images?.length??0});
      if(schemaName==='listing'&&failListingOnce&&!listingFailed){listingFailed=true;throw new OpenAIError('Model refused: test refusal',{retryable:false,code:'refusal'});}
      const data={concepts:{concepts:['A','B','C'].map(bookConcept)},specification:bookSpec(),'creative-direction':bookDirection(),listing:listing?listing(calls.filter(c=>c.schemaName==='listing').length):LISTING(),'marketing-copy':schemaName==='marketing-copy'?COPY(user):null}[schemaName];
      if(!data)throw new Error(`unexpected ${schemaName}`);
      return {data:structuredClone(data),usage:{input_tokens:5,output_tokens:5,total_tokens:10},model:'fake-text'};
    },
    async image({step,prompt,size}){
      calls.push({kind:'image',step,prompt,size});
      if(step==='marketing-scene')return {bytes:await sharp({create:{width:1024,height:1024,channels:3,background:'#5a3d28'}}).png().toBuffer(),usage:{total_tokens:1},model:'fake-image'};
      return {bytes:await lineArt(calls.filter(c=>c.kind==='image').length),usage:{total_tokens:1},model:'fake-image'};
    },
    async imageEdit({step,prompt,image,size}){
      calls.push({kind:'imageEdit',step,prompt,size,image_sha:sha(image.bytes)});
      const {width,height}=await sharp(image.bytes).metadata();
      const tint=await sharp({create:{width,height,channels:3,background:'#e8a15c'}}).png().toBuffer();
      return {bytes:await sharp(image.bytes).composite([{input:tint,blend:'multiply'}]).png().toBuffer(),usage:{total_tokens:1},model:'fake-image'};
    }};
  return {ai:{client,textModel:'fake-text',imageModel:'gpt-image-test',imageQuality:'medium',previewQuality:'low'},calls};
}
export async function harness(opts={}){
  const root=await mkdtemp(join(tmpdir(),'lx-s3cb-'));
  const store=new ProductStore({productsDir:join(root,'products')}), registry=new Registry({stateDir:join(root,'state')});
  const telegram=fakeTelegram(), {ai:a,calls}=ai(opts);
  const wf=new Workflow({store,registry,telegram,ai:a,auth:(c,u)=>String(c)===String(CHAT)&&String(u)===String(USER),log:()=>{},...(opts.stage4?{stage4:opts.stage4}:{})});
  return {root,store,telegram,calls,wf,cleanup:()=>rm(root,{recursive:true,force:true})};
}
export const lastScreen=h=>h.telegram.sent.filter(s=>(s.type==='message'||s.type==='edited')&&s.replyMarkup).at(-1);
export const labels=h=>lastScreen(h).replyMarkup.inline_keyboard.flat().map(b=>b.text);
export const tap=(h,label)=>{const b=lastScreen(h).replyMarkup.inline_keyboard.flat().find(x=>x.text===label);if(!b)throw new Error(`no "${label}" in ${labels(h).join(' | ')}`);return h.wf.handleUpdate(press(b.callback_data));};
export async function snapshot(dir){const out={};const walk=async(d,rel='')=>{for(const e of await readdir(d,{withFileTypes:true})){const r=rel?`${rel}/${e.name}`:e.name;
  if(e.isDirectory())await walk(join(d,e.name),r);else out[r]=sha(await readFile(join(d,e.name)));}};await walk(dir);return out;}

/** Real Stage 1 (style, full book, APPROVE FULL BOOK) and Stage 2 (build, APPROVE PRODUCTION). */
export async function productionApproved(opts){
  const h=await harness(opts);
  await h.wf.handleUpdate(msg('/newproduct christmas colouring book'));await h.wf.handleUpdate(msg('/go'));
  await h.wf.handleUpdate(press(button(h.telegram,'A')));
  assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE STYLE')))).outcome,'creative_approved');
  await h.wf.handleUpdate(press(menuData('prod','001')));
  await tap(h,labels(h).find(l=>/^🎨 Generate|^📖 Check/.test(l)));await tap(h,labels(h)[0]);
  await h.wf.handleUpdate(press(menuData('book','001')));
  assert.equal((await tap(h,'✅ Approve Full Book')).outcome,'book_approved');
  assert.equal((await h.wf.handleUpdate(msg('/produce 001'))).outcome,'awaiting_production_approval');
  assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE PRODUCTION')))).outcome,'production_approved');
  const p=await h.store.load('001');
  return {h,ws:h.store.dirOf(p)};
}

