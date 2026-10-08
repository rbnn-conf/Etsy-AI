import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import sharp from 'sharp';
import {PRODUCT_ROOT} from '../paths.mjs';
import {escapeText} from '../components/index.mjs';
import {reviewPath} from './resources.mjs';
import {sha256} from '../resources.mjs';
export async function buildStationeryEditor(resources){
  const directory=reviewPath('editable');await mkdir(directory,{recursive:true});
  const artwork={signature:{},economy:{}};
  const manifest=JSON.parse(await readFile(reviewPath('page-format-manifest.json'),'utf8')),evidence=[];
  const placements=manifest.jobs.flatMap(j=>j.probe.artwork);
  for(const asset of resources.artworkManifest.assets){
    const uses=placements.filter(p=>p.id===asset.id&&p.treatment===asset.treatment);if(!uses.length)continue;
    const maxWidthMm=Math.max(...uses.map(p=>p.widthMm)),maxHeightMm=Math.max(...uses.map(p=>p.heightMm));
    const production=resources.artwork[asset.treatment][asset.id];
    const scale=Math.min(1,Math.max(maxWidthMm*600/25.4/production.pixels[0],maxHeightMm*600/25.4/production.pixels[1]));
    const resized=await sharp(join(PRODUCT_ROOT,'artwork',production.productionFile??asset.file)).resize({width:Math.ceil(production.pixels[0]*scale),withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    // Resampling can spread subpixel alpha into a formerly clear perimeter.
    // Keep the original canvas and make its outermost pixel ring transparent.
    const {width:rw,height:rh,channels}=resized.info;
    for(let y=0;y<rh;y++)for(let x=0;x<rw;x++)if(x===0||y===0||x===rw-1||y===rh-1)resized.data.fill(0,(y*rw+x)*channels,(y*rw+x+1)*channels);
    const bytes=await sharp(resized.data,{raw:resized.info}).webp({lossless:true,effort:4}).toBuffer();
    const metadata=await sharp(bytes).metadata(),alpha=await sharp(bytes).extractChannel('alpha').raw().toBuffer();
    if(!metadata.hasAlpha||[...alpha.subarray(0,metadata.width),...alpha.subarray(alpha.length-metadata.width)].some(v=>v!==0))throw Error(`Editor derivative lost its transparent edge: ${asset.id}`);
    for(let y=0;y<metadata.height;y++)if(alpha[y*metadata.width]||alpha[y*metadata.width+metadata.width-1])throw Error(`Editor derivative edge is not transparent: ${asset.id}`);
    const minPlacedPpi=Math.min(metadata.width/maxWidthMm*25.4,metadata.height/maxHeightMm*25.4);
    if(minPlacedPpi<590)throw Error(`Editor derivative below resolution target: ${asset.id}`);
    artwork[asset.treatment][asset.id]={src:`data:image/webp;base64,${bytes.toString('base64')}`,pixels:[metadata.width,metadata.height],mask:resources.artwork[asset.treatment][asset.id].mask};
    evidence.push({id:asset.id,treatment:asset.treatment,sourceFile:asset.file,sourceSha256:asset.sha256,sha256:sha256(bytes),format:'lossless-webp',pixels:[metadata.width,metadata.height],bytes:bytes.length,maxWidthMm,maxHeightMm,minPlacedPpi,transparentPerimeter:true,transparentPerimeterRestoredAfterResampling:true});
  }
  await writeFile(join(directory,'editor-artwork-manifest.json'),JSON.stringify({targetPlacedPpi:600,status:'TECHNICAL_PASS',assets:evidence},null,2));
  const result=await build({entryPoints:[join(PRODUCT_ROOT,'src/stationery/editor.mjs')],bundle:true,write:false,format:'iife',platform:'browser',minify:true});
  const data={inventory:resources.inventory,stationerySchemas:resources.stationerySchemas,stationeryDefaults:resources.stationeryDefaults,tokens:resources.tokens,fonts:resources.fonts,artwork,catalogue:resources.catalogue};
  const path=join(directory,'midnight-seance-stationery-editor.html');
  await writeFile(path,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Midnight Séance — Personalise your stationery</title><style>body{margin:0;background:#F4EBDD;color:#171315;font:16px Arial,sans-serif;line-height:1.5}header{padding:20px 28px;border-bottom:1px solid #701F2A}h1{font:32px Georgia,serif;margin:0}main{display:grid;grid-template-columns:360px 1fr;gap:24px;padding:24px}label{display:block;margin-top:14px;font-weight:bold}select,textarea,button{font:inherit;padding:8px;box-sizing:border-box}select,textarea{width:100%}textarea{resize:vertical}small{display:block;color:#45343B}button{margin:12px 5px 0 0;border:1px solid #701F2A;background:white;color:#171315;border-radius:3px;cursor:pointer}button:disabled{opacity:.5;cursor:default}:focus-visible{outline:3px solid #701F2A;outline-offset:3px}iframe{width:100%;height:950px;border:1px solid #A98A5B;background:white}#status{padding:12px;border-left:4px solid #701F2A;background:white}#status[data-state=ready]{border-color:#3D5C42}@media(max-width:800px){main{grid-template-columns:1fr}}@media print{body{display:none}}</style></head><body><header><h1>Midnight Séance</h1><p>Make the evening your own. This editor works offline: keep it beside its assets folder.</p></header><main><section aria-label="Your wording"><label for="item">Stationery item</label><select id="item">${resources.inventory.pages.map(p=>`<option value="${p.id}">${escapeText(p.name)}</option>`).join('')}</select><label for="theme">Print treatment</label><select id="theme"><option value="full-colour">Signature Ivory</option><option value="economy">Ink economy</option></select><label for="format">Paper or finished size</label><select id="format"></select><div id="fields"></div><button id="reset">Restore sample wording</button><button id="save">Save my wording</button><label for="load">Open saved wording</label><input type="file" accept=".json,application/json" id="load"><p id="status" role="status" aria-live="polite">Checking print layout…</p><button id="print" disabled>Print / Save PDF</button><p>Use Chrome or Edge. In the print dialog, select the matching paper size, 100% scale, no margins and no headers or footers. Enable background graphics for Signature Ivory. For finished-size output, select a matching custom paper size; choose A4 or US Letter for home printing.</p></section><section aria-label="Print preview"><iframe id="preview" title="Your stationery print preview"></iframe></section></main><script>window.STATIONERY_RESOURCES=${JSON.stringify(data).replaceAll('<','\\u003c')};</script><script>${result.outputFiles[0].text}</script></body></html>`);
  await writeFile(path,(await readFile(path,'utf8')).replace('This editor works offline: keep it beside its assets folder.','This editor works offline.').replace('choose A4 or US Letter for home printing.','choose A4 or US Letter for home printing. Trim at corner marks, fold table tents at the side dashes and use tag hole circles only if you want to punch a hole.'));
  return path;
}
