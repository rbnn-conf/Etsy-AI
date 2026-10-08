import {styles} from '../design-system/styles.mjs';
import {artworkRenderer} from '../components/artwork.mjs';
import {escapeText} from '../components/index.mjs';
import {impose,trimSegments} from './imposition.mjs';
import {stationeryLayout,pieceCount} from './layouts.mjs';
import {stationeryStyles} from './styles.mjs';
import {polishStyles} from './polish-styles.mjs';
import {validateStationery} from './content.mjs';

export function renderStationery({id,theme='full-colour',format='native',values},resources){
  const item=resources.inventory.pages.find(p=>p.id===id);
  if(!item||!item.formats.includes(format)||!resources.inventory.treatments.includes(theme))throw Error('Unsupported stationery selection');
  values??=resources.stationeryDefaults[id];
  const validation=validateStationery(id,values,resources.stationerySchemas);
  if(!validation.valid)throw Error(validation.errors.join(' · '));
  const paper=format==='native'?item.nativeMm:resources.inventory.carrierSizesMm[format];
  const count=pieceCount(item,values),art=artworkRenderer(resources,theme);
  const card=item.reflow&&format!=='native'?[paper[0]-20,paper[1]-20]:item.nativeMm;
  let sheets;
  if(item.reflow||format==='native')sheets=Array.from({length:count},(_,index)=>({paperMm:paper,placements:[{item:index,xMm:(paper[0]-card[0])/2,yMm:(paper[1]-card[1])/2,widthMm:card[0],heightMm:card[1]}]}));
  else{
    sheets=impose({paper,finished:card,count:item.id==='S16'?Math.floor((paper[0]-20+4)/(card[0]+4))*Math.floor((paper[1]-20+4)/(card[1]+4)):count});
  }
  const tokens={...resources.tokens,sizes:{...resources.tokens.sizes,stationery:paper}};
  let css=styles(tokens,resources.fonts,theme,'stationery','stationery')+stationeryStyles()+polishStyles();
  css+=`@page{size:${paper[0]}mm ${paper[1]}mm;margin:0}.sheet{width:${paper[0]}mm;height:${paper[1]}mm;display:block}.sheet>.placement>.design{width:100%;height:100%}@media print{html,body{width:${paper[0]}mm}}`;
  const body=sheets.map(sheet=>{
    const placements=sheet.placements.map(p=>`<div class="placement" data-item="${p.item}" style="left:${p.xMm}mm;top:${p.yMm}mm;width:${p.widthMm}mm;height:${p.heightMm}mm">${stationeryLayout(item,values,art,format,item.id==='S16'?0:p.item)}</div>`).join('');
    const guides=format!=='native'&&!item.reflow?`<svg class="cut-guides" viewBox="0 0 ${paper[0]} ${paper[1]}" aria-hidden="true">${sheet.placements.flatMap(p=>trimSegments(p).map(s=>`<line x1="${s[0]}" y1="${s[1]}" x2="${s[2]}" y2="${s[3]}"/>`)).join('')}${item.foldAtMm?sheet.placements.flatMap(p=>[p.xMm-3,p.xMm+p.widthMm+1].map(x=>`<line class="fold" x1="${x}" y1="${p.yMm+item.foldAtMm}" x2="${x+2}" y2="${p.yMm+item.foldAtMm}"/>`)).join(''):''}${item.optionalHoleGuide?sheet.placements.map(p=>`<circle cx="${p.xMm+p.widthMm/2}" cy="${p.yMm+6}" r="1" fill="none" stroke="#777" stroke-width=".12"/>`).join(''):''}</svg><div class="print-sheet-label">Print at 100% · trim at corner marks${item.foldAtMm?' · fold at side dashes':''}${item.optionalHoleGuide?' · optional hole circles':''}</div>`:'';
    // Keep essential print guidance in the editor, rather than near a home printer's paper edge.
    return `<section class="sheet ${theme}">${placements}${guides.replace(/<div class="print-sheet-label">[^<]*<\/div>/,'')}</section>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeText(item.name)} — Midnight Séance</title><style>${css}</style></head><body>${body}<script>document.querySelectorAll('.event-title').forEach(e=>e.classList.toggle('long',e.textContent.length>${id==='S01'?18:26}));document.querySelectorAll('.welcome .host').forEach(e=>e.classList.toggle('long',e.textContent.length>40));document.querySelectorAll('.thanks-title').forEach(e=>e.classList.toggle('long',e.textContent.length>18));document.querySelectorAll('.master-S11 .formal-title').forEach(e=>e.classList.toggle('long',e.textContent.length>18));</script></body></html>`;
}
