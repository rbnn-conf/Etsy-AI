import {escapeText} from './index.mjs';
export function artworkRenderer(resources,theme){
 const treatment=theme==='economy'?'economy':'signature';
 return (id,cls='',slot=id)=>{
  const asset=resources.artwork?.[treatment]?.[id];
  if(!asset)throw Error(`Missing final artwork ${id}/${treatment}`);
  return `<div class="artwork-slot ${escapeText(cls)}" data-artwork-slot="${escapeText(slot)}" data-artwork-status="original-illustration" aria-hidden="true"><img src="${asset.src}" alt="" data-artwork-id="${id}" data-treatment="${treatment}" data-source-width="${asset.pixels[0]}" data-source-height="${asset.pixels[1]}"></div>`;
 };
}
export function illustratedFrame(kind,art){
 return `<div class="frame frame-${kind}" aria-hidden="true">${['tl','tr','bl','br'].map(c=>`<span class="corner ${c}">${art('C03','frame-star')}</span>`).join('')}<span class="frame-bead top"></span><span class="frame-bead bottom"></span><span class="frame-break left">${art('C03','frame-star')}</span><span class="frame-break right">${art('C03','frame-star')}</span></div>`;
}
