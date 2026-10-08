import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {PRODUCT_ROOT} from '../paths.mjs';
/** Only approved artwork/font paths are served, bound to loopback on an ephemeral port. */
export async function startRenderServer(resources){
  const allowed=new Map();
  for(const font of resources.fontEvidence)allowed.set(`/fonts/${font.file}`,join(PRODUCT_ROOT,'fonts',font.file));
  for(const asset of resources.artworkManifest.assets)allowed.set(`/artwork/${asset.file}`,join(PRODUCT_ROOT,'artwork',resources.artwork[asset.treatment][asset.id].productionFile??asset.file));
  const server=createServer(async(req,res)=>{
    if(req.method!=='GET'){res.writeHead(405);res.end();return;}
    const path=new URL(req.url,'http://127.0.0.1').pathname;
    if(path==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');return;}
    if(!allowed.has(path)){res.writeHead(404);res.end();return;}
    try{res.writeHead(200,{'Content-Type':path.endsWith('.png')?'image/png':'application/octet-stream'});res.end(await readFile(allowed.get(path)));}
    catch{res.writeHead(500);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {origin:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>server.close(resolve))};
}
