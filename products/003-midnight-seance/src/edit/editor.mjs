import { renderDocument } from '../render/document.mjs';
import { validateFields } from './validation.mjs';
import { escapeText } from '../components/index.mjs';
const resources=window.MIDNIGHT_RESOURCES;
const state={kind:'invitation',theme:'full-colour',size:'5x7',values:structuredClone(resources.defaults.invitation)};
const form=document.getElementById('fields'),preview=document.getElementById('preview'),status=document.getElementById('status');
let currentFit=false,renderNonce=0,loadNonce=0,renderTimer;
window.editorLoadRevision=0;
function buildFields() {
  form.innerHTML=Object.entries(resources.schemas[state.kind]).map(([key,rule])=>`<label>${escapeText(rule.label)}<textarea data-key="${key}" rows="${key==='address'||key==='rsvp'?2:1}" aria-describedby="limit-${key}">${escapeText(state.values[key]??'')}</textarea><small id="limit-${key}">Up to ${rule.max} characters${rule.required?' · required':''}</small></label>`).join('');
  form.querySelectorAll('textarea').forEach(e=>e.addEventListener('input',()=>{state.values[e.dataset.key]=e.value;render();}));
}
function errors(messages) {currentFit=false;document.getElementById('print').disabled=true;status.textContent=messages.join(' · ');status.dataset.state='error';}
function render() {
  clearTimeout(renderTimer);++renderNonce;
  const validation=validateFields(state.kind,state.values,resources.schemas);
  if(!validation.valid){errors(validation.errors);return;}
  errors(['Checking print layout…']);
  // Coalesce typing bursts before rebuilding the self-contained illustrated preview.
  // Printing is disabled immediately and stale image/font callbacks are invalidated.
  renderTimer=setTimeout(renderPreview,150);
}
function renderPreview() {
  const nonce=++renderNonce;
  const validation=validateFields(state.kind,state.values,resources.schemas);
  if(!validation.valid){errors(validation.errors);return;}
  errors(['Checking print layout…']);
  preview.onload=async()=>{
    const doc=preview.contentDocument;
    await doc.fonts.ready;
    try{await Promise.all([...doc.images].map(image=>image.decode()));}
    catch{if(nonce===renderNonce)errors(['Artwork failed to load. Reopen the original offline editor.']);return;}
    if(nonce!==renderNonce)return;
    const root=doc.querySelector('.design'),bounds=root.getBoundingClientRect(),problems=[];
    for(const el of root.querySelectorAll('.field')) {
      const r=el.getBoundingClientRect();
      if(r.top<bounds.top+9*96/25.4||r.left<bounds.left+9*96/25.4||r.right>bounds.right-9*96/25.4||r.bottom>bounds.bottom-9*96/25.4||el.scrollWidth>el.clientWidth+2||el.scrollHeight>el.clientHeight+3)problems.push(el.dataset.field);
    }
    const fields=[...root.querySelectorAll('.field')];
    for(let i=0;i<fields.length;i++)for(let j=i+1;j<fields.length;j++){
      const a=fields[i].getBoundingClientRect(),b=fields[j].getBoundingClientRect();
      if(a.left<b.right&&a.right>b.left&&a.top<b.bottom-1&&a.bottom>b.top+1)problems.push(`${fields[i].dataset.field}/${fields[j].dataset.field}`);
    }
    if(problems.length){errors([`Text does not fit: ${[...new Set(problems)].join(', ')}. Shorten it before printing.`]);return;}
    currentFit=true;document.getElementById('print').disabled=false;status.textContent='Ready to print · text fits';status.dataset.state='ready';
  };
  preview.srcdoc=renderDocument(state,resources);
}
document.getElementById('kind').addEventListener('change',e=>{
  state.kind=e.target.value;state.values=structuredClone(resources.defaults[state.kind]);state.size=state.kind==='invitation'?'5x7':'8x10';
  const select=document.getElementById('size');select.innerHTML=(state.kind==='invitation'?['5x7','a4','us-letter']:['8x10','a4','us-letter']).map(s=>`<option>${s}</option>`).join('');buildFields();render();
});
document.getElementById('theme').addEventListener('change',e=>{state.theme=e.target.value;render();});
document.getElementById('size').addEventListener('change',e=>{state.size=e.target.value;render();});
document.getElementById('reset').addEventListener('click',()=>{state.values=structuredClone(resources.defaults[state.kind]);buildFields();render();});
document.getElementById('print').addEventListener('click',()=>{if(currentFit&&validateFields(state.kind,state.values,resources.schemas).valid){preview.contentWindow.focus();preview.contentWindow.print();}});
document.getElementById('save').addEventListener('click',()=>{
  if(!validateFields(state.kind,state.values,resources.schemas).valid)return;
  const blob=new Blob([JSON.stringify({version:1,...state},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`midnight-seance-${state.kind}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
document.getElementById('load').addEventListener('change',async e=>{
  const nonce=++loadNonce;
  try {
    const data=JSON.parse(await e.target.files[0].text());
    if(nonce!==loadNonce)return;
    if(data.version!==1||!['invitation','welcome'].includes(data.kind)||!['full-colour','economy'].includes(data.theme)||!(data.kind==='invitation'?['5x7','a4','us-letter']:['8x10','a4','us-letter']).includes(data.size))throw new Error('Invalid saved file');
    const validation=validateFields(data.kind,data.values,resources.schemas);if(!validation.valid)throw new Error(validation.errors.join(' · '));
    document.getElementById('kind').value=data.kind;document.getElementById('kind').dispatchEvent(new Event('change'));
    Object.assign(state,{kind:data.kind,theme:data.theme,size:data.size,values:data.values});document.getElementById('theme').value=state.theme;document.getElementById('size').value=state.size;buildFields();render();window.editorLoadRevision++;
  } catch(error){errors([`Could not load: ${error.message}`]);}
  e.target.value='';
});
window.editorState=state;window.editorReady=()=>currentFit;
buildFields();render();
