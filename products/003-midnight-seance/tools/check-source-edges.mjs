import sharp from 'sharp';import {readdir} from 'node:fs/promises';
for(const t of ['signature','economy'])for(const f of await readdir(`products/003-midnight-seance/artwork/source/${t}`)){
 const {data,info}=await sharp(`products/003-midnight-seance/artwork/source/${t}/${f}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});let n=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if((x===0||y===0||x===info.width-1||y===info.height-1)&&data[(y*info.width+x)*4+3]>16)n++;
 if(n)console.log(t,f,n);
}
