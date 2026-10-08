// Offline test harness: fake Telegram + fake OpenAI client. No network, no credits.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProductStore, Registry } from '../src/orchestrator/store.mjs';
import { Workflow } from '../src/orchestrator/workflow.mjs';
import { OwnerStatus } from '../src/orchestrator/owner-status.mjs';
import { OpenAIError } from '../src/openai/client.mjs';

export const CHAT=1111, USER=2222;
/**
 * A fixture crochet plan as a compliant model returns it (ADR-068): collection_type (arrangement when it lists
 * combinations, else independent, unless given) and role_plan counted from its DISTINCT patterns (an exact copy the
 * model repeated is not a planned slot).
 */
export function withRolePlan(plan,type=null){
  const seen=new Set(), unique=(plan.patterns??[]).filter(x=>{const k=JSON.stringify(x);if(seen.has(k))return false;seen.add(k);return true;});
  const role_plan=Object.fromEntries(['focal','secondary','filler','accent','foliage','structural'].map(r=>[r,unique.filter(x=>x.role===r).length]));
  return {...plan,collection_type:type??(plan.combinations?.items?.length?'arrangement':'independent'),role_plan};
}
export const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
export const JPEG=Buffer.from([0xff,0xd8,0xff,0xe0,0,16,74,70,73,70,0,1]);

const direction=()=>({illustration_style:'cozy simplified cartoon line art',line_weight:'bold',line_quality:'smooth, uniform',detail_level:'low-medium',
  character_language:'rounded friendly forms',background_density:'minimal',composition:'one clear focal subject',palette:'black line art on white',
  colour_mode:'black-and-white line art',shading:'none',texture:'none',mood:'cozy playful autumn',age_suitability:'ages 4-8',
  print_considerations:'no large black fills',shared_prompt:'Original cozy cartoon line art with bold smooth outlines, rounded friendly characters and minimal backgrounds.',
  avoid:['reference-specific characters','logos','copied text','photorealism']});
const BRIEFS={A:'a ghost waving from a pumpkin patch, centred, title across the top',B:'a black cat in a moonlit maze, low viewpoint, title bottom-left',C:'bats circling a haunted house on a hill, wide scene, title in a banner'};
// Three genuinely different visual routes (they pass the diversity gate).
export const ROUTES={
  A:{primary_subject:'friendly ghost',scene:'pumpkin patch',focal_object:'carved pumpkin',composition:'centred subject waving, title across the top',lighting:'bright autumn afternoon',
    palette_emphasis:'orange and cream',emotional_tone:'cheerful',typography_approach:'bold title across the top',distinguishing_visual_hook:'waving ghost'},
  B:{primary_subject:'black cat',scene:'moonlit hedge maze',focal_object:'twisting path',composition:'low viewpoint looking up the path, title bottom-left',lighting:'cool moonlight',
    palette_emphasis:'indigo and silver',emotional_tone:'curious',typography_approach:'small title bottom-left',distinguishing_visual_hook:'glowing cat eyes'},
  C:{primary_subject:'little bats',scene:'haunted house on a hill',focal_object:'crooked house',composition:'wide scene, house small on the horizon, title in a banner',lighting:'purple dusk',
    palette_emphasis:'violet and gold',emotional_tone:'spooky but cosy',typography_approach:'title in a ribbon banner',distinguishing_visual_hook:'bats circling the chimney'}};
export const concept=(id,extra={})=>({concept_id:id,proposed_name:`Concept ${id} Book`,tagline:`Tagline ${id}`,product_type:'activity book',product_format:'activity-book',target_customer:'parents of 4-8 year olds',page_count:12,orientation:'portrait',
  deliverable_components:['A4 PDF','US Letter PDF','printing guide'],short_description:`Idea ${id}.`,key_features:['mazes','colouring','counting'],visual_direction_summary:'bold friendly line art',preview_brief:BRIEFS[id]??`brief ${id}`,visual_route:ROUTES[id],...extra});
const types=['cover','colouring','maze','counting','colouring','matching','tracing','certificate'];
export const bookDirection=direction;
export const spec=(n=12)=>({name:'Cute Ghost Activity Book',slug:'cute-ghost-activity-book',season:'Halloween',product_type:'activity book',
  target_customer:'parents of 4-8 year olds',page_count:n,
  canvas:{orientation:'portrait',background:'white',edge:'safe-margin',format_notes:'Clean activity pages with room to colour.'},pages:Array.from({length:n},(_,i)=>({page_number:i+1,page_type:types[i%types.length],
  title:`Page ${i+1}`,concept:'c',instructions:i?'Colour the ghost.':null,artwork_description:'a ghost',generation_prompt:`page ${i+1} subject`,production_notes:'check'}))});
const analysis=()=>({reference_summaries:[{reference_file:'references/reference-01.png',summary:'bold cartoon'}],
  ...Object.fromEntries(['illustration_category','line_weight','line_smoothness','level_of_detail','shape_language','character_proportions','facial_simplicity','composition_density','whitespace','background_complexity','typography','orientation_layout','perspective','colour_behaviour','palette_characteristics','contrast','shading_approach','texture','emotional_tone','apparent_audience','printable_suitability'].map(k=>[k,`${k} value`])),
  do_not_copy:[{element:'the named mascot',reason:'identifiable character'}]});

