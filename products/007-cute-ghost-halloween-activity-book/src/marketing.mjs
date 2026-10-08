// Ten 2000 x 2000 Etsy listing images composed in code from the supplied
// artwork (no generated imagery). Rendered by the shared network-blocked
// Chromium renderer; claims are tagged for QC via data-claim spans.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { renderAssets } from '../../../marketing/src/render.mjs';
import { assert, hash } from '../../004-cozy-spooky-coloring/src/core.mjs';
import { root, config, lib } from './config.mjs';
const sharp=lib('sharp');

const build=JSON.parse(await readFile(join(root,'qc/build-report.json'),'utf8'));
assert(build.status==='BUILD PASS','Print build must pass before marketing');
for(const s of build.sources)assert(hash(await readFile(join(root,'source',s.source)))===s.sha256,'Source changed since build');
const spec=JSON.parse(await readFile(join(root,'MARKETING_DESIGN_SPEC.json'),'utf8'));
const C=spec.palette;

const fonts=join(root,'../../marketing/assets/fonts');
const font=async(n,t)=>`data:font/${t};base64,${(await readFile(join(fonts,n))).toString('base64')}`;
const faces=`@font-face{font-family:Spectral;src:url('${await font('Spectral-SemiBold.ttf','ttf')}');font-weight:600}@font-face{font-family:Inter;src:url('${await font('Inter-Regular.woff2','woff2')}');font-weight:400}@font-face{font-family:Inter;src:url('${await font('Inter-SemiBold.woff2','woff2')}');font-weight:600}`;

const src={}, ratio={};
for(const s of build.sources){
  const bytes=await readFile(join(root,'source',s.source));
  src[s.id]='data:image/png;base64,'+(await sharp(bytes).resize({width:s.id==='P001'?1100:760}).png().toBuffer()).toString('base64');
  ratio[s.id]=s.height/s.width;
}
const cover=await readFile(join(root,'source',build.sources[0].source));
const coverDetail='data:image/png;base64,'+(await sharp(cover).extract({left:340,top:520,width:763,height:780}).png().toBuffer()).toString('base64');
const layout=async f=>'data:image/png;base64,'+(await readFile(join(root,'previews',f,'P009.png'))).toString('base64');
const a4=await layout('A4'), letter=await layout('US-Letter');

const at=(x,y,w)=>`left:${x}px;top:${y}px;width:${w}px;`;
const text=(s,x,y,w,cls='lead')=>`<div class="${cls} pos" style="${at(x,y,w)}">${s}</div>`;
// A real page on white stationery with the shared studio shadow.
const pad=cls=>cls==='mini'?12:cls==='cover'?0:28;
const sheet=(id,x,y,w,angle=0,cls='paper')=>`<div class="${cls} pos" style="${at(x,y,w)}height:${Math.round((w-pad(cls))*ratio[id]+pad(cls))}px;transform:rotate(${angle}deg)"><img alt="${id} page" src="${src[id]}"></div>`;
const tagged=(id,x,y,w,label,angle=0)=>sheet(id,x,y,w,angle)+text(label,x,y+Math.round((w-28)*ratio[id]+28)+26,w,'tag');
const rule=(x,y,w=150)=>`<div class="pos rule" style="${at(x,y,w)}"></div>`;
const claim=(name,value,copy)=>`<span data-claim="${name}" data-claim-value="${value}">${copy}</span>`;
const pages=claim('page-count',String(config.pageCount),'30 Printable Pages');
const acts=claim('activity-count',String(config.activityCount),'28 activities');
const sizes=claim('paper-sizes','A4,US-Letter','A4 + US Letter');
const product=claim('product-title',config.title,config.title);
const leaf=(x,y,s,angle,color,op=1)=>`<svg class="pos deco" style="${at(x,y,s)}height:${s}px;transform:rotate(${angle}deg);opacity:${op}" viewBox="0 0 100 100"><path fill="${color}" d="M50 4 L58 28 L80 18 L72 42 L96 46 L74 60 L84 82 L60 74 L54 96 L50 84 L46 96 L40 74 L16 82 L26 60 L4 46 L28 42 L20 18 L42 28 Z"/></svg>`;
const star=(x,y,s,op=.8)=>`<svg class="pos deco" style="${at(x,y,s)}height:${s}px;opacity:${op}" viewBox="0 0 20 20"><path fill="${C.gold}" d="M10 0 L12 8 L20 10 L12 12 L10 20 L8 12 L0 10 L8 8Z"/></svg>`;
const sky=[star(1780,150,34),star(1660,300,20,.6),star(1880,420,24,.5),star(90,1000,22,.5),star(1850,1560,28,.6)].join('');

