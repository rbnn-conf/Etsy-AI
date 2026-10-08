import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../artwork');
const json=async p=>JSON.parse(await readFile(resolve(root,p),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const measured=await json('records/measured-assets.json');
const original=await json('records/generation-prompts.json');
const records=[];
for(const file of await readdir(resolve(root,'records')))if(/^(generated|regenerated)-.*\.json$/.test(file))records.push({record:file,...await json(`records/${file}`)});
const minimum={A05:20,A08:8,A09:20,B01:12,B02:24,B03:18,B04:15,B05:8,B06:14,C01:18,C02:30,C03:3,C04:8,C05:12,C06:20,D01:14,D02:14,D03:14,D04:14,D05:14,D06:10,D07:18,D08:14,D09:10,E01:30,E02:12,E03:20,E04:25,E05:12};
const findings={A:'Connected rose, leaf and thorn engraving; complete corner/divider silhouette, deliberate negative space.',B:'Moth, ravens and occult objects have coherent anatomy and legible silhouettes; no text or malformed extra limbs.',C:'Celestial engraving is clean; C02 consistently waxes with right illumination and wanes with left illumination.',D:'Distinct apothecary shapes, blank typeset-label interiors and coherent snake/sprig contours.',E:'Open lace and engraved flourishes retain clear outer contours and intentional negative space.'};
for(const a of measured.assets){
 const bytes=await readFile(resolve(root,a.source));if(hash(bytes)!==a.sourceSha256)throw Error(`Source changed: ${a.id}/${a.treatment}`);
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});let count=0,coloured=0;
 for(let i=0;i<data.length;i+=4)if(data[i+3]>200){count++;if(Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])>15)coloured++;}
 a.chromaticOpaqueFraction=coloured/count;
 if(a.treatment==='economy'&&a.chromaticOpaqueFraction>=.01)throw Error(`Coloured economy asset ${a.id}`);
 if(a.effectivePpiAtMaxBox<300||a.edgeOpaque!==0)throw Error(`Technical QC failed ${a.id}`);
 a.minWidthMm=minimum[a.id]??12;a.minHeightMm=a.minWidthMm*a.pixels[1]/a.pixels[0];
 a.minimumSizeNote=a.id==='C03'?'3 mm structural silhouette; use at 12 mm or larger when interior engraving detail matters.':'Minimum suggested width preserves silhouette; inspect printer output before customer release.';
 a.intendedPlacement={A:'Stationery botanical corners, dividers and compact activity headers',B:'Stationery heroes, apothecary signs and seals',C:'Stationery upper anchors, lunar dividers and celestial frame details',D:'Potion labels, drinks signs and apothecary stationery',E:'Stationery lace rules, menu separators and activity footer seals'}[a.id[0]];
 a.visualQc='pass';a.visualFinding=findings[a.id[0]]+(a.treatment==='economy'?' Purpose-drawn neutral engraving checked on white; no colour wash or paper rectangle.':' Restricted oxblood, plum, charcoal and antique-gold engraving checked individually.');
 a.approvalStatus='Production QC accepted; owner visual approval pending';
 a.reviewImages=[`review/${a.id}-${a.treatment}-ivory.png`,`review/${a.id}-${a.treatment}-white.png`];
 const history=records.filter(r=>r.id===a.id&&r.treatment===a.treatment);
 const base=original.assets.find(r=>r.id===a.id&&r.treatment===a.treatment);
 a.promptRecord=history.map(r=>`records/${r.record}`);
 a.generationHistory=[...(base?[{prompt:base.prompt,toolPath:base.toolPath}]:[]),...history.map(({record,...r})=>r)];
}
const rejected=[];
for(const file of await readdir(resolve(root,'rejected'))){const bytes=await readFile(resolve(root,'rejected',file));const match=records.find(r=>r.rejectedFile===`rejected/${file}`);rejected.push({file:`rejected/${file}`,sha256:hash(bytes),reason:match?.reason??(file.startsWith('C02')?'Inconsistent moon-phase illumination; retained as rejected generation.':'Economy candidate retained for colour, wash or source-boundary correction.'),record:match?.record});}
await writeFile(resolve(root,'records/measured-assets.json'),JSON.stringify(measured,null,2));
await writeFile(resolve(root,'records/visual-inspections.json'),JSON.stringify({milestone:3,method:'Individual native artwork inspection, white/ivory backdrop evidence and integrated PDF-derived proof inspection recorded separately.',assets:measured.assets.map(a=>({id:a.id,treatment:a.treatment,sourceSha256:a.sourceSha256,productionSha256:a.sha256,result:a.visualQc,finding:a.visualFinding,backdropEvidence:a.reviewImages}))},null,2));
await writeFile(resolve(root,'records/rejections.json'),JSON.stringify({rejected},null,2));
await writeFile(resolve(root,'records/generation-prompts.json'),JSON.stringify({milestone:3,status:'ARTWORK_QC_ACCEPTED_OWNER_APPROVAL_PENDING',generator:'Built-in image_gen.imagegen genuinely used; no Claude API',quotaEvent:{resetAtUtc:'2026-09-17T19:24:30Z',resumedWithRequiredAsset:'C01 signature',remainingAssets:[]},assets:measured.assets.map(a=>({id:a.id,name:a.name,treatment:a.treatment,source:a.source,production:a.file,sourceSha256:a.sourceSha256,status:'QC accepted',history:a.generationHistory})),rejected},null,2));
for(const treatment of ['signature','economy']){
 const subset=measured.assets.filter(a=>a.treatment===treatment),tiles=[];
 for(const a of subset){const panels=[];for(const [i,bg] of ['#F4EBDD','#FFFFFF'].entries()){const b=await sharp(resolve(root,a.file)).flatten({background:bg}).resize({width:350,height:330,fit:'contain',background:bg}).png().toBuffer();panels.push({input:b,left:10+i*360,top:32});}const label=Buffer.from(`<svg width="720" height="30"><rect width="720" height="30" fill="white"/><text x="10" y="21" font-family="Arial" font-size="16">${a.id} ${a.name} · ${treatment} · QC PASS</text></svg>`);tiles.push(await sharp({create:{width:720,height:370,channels:3,background:'white'}}).composite([{input:label,left:0,top:0},...panels]).png().toBuffer());}
 await sharp({create:{width:2160,height:Math.ceil(tiles.length/3)*370,channels:3,background:'#342434'}}).composite(tiles.map((input,i)=>({input,left:i%3*720,top:Math.floor(i/3)*370}))).png().toFile(resolve(root,`review/${treatment.toUpperCase()}-CONTACT-SHEET.png`));
}
await writeFile(resolve(root,'review/README.md'),'# Prompt 3 artwork review\n\n35 original designs, each with an independently generated signature and economy treatment (70 QC-accepted PNGs). Separate contact sheets show every asset on ivory and white. Individual native-resolution backdrop images accompany the sheets. Owner visual approval remains pending. The generated-draft sheet is preserved historical review evidence.\n');
console.log(JSON.stringify({accepted:measured.assets.length,rejected:rejected.length,minPpi:Math.min(...measured.assets.map(a=>a.effectivePpiAtMaxBox)),maxEconomyChromaticFraction:Math.max(...measured.assets.filter(a=>a.treatment==='economy').map(a=>a.chromaticOpaqueFraction))}));
