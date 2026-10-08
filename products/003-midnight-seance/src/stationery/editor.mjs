import {renderStationery} from './document.mjs';
import {validateStationery} from './content.mjs';
import {probeDocument} from './preflight.mjs';
import {escapeText} from '../components/index.mjs';
const resources=window.STATIONERY_RESOURCES;
const state={id:'S01',theme:'full-colour',format:'native',values:structuredClone(resources.stationeryDefaults.S01)};
const form=document.getElementById('fields'),preview=document.getElementById('preview'),status=document.getElementById('status');
function customerIssue(issue){
  const label=key=>resources.stationerySchemas[state.id][key.trim()]?.label??'Wording';
  const art=/^Artwork overlaps wording: (.*?) \/ /.exec(issue);
  if(art)return `${label(art[1])} touches decoration`;
  const overlap=/^Text overlaps: (.*?) \/ (.*)/.exec(issue);
  if(overlap)return `${label(overlap[1])} overlaps ${label(overlap[2]).toLowerCase()}`;
  const text=/^Text (?:outside safe area|does not fit|is too small): (.*)/.exec(issue);
  if(text)return `${label(text[1])} needs more space for a readable print`;
  return issue.startsWith('Artwork')?'An illustration could not be prepared for a clear print. Reopen the original editor.':issue;
}
let revision=0,loadRevision=0,timer,ready=false;
function error(message){++revision;clearTimeout(timer);ready=false;document.getElementById('print').disabled=true;status.dataset.state='error';status.textContent=message;}
function fields(){
  form.innerHTML=Object.entries(resources.stationerySchemas[state.id]).map(([key,rule])=>`<label for="entry-${key}">${escapeText(rule.label)}</label><textarea id="entry-${key}" data-key="${key}" rows="${rule.maxLines?Math.min(rule.maxLines,6):key==='address'||key==='rsvp'?2:1}" aria-describedby="limit-${key}">${escapeText(state.values[key])}</textarea><small id="limit-${key}">Up to ${rule.max} characters${rule.required?' · required':' · optional'}${rule.maxEntry?` · ${rule.maxEntry} per line`:''}</small>`).join('');
  form.querySelectorAll('textarea').forEach(el=>el.addEventListener('input',()=>{state.values[el.dataset.key]=el.value;render();}));
}
function formats(){document.getElementById('format').innerHTML=resources.inventory.pages.find(p=>p.id===state.id).formats.map(f=>`<option value="${f}">${f==='native'?'Finished size':f==='a4'?'A4 print sheet':'US Letter print sheet'}</option>`).join('');document.getElementById('format').value=state.format;}
function render(){
  ++revision;clearTimeout(timer);error('Checking print layout…');
  const validation=validateStationery(state.id,state.values,resources.stationerySchemas);
  if(!validation.valid){error(validation.errors.join(' · '));return;}
  timer=setTimeout(()=>{
    const nonce=++revision;
    preview.onload=async()=>{
      const probe=await probeDocument(preview.contentDocument,resources.catalogue,resources.artwork);
      if(nonce!==revision)return;
      if(probe.issues.length){error(`${probe.issues.map(customerIssue).join(' · ')}. Shorten the wording before printing.`);return;}
      ready=true;document.getElementById('print').disabled=false;status.dataset.state='ready';status.textContent=`Ready to print · ${probe.pageCount} page${probe.pageCount===1?'':'s'}`;
    };
    preview.srcdoc=renderStationery(state,resources);
  },150);
}
document.getElementById('item').addEventListener('change',e=>{state.id=e.target.value;state.values=structuredClone(resources.stationeryDefaults[state.id]);state.format=resources.inventory.pages.find(p=>p.id===state.id).formats[0];formats();fields();render();});
document.getElementById('theme').addEventListener('change',e=>{state.theme=e.target.value;render();});
document.getElementById('format').addEventListener('change',e=>{state.format=e.target.value;render();});
document.getElementById('reset').addEventListener('click',()=>{state.values=structuredClone(resources.stationeryDefaults[state.id]);fields();render();});
document.getElementById('print').addEventListener('click',()=>{if(ready){preview.contentWindow.focus();preview.contentWindow.print();}});
document.getElementById('save').addEventListener('click',()=>{
  if(!ready)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify({version:4,...state},null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`midnight-seance-${state.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
document.getElementById('load').addEventListener('change',async e=>{
  const nonce=++loadRevision;
  try{
    const data=JSON.parse(await e.target.files[0].text());
    if(nonce!==loadRevision)return;
    const item=resources.inventory.pages.find(p=>p.id===data.id);
    if(data.version!==4||!item||!item.formats.includes(data.format)||!resources.inventory.treatments.includes(data.theme))throw Error('Choose a saved Midnight Séance stationery file');
    const validation=validateStationery(data.id,data.values,resources.stationerySchemas);if(!validation.valid)throw Error(validation.errors.join(' · '));
    Object.assign(state,{id:data.id,theme:data.theme,format:data.format,values:data.values});
    document.getElementById('item').value=state.id;document.getElementById('theme').value=state.theme;formats();fields();render();
  }catch(e){error(`Could not load your saved wording: ${e.message}`);}
  e.target.value='';
});
window.stationeryState=state;window.stationeryReady=()=>ready;window.stationeryRender=render;
formats();fields();render();