const specs=[
 ['01-hero','night',"HALLOWEEN ACTIVITY BOOK · FOR KIDS",
  text('Cute Ghost<br>Halloween<br>Activity Book',130,250,880,'title')+text(pages+'<br>for Kids',134,770,820,'hero-sub')+rule(134,960)+
  sheet('P003',150,1100,430,-4)+sheet('P011',540,1140,430,4)+
  sheet('P001',1045,290,835,2.5,'cover')+
  text(sizes+' · PDF + PNG · Instant download',134,1790,1500,'label')+sky],
 ['02-whats-inside','cream',"WHAT'S INSIDE",
  text('A little bit of everything.',130,230,1740,'title')+text('Real pages from your download, eight kinds of Halloween fun.',134,420,1740)+
  [['P003','Mazes'],['P011','Colouring'],['P008','I Spy'],['P005','Matching'],['P016','Counting'],['P028','Tracing'],['P012','Puzzles'],['P018','Design activities']]
   .map(([id,l],i)=>tagged(id,130+(i%4)*450,600+Math.floor(i/4)*640,380,l,[-1.5,1,-1,1.5][i%4])).join('')],
 ['03-30-pages','night',"THE FULL BOOK",
  text(claim('page-count','30','30'),130,170,430,'numeral')+text('printable<br>pages',590,290,440,'subhead-light')+
  text('A colour cover, '+acts+' and a certificate to finish.',1080,330,790,'lead-light')+
  Array.from({length:30},(_,i)=>{const id=`P${String(i+1).padStart(3,'0')}`;return sheet(id,130+(i%8)*221,620+Math.floor(i/8)*290,200,0,'mini');}).join('')+
  text('Mazes · Colouring · I Spy · Counting · Tracing · Matching · Puzzles · Certificate',134,1810,1740,'caption-light')],
 ['04-mazes-puzzles','cream',"MAZES & PUZZLES",
  text('Puzzle it out.',130,230,900,'title')+text('Mazes, word games, patterns and matching.',134,420,900)+rule(134,540)+
  sheet('P003',130,650,860,-1.5)+sheet('P012',1070,250,380,2)+sheet('P013',1490,300,380,-2)+sheet('P014',1070,830,380,-1.5)+sheet('P015',1490,880,380,2)+
  text('Word search · Word scramble · What comes next? · Match the pairs',1070,1440,800,'caption')],
 ['05-colour-create','cream',"COLOUR & CREATE",
  text('Colour it in.<br>Make it yours.',130,230,900,'title')+rule(134,570)+
  text('Cozy scenes to colour, plus pages to design your own pumpkin, ghost costume and jack-o’-lantern face.',134,640,820)+
  sheet('P011',1060,230,810,2)+sheet('P004',130,1010,400,-3)+sheet('P018',560,1060,400,2)+sheet('P023',1060,1300,400,-2)+sheet('P019',1470,1330,400,3)],
 ['06-learn-through-play','cream',"COUNT · TRACE · MATCH",
  text('Learn through play.',130,230,1740,'title')+text('Counting, tracing and matching pages with friendly ghosts and pumpkins.',134,420,1740)+rule(134,540)+
  tagged('P016',130,620,520,'Count the pumpkins',-1.5)+tagged('P028',740,640,520,'Trace the words',1)+tagged('P027',1350,620,520,'Match the pumpkins',-1)+
  ['P021','P024','P009','P007','P015'].map((id,i)=>sheet(id,130+i*360,1420,300,[1,-1.5,1.5,-1,1][i])).join('')],
 ['07-cozy-halloween','night',"COZY, NOT SCARY",
  text('Friendly ghosts,<br>cozy Halloween.',130,230,880,'title-light')+rule(134,570)+
  text('Pumpkins, black cats, bats and autumn leaves. Cute and gentle for little ones.',134,640,800,'lead-light')+
  `<div class="cover pos" style="${at(1060,220,810)}height:828px;transform:rotate(-2deg)"><img alt="Cover detail" src="${coverDetail}"></div>`+sheet('P026',130,1010,420,-3)+sheet('P020',590,1060,420,2)+sheet('P025',1140,1120,420,3)+leaf(700,860,90,20,C.pumpkin,.9)+leaf(1720,1450,70,-15,C.gold,.8)+sky],
 ['08-print-at-home','cream',"INSTANT DIGITAL DOWNLOAD",
  text('Print at home.',130,230,1740,'title')+rule(134,430)+
  ['Buy','Download','Print','Play'].map((s,i)=>text('0'+(i+1),130+i*440,540,360,'stepnum')+text(s,134+i*440,760,380,'subhead')).join('')+
  text('Print again and again for personal and classroom use.',134,940,960,'lead')+
  text('This is a digital download.<br>No physical item is shipped.',134,1180,960,'hero-sub')+
  sheet('P030',1180,880,640,3)],
 ['09-a4-us-letter','cream',"TWO PAPER SIZES",
  text('Your paper, your size.',130,230,1740,'title')+text(sizes+' PDFs are both included, with the same 30 pages in each.',134,420,1740)+
  `<div class="paper pos" style="${at(170,620,720)}"><img alt="Actual A4 layout" src="${a4}"></div>`+
  `<div class="paper pos" style="${at(1070,640,742)}"><img alt="Actual US Letter layout" src="${letter}"></div>`+
  text('A4',170,1680,720,'subhead')+text('210 × 297 mm',170,1770,720,'label')+text('US Letter',1070,1680,742,'subhead')+text('8.5 × 11 inches',1070,1770,742,'label')],
 ['10-perfect-for','night',"PERFECT FOR",
  text('Made for<br>Halloween fun.',130,230,920,'title-light')+rule(134,570)+
  ['Halloween parties','Quiet time','Classroom activities','Rainy days','Family activities','Screen-free fun'].map((s,i)=>text(s,134,680+i*140,900,'list')).join('')+
  sheet('P010',1100,250,760,3)+sheet('P008',1150,1180,420,-4)+leaf(1640,1300,110,15,C.pumpkin,.9)+leaf(1730,1470,70,-20,C.gold,.8)+sky]
];

