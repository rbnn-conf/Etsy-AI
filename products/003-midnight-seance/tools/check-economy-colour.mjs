import sharp from 'sharp';
import {readFile,readdir} from 'node:fs/promises';
const root='products/003-midnight-seance/artwork/source/economy';
for(const f of await readdir(root)){
 const {data}=await sharp(`${root}/${f}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});let n=0,c=0;
 for(let i=0;i<data.length;i+=4)if(data[i+3]>200){n++;if(Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])>15)c++;}
 console.log(f.slice(0,3),Math.round(c/n*10000)/100+'% chromatic');
}
