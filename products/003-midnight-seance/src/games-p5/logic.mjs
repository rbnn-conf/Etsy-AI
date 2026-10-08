export function seeded(seed){let x=seed>>>0;return()=>((x=(Math.imul(x,1664525)+1013904223)>>>0)/4294967296);}
export function shuffle(values,seed){const out=[...values],r=seeded(seed);for(let i=out.length-1;i;i--){const j=Math.floor(r()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
export function scramble(word,index){for(let n=0;n<100;n++){const s=shuffle([...word],5100+index*97+n).join('');if(s!==word)return s;}throw Error(`Cannot scramble ${word}`);}
export function bingoBoards(prompts){return Array.from({length:12},(_,i)=>{const chosen=shuffle(prompts,7300+i*131).slice(0,24),cells=[...chosen.slice(0,12),'FREE',...chosen.slice(12)];return {number:i+1,cells};});}
export const bingoDisplayId=number=>String(number).padStart(2,'0');
export const letters=s=>[...s].sort().join('');