const css=`${faces}*{box-sizing:border-box}body{margin:0;font-family:Inter;font-weight:400}
#canvas{position:relative;width:2000px;height:2000px;overflow:hidden}
.cream{background:${C.cream};color:${C.ink}}
.night{background:radial-gradient(1100px 900px at 72% 42%,${C.glow} 0%,rgba(0,0,0,0) 70%),radial-gradient(1400px 1200px at 20% 100%,${C.plum} 0%,rgba(0,0,0,0) 65%),${C.navy};color:${C.cream}}
.pos{position:absolute}
.title{font:600 140px/1.06 Spectral;letter-spacing:-.01em;color:${C.navy}}
.night .title{color:${C.cream}}
.title-light{font:600 118px/1.08 Spectral;letter-spacing:-.01em;color:${C.cream}}
.numeral{font:600 400px/1 Spectral;color:${C.pumpkin}}
.hero-sub{font:400 62px/1.3 Inter}
.lead{font:400 42px/1.45 Inter;color:${C.brown}}
.lead-light{font:400 42px/1.45 Inter;color:${C.creamSoft}}
.subhead{font:600 64px/1.15 Spectral;color:${C.navy}}
.subhead-light{font:600 110px/1.02 Spectral;color:${C.cream}}
.caption-light{font:400 34px/1.45 Inter;color:${C.creamSoft}}
.caption{font:400 34px/1.45 Inter;color:${C.brown}}
.list{font:600 60px/1.2 Spectral;color:${C.cream}}
.list:before{content:'';display:inline-block;width:18px;height:18px;border-radius:50%;background:${C.pumpkin};margin:0 30px 12px 0;vertical-align:middle}
.stepnum{font:600 180px/1.1 Spectral;color:${C.pumpkin}}
.tag{font:600 36px/1.3 Inter;letter-spacing:.02em;color:${C.navy}}
.label{font:600 30px/1.45 Inter;letter-spacing:.06em;text-transform:uppercase}
.cream .label{color:${C.brown}}
.night .label{color:${C.gold}}
.kicker{font:600 28px/1.3 Inter;letter-spacing:.16em}
.cream .kicker{color:${C.brown}}.night .kicker{color:${C.gold}}
.kicker:before{content:'';display:inline-block;width:22px;height:22px;border-radius:50%;background:${C.pumpkin};margin-right:22px;vertical-align:-3px}
.paper,.mini{background:#fff;padding:14px;border:1px solid ${C.stone};border-radius:6px;box-shadow:0 40px 90px -40px rgba(20,20,35,.45)}
.mini{padding:6px;border-radius:3px;box-shadow:0 18px 30px -18px rgba(0,0,0,.6)}
.paper img,.mini img,.cover img{display:block;width:100%;height:100%;object-fit:contain}
.cover{border-radius:8px;overflow:hidden;box-shadow:0 60px 120px -40px rgba(0,0,0,.75),0 0 0 10px rgba(255,248,235,.08)}
.rule{height:6px;border-radius:3px;background:${C.pumpkin}}
.footer{position:absolute;left:130px;right:130px;bottom:40px;font:400 26px Inter;padding-top:18px;display:flex;justify-content:space-between}
.cream .footer{border-top:2px solid ${C.stone};color:${C.brown}}.night .footer{border-top:2px solid rgba(246,239,227,.18);color:${C.creamSoft}}
.footer b{font-weight:600;letter-spacing:.12em}
.footer i{display:inline-block;width:44px;height:4px;background:${C.pumpkin};vertical-align:middle;margin-left:12px}`;