/** Fake OpenAI client. `plan` can override responses or throw per step. */
export function fakeAi(plan={}){
  const calls=[];
  const client={
    async json({schemaName,images,user}){
      calls.push({kind:'json',schemaName,images:images?.length??0,user});
      const o=plan[schemaName];
      if(typeof o==='function'){const v=o(calls.filter(c=>c.schemaName===schemaName).length,{user});if(v instanceof Error)throw v;return {data:structuredClone(v),usage:{total_tokens:10},model:'fake-text'};}
      const data={'reference-analysis':analysis(),'creative-direction':direction(),concepts:{concepts:['A','B','C'].map(id=>concept(id))},specification:spec()}[schemaName];
      return {data:structuredClone(data),usage:{input_tokens:5,output_tokens:5,total_tokens:10},model:'fake-text'};
    },
    async image({prompt,size,quality}){
      calls.push({kind:'image',prompt,size,quality});
      const n=calls.filter(c=>c.kind==='image').length;
      if(plan.image){const v=plan.image(n);if(v instanceof Error)throw v;}
      return {bytes:PNG,usage:{total_tokens:100},model:'fake-image',revisedPrompt:null};
    }
  };
  return {ai:{client,textModel:'fake-text',imageModel:'gpt-image-test',imageQuality:'medium',previewQuality:'low'},calls};
}
export const apiFailure=()=>new OpenAIError('OpenAI /responses failed (HTTP 500): upstream error',{status:500,retryable:true});

export function fakeTelegram({files={}}={}){
  const sent=[];let mid=100;
  return {sent,
    async sendMessage(m){sent.push({type:'message',...m});return {messageId:++mid};},
    async sendPhoto(m){sent.push({type:'photo',...m});return {messageId:++mid};},
    async sendPhotoAlbum(chatId,items){sent.push({type:'album',chatId,items});},
    async sendDocument(m){sent.push({type:'document',...m});return {messageId:++mid};},
    async answerCallbackQuery(id,text){sent.push({type:'answer',id,text});},
    async editMessageReplyMarkup(chatId,messageId){sent.push({type:'edit',chatId,messageId});},
    async editMessageText(chatId,messageId,text,replyMarkup){sent.push({type:'edited',chatId,messageId,text,replyMarkup});},
    async setMyCommands(commands){sent.push({type:'commands',commands});},
    async getFile(fileId){if(!files[fileId])throw new Error('no such file');return {filePath:`photos/${fileId}.bin`};},
    async downloadFile(path){return files[path.slice(7,-4)];}
  };
}

/** status: OwnerStatus options (true = defaults) to run with the owner status layer on, as bot.mjs does. */
export async function harness({plan,files,maxConceptBatches=3,status=null}={}){
  const root=await mkdtemp(join(tmpdir(),'lumiumx-stage1-'));
  const store=new ProductStore({productsDir:join(root,'products')});
  const registry=new Registry({stateDir:join(root,'state')});
  const telegram=fakeTelegram({files});
  const {ai,calls}=fakeAi(plan);
  const logs=[];
  const ownerStatus=status?new OwnerStatus({telegram,stateDir:join(root,'state'),log:l=>logs.push(l),...(status===true?{}:status)}):null;
  const wf=new Workflow({store,registry,telegram,ai,calls,maxConceptBatches,auth:(c,u)=>String(c)===String(CHAT)&&String(u)===String(USER),log:l=>logs.push(l),ownerStatus});
  return {root,store,registry,telegram,ai,calls,wf,logs,ownerStatus,cleanup:()=>rm(root,{recursive:true,force:true})};
}

let uid=1;
export const msg=(text,extra={})=>({update_id:uid++,message:{message_id:uid,chat:{id:CHAT},from:{id:USER,username:'owner'},text,...extra}});
export const photo=(fileId,extra={})=>({update_id:uid++,message:{message_id:uid,chat:{id:CHAT},from:{id:USER,username:'owner'},photo:[{file_id:fileId+'s',file_unique_id:fileId+'u-small',width:90,height:90},{file_id:fileId,file_unique_id:fileId+'u',width:1000,height:1000}],...extra}});
export const press=(data,{chat=CHAT,user=USER}={})=>({update_id:uid++,callback_query:{id:`cq${uid}`,from:{id:user,username:'owner'},message:{message_id:500,chat:{id:chat}},data}});
export const lastKeyboard=t=>t.sent.filter(s=>s.type==='message'&&s.replyMarkup).at(-1).replyMarkup.inline_keyboard.flat();
export const button=(t,label)=>lastKeyboard(t).find(b=>b.text===label).callback_data;

export const previewCalls=calls=>calls.filter(c=>c.kind==='image'&&/^CONCEPT PREVIEW|\nCONCEPT PREVIEW/.test(c.prompt));
export const proofCalls=calls=>calls.filter(c=>c.kind==='image'&&!/CONCEPT PREVIEW/.test(c.prompt));

/**
 * Press the retry offered on the latest failure message. A step that may call
 * OpenAI goes through its confirmation screen first (two presses); a free step
 * retries directly. Returns the outcome of the retry itself.
 */
export async function pressRetry(h){
  const t=h.telegram, kb=lastKeyboard(t), direct=kb.find(b=>b.text==='🔄 Retry Safe Step'), paid=kb.find(b=>b.text==='🔄 Retry (API cost)');
  if(direct)return h.wf.handleUpdate(press(direct.callback_data));
  if(!paid)throw new Error('no retry offered: '+kb.map(b=>b.text).join(', '));
  await h.wf.handleUpdate(press(paid.callback_data));
  const screen=t.sent.filter(s=>(s.type==='message'||s.type==='edited')&&s.replyMarkup).at(-1);
  const confirm=screen.replyMarkup.inline_keyboard.flat().find(b=>b.text==='Confirm');
  return h.wf.handleUpdate(press(confirm.callback_data));
}
