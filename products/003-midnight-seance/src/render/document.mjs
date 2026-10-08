import { invitation, welcome, wordSearch } from '../layouts/pages.mjs';
import { styles } from '../design-system/styles.mjs';
import { escapeText } from '../components/index.mjs';
import {artworkRenderer} from '../components/artwork.mjs';
export function renderDocument(config,resources) {
  const {kind,theme,size,values}=config;
  const art=artworkRenderer(resources,theme);
  const pages=kind==='invitation'?[invitation(values,art)]:kind==='welcome'?[welcome(values,size,art)]:[wordSearch(resources.game,resources.puzzle,false,art),wordSearch(resources.game,resources.puzzle,true,art)];
  const html=pages.map(p=>`<section class="sheet">${p}</section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeText(`Midnight Séance — ${kind} design proof`)}</title><style>${styles(resources.tokens,resources.fonts,theme,size,kind)}</style></head><body>${html}<script>document.querySelectorAll('[data-field="eventTitle"]').forEach(e=>{if(e.textContent.length>${kind==='invitation'?18:26})e.classList.add('long')});document.querySelectorAll('.welcome .host').forEach(e=>{if(e.textContent.length>40)e.classList.add('long')});</script></body></html>`;
}