await mkdir(join(root,'listing/html'),{recursive:true});
const jobs=[];
for(const [i,[name,theme,kicker,body]] of specs.entries()){
  const html=`<!doctype html><html lang="en-GB"><meta charset="utf-8"><style>${css}</style><div id="canvas" class="${theme}">${text(kicker,130,120,1500,'kicker')}${body}<div class="footer"><b data-brand>LUMIUMX<i></i></b><span>${i===0?'PRINTABLE · DIGITAL DOWNLOAD':product}</span><span>${String(i+1).padStart(2,'0')} / 10</span></div></div></html>`;
  await writeFile(join(root,`listing/html/${name}.html`),html);
  jobs.push({html,outPath:join(root,`output/marketing/${name}.png`),width:2000,height:2000});
}
const renders=await renderAssets(jobs);
for(const r of renders){assert(r.overflowPx===0,`Marketing overflow ${r.overflowPx}px: ${r.outPath}`);assert(!r.blocked.length,'External asset blocked');assert(r.hasBranding,'Missing branding');assert(r.minFontPx>=24,'Marketing text below 24px');}
const ov=[];for(const [i,r] of renders.entries())ov.push({input:await sharp(r.outPath).resize(400,400).toBuffer(),left:(i%5)*400,top:Math.floor(i/5)*400});
await sharp({create:{width:2000,height:800,channels:3,background:C.cream}}).composite(ov).png().toFile(join(root,'qc/marketing-contact-sheet.png'));
await sharp(renders[0].outPath).resize(170,170).png().toFile(join(root,'qc/hero-thumbnail.png'));
await sharp(renders[0].outPath).resize(700,700).greyscale().png().toFile(join(root,'qc/hero-greyscale.png'));
await writeFile(join(root,'qc/marketing-report.json'),JSON.stringify({status:'PASS',renders},null,2));
console.log('10 marketing images rendered; overflow, font-size, branding and network checks PASS.');
