import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {createRequire} from 'node:module';
import { renderAssets } from '../../../marketing/src/render.mjs';
import { assert,hash } from '../../004-cozy-spooky-coloring/src/core.mjs';
import { root,config } from './config.mjs';
const require=createRequire(new URL('../../004-cozy-spooky-coloring/package.json',import.meta.url));
const sharp=require('sharp');
await writeFile(join(root,'qc/production-report.json'),JSON.stringify({status:'MARKETING IN PROGRESS',ready:false}));

const report=JSON.parse(await readFile(join(root,'qc/build-report.json'),'utf8'));
assert(report.status==='READY FOR ETSY REVIEW','Build must pass before marketing');
for(const source of report.sources) assert(hash(await readFile(join(root,'source',source.name)))===source.sha256,'Source changed since build');
const fonts=resolveFonts();
function resolveFonts(){return join(root,'../../marketing/assets/fonts');}
const font=async(name,type)=>`data:font/${type};base64,${(await readFile(join(fonts,name))).toString('base64')}`;
const faces=`@font-face{font-family:Spectral;src:url('${await font('Spectral-SemiBold.ttf','ttf')}');font-weight:600}@font-face{font-family:Inter;src:url('${await font('Inter-Regular.woff2','woff2')}');font-weight:400}@font-face{font-family:Inter;src:url('${await font('Inter-SemiBold.woff2','woff2')}');font-weight:600}`;
const images={};
for(const source of report.sources) images[source.id]='data:image/png;base64,'+(await sharp(join(root,'source',source.name)).resize(1000,1000,{fit:'inside'}).png().toBuffer()).toString('base64');
const previews={};
for(const id of ['P005','P010','P017'])previews[id]='data:image/png;base64,'+(await readFile(join(root,`listing/source-previews/pages/${id}.png`))).toString('base64');
const letterPreview='data:image/png;base64,'+(await sharp(join(root,'output/png/US-Letter',config.pngName('P010','US-Letter'))).resize(900).png().toBuffer()).toString('base64');
const at=(x,y,w)=>`left:${x}px;top:${y}px;width:${w}px;`;
const text=(s,x,y,w,cls='lead')=>`<div class="${cls} pos" style="${at(x,y,w)}">${s}</div>`;
const art=(id,x,y,w,angle=0)=>`<div class="art pos" style="${at(x,y,w)}height:${w}px;transform:rotate(${angle}deg)"><img alt="${id} coloring artwork" src="${images[id]}"></div>`;
const paper=(id,x,y,w,angle=0)=>`<div class="paper pos" style="${at(x,y,w)}transform:rotate(${angle}deg)"><img alt="A4 printable ${id}" src="${previews[id]}"></div>`;
const title=(s,x=140,y=260,w=1720)=>text(s,x,y,w,'title');
const rule=(y,w=150)=>`<div class="pos rule" style="${at(140,y,w)}"></div>`;
const claim=(name,value,copy)=>`<span data-claim="${name}" data-claim-value="${value}">${copy}</span>`;
const count=claim('page-count','20','20 Printable Coloring Pages');
const sizes=claim('paper-sizes','A4,US-Letter','A4 + US Letter');
const product=claim('product-title',config.title,config.title);
const specs=[
 ['01-hero','THE AUTUMN COLLECTION',title('Cozy Autumn<br>Adventures',140,245,1720)+text(count,148,650,1450,'hero-sub')+rule(775)+art('P001',155,875,820,-2)+art('P017',1090,1080,690,3)+text(sizes+' · PDF + PNG',150,1780,1600,'label')],
 ['02-whats-included','YOUR DIGITAL COLORING BOOK',title('A whole season<br>of little adventures.')+rule(605)+text('What’s included',140,675,900,'subhead')+text('01',140,850,120,'number')+text('20 unique designs',290,865,650,'subhead')+text('Two 20-page PDFs, one per paper size.',290,960,650)+text('02',140,1110,120,'number')+text('Individual PNG pages',290,1125,650,'subhead')+text('20 A4 + 20 US Letter pages.',290,1220,650)+text('03',140,1370,120,'number')+text('Printing guide',290,1385,650,'subhead')+text('Instant digital download. Extract all ZIPs.',290,1480,650)+art('P002',1110,795,660,2)+art('P005',1270,1300,460,-3)],
 ['03-page-collage','A PEEK INSIDE',title('Find your autumn favorite.')+text('Village lanes, pumpkin patches & woodland paths.',140,475,1660)+rule(595)+art('P002',140,710,535,-2)+art('P007',730,740,535,1)+art('P013',1320,710,535,2)+art('P006',430,1320,530,1)+art('P019',1050,1320,530,-2)],
 ['04-autumn-theme','COZY AUTUMN ADVENTURES',title('All the cozy details.',140,265,1720)+rule(490)+art('P016',140,645,1080,-2)+text('Warm kitchens.<br>Leafy lanes.<br>Harvest days.',1330,700,530,'subhead')+text('Small scenes to make<br>your own with color.',1330,1070,530)+art('P018',1400,1330,425,2)],
 ['05-print-at-home','PRINTABLE · DIGITAL DOWNLOAD',title('A quiet afternoon,<br>one page at a time.',140,250,1720)+rule(610)+paper('P005',830,760,760,3)+text('Print at home',140,850,600,'subhead')+text('Choose your paper size.<br>Print a test page.<br>Bring out your pencils.',140,990,570)+text('Or use a local<br>print service.',140,1320,570)+text('No physical item is shipped.',140,1675,640,'label')+'<div class="pencil pos" style="left:1750px;top:950px;transform:rotate(8deg)"></div>'],
 ['06-paper-sizes','TWO PRINTABLE FORMATS',title('Your paper.<br>Your choice.',140,250,900)+text(sizes,1090,350,750,'subhead')+rule(650)+paper('P010',220,780,650,-1)+`<div class="paper pos" style="${at(1090,805,668)}"><img alt="Actual US Letter printable page" src="${letterPreview}"></div>`+text('A4',220,1775,650,'subhead')+text('210 × 297 mm',220,1855,650,'label')+text('US Letter',1090,1775,700,'subhead')+text('8.5 × 11 inches',1090,1855,700,'label')],
 ['07-perfect-for','MAKE TIME TO COLOR',title('For slower<br>autumn days.',140,255,1720)+rule(620)+text('Cozy afternoons',140,760,1050,'subhead')+text('Rainy-day creativity',140,960,1050,'subhead')+text('Seasonal family activities',140,1160,1050,'subhead')+text('A little time for yourself',140,1360,1050,'subhead')+art('P010',1190,900,630,2)+text('Choose a scene. Settle in. Make it yours.',140,1700,1600)],
 ['08-digital-download','INSTANT DIGITAL DOWNLOAD',title('From download<br>to coloring time.')+rule(620)+['Purchase','Download','Print','Color'].map((s,i)=>text('0'+(i+1),140+i*440,780,350,'stepnum')+text(s,140+i*440,1030,380,'subhead')).join('')+text('Save and extract every ZIP folder before printing.',140,1220,1700)+text('Digital PDF + PNG files.<br>No physical item is shipped.',140,1460,1000,'hero-sub')+art('P003',1410,1390,410,-2)],
 ['09-more-previews','MORE SCENES TO EXPLORE',title('Stay a little longer.')+text('A railway stop, a reading corner & a village celebration.',140,475,1700)+rule(595)+art('P014',140,720,760,-1)+art('P020',1020,720,760,2)+art('P011',140,1550,290)+art('P012',500,1550,290)+art('P015',860,1550,290)+art('P008',1220,1550,290)+text('And more<br>inside.',1590,1620,290,'lead')],
 ['10-lumiumx','THE AUTUMN COLLECTION',text('LumiumX',140,265,1720,'brandtitle')+text('20 Cozy Autumn Coloring Pages',140,580,1720,'hero-sub')+rule(715)+art('P019',140,830,700,-2)+art('P004',975,940,700,2)+text('Cozy Autumn Adventures',140,1680,1720,'subhead')+text(sizes+' · Instant digital download',140,1790,1700,'label')]
];
const css=`${faces}*{box-sizing:border-box}body{margin:0;color:#1F1F1F;font-family:Inter;font-weight:400}#canvas{position:relative;width:2000px;height:2000px;background:#FAF7F2;overflow:hidden}.pos{position:absolute}.title{font:600 140px/1.08 Spectral;letter-spacing:-.01em}.brandtitle{font:600 230px/1.1 Spectral}.hero-sub{font:400 62px/1.35 Inter}.lead{font:400 42px/1.5 Inter}.subhead{font:600 65px/1.18 Spectral}.number{font:600 72px/1.1 Spectral}.stepnum{font:600 180px/1.1 Spectral}.label{font:600 30px/1.45 Inter;letter-spacing:.045em}.kicker{font:600 28px/1.3 Inter;letter-spacing:.16em}.kicker:before{content:'';display:inline-block;width:22px;height:22px;background:#C4644A;margin-right:22px}.art{padding:16px;background:#FFFFFF;border:1px solid #E6E1D9;box-shadow:18px 32px 60px -30px #1f1f1f50}.art img{width:100%;height:100%;object-fit:contain}.paper{background:#FFFFFF;border:1px solid #E6E1D9;box-shadow:18px 32px 60px -30px #1f1f1f50}.paper img{display:block;width:100%}.rule{height:5px;background:#C4644A}.footer{position:absolute;left:140px;right:140px;bottom:40px;font:400 24px Inter;border-top:2px solid #E6E1D9;padding-top:18px;display:flex;justify-content:space-between}.footer b{font-weight:600}.footer i{display:inline-block;width:44px;height:4px;background:#C4644A;vertical-align:middle;margin-left:12px}.pencil{width:22px;height:650px;background:#C4644A;border:2px solid #1F1F1F;border-radius:0 0 12px 12px}.pencil:before{content:'';position:absolute;top:-50px;border-left:10px solid transparent;border-right:10px solid transparent;border-bottom:50px solid #1F1F1F}`;
const jobs=[];
await mkdir(join(root,'listing/html'),{recursive:true});
for(const [index,[name,kicker,body]] of specs.entries()){
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><style>${css}</style><div id="canvas">${text(kicker,140,130,1720,'kicker')}${body}<div class="footer"><b data-brand>LUMIUMX<i></i></b><span>${index===0?'PRINTABLE · DIGITAL DOWNLOAD':product}</span><span>${String(index+1).padStart(2,'0')} / 10</span></div></div></html>`;
 await writeFile(join(root,`listing/html/${name}.html`),html);
 jobs.push({html,outPath:join(root,`output/marketing/${name}.png`),width:2000,height:2000});
}
const renders=await renderAssets(jobs);
for(const r of renders){assert(r.overflowPx===0,`Marketing overflow: ${r.outPath}`);assert(!r.blocked.length,'External marketing asset blocked');assert(r.hasBranding,'Missing branding');assert(r.minFontPx>=24,'Small marketing text');}
const overlays=[];
for(const [i,r] of renders.entries())overlays.push({input:await sharp(r.outPath).resize(400,400).toBuffer(),left:(i%5)*400,top:Math.floor(i/5)*400});
await sharp({create:{width:2000,height:800,channels:3,background:'#FAF7F2'}}).composite(overlays).png().toFile(join(root,'qc/marketing-contact-sheet.png'));
await sharp(renders[0].outPath).resize(170,170).png().toFile(join(root,'qc/hero-thumbnail.png'));
await sharp(renders[0].outPath).resize(700,700).greyscale().png().toFile(join(root,'qc/hero-greyscale.png'));
await writeFile(join(root,'qc/marketing-report.json'),JSON.stringify({status:'PASS',renders},null,2));
console.log('10 marketing images rendered; canvas, text size and network checks PASS.');
