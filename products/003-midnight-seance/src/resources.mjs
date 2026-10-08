import { readFile,readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PRODUCT_ROOT, contained } from './paths.mjs';
import { generatePuzzle } from './games/word-search.mjs';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function jsonFile(path) {return JSON.parse(await readFile(contained(PRODUCT_ROOT,path),'utf8'));}
export async function loadResources() {
  const [tokens,schemas,defaults,games,qc,typography]=await Promise.all(['design/tokens.json','content/editable-fields.json','content/stationery.json','content/games.json','qc/config.json','design/typography.json'].map(jsonFile));
  const fontSpecs=[['Bodoni Moda','BodoniModa-Regular.ttf','normal',400,'truetype'],['Bodoni Moda','BodoniModa-Italic.ttf','italic',400,'truetype'],['Source Sans 3','SourceSans3-Regular.otf','normal',400,'opentype'],['Source Sans 3','SourceSans3-Semibold.otf','normal',600,'opentype']];
  let fonts='';const fontEvidence=[];
  for(const [family,file,style,weight,format] of fontSpecs) {
    const bytes=await readFile(contained(PRODUCT_ROOT,'fonts',file));
    fonts+=`@font-face{font-family:'${family}';src:url(data:font/${format};base64,${bytes.toString('base64')}) format('${format}');font-weight:${weight};font-style:${style};font-display:block;${family==='Bodoni Moda'?'ascent-override:95%;descent-override:25%;line-gap-override:0%;':''}}`;
    fontEvidence.push({family,file,style,weight,sha256:sha256(bytes),bytes:bytes.length});
  }
  const artwork={signature:{},economy:{}};
  const artworkManifest=await jsonFile('artwork/records/measured-assets.json');
  const usedArtworkIds=['A01','A02','A03','A04','A05','A06','B01','B02','C01','C02','C03','C04','E04','E05'];
  for(const asset of artworkManifest.assets)if(usedArtworkIds.includes(asset.id)){
    const bytes=await readFile(contained(PRODUCT_ROOT,'artwork',asset.file));
    if(sha256(bytes)!==asset.sha256)throw Error(`Artwork hash mismatch ${asset.id}/${asset.treatment}`);
    artwork[asset.treatment][asset.id]={src:`data:image/png;base64,${bytes.toString('base64')}`,pixels:asset.pixels};
  }
  const game=games.wordSearch,puzzle=generatePuzzle(game,qc.blockedStrings);
  async function sourceFiles(dir){const files=[];for(const e of await readdir(contained(PRODUCT_ROOT,dir),{withFileTypes:true}))e.isDirectory()?files.push(...await sourceFiles(`${dir}/${e.name}`)):files.push(`${dir}/${e.name}`);return files;}
  const sourceEvidence=[];
  for(const path of [...await sourceFiles('src'),'design/tokens.json','design/typography.json','design/layout-rules.json','content/stationery.json','content/editable-fields.json','content/games.json','qc/config.json','fonts/LICENSE-BodoniModa.txt','fonts/LICENSE-SourceSans3.md','design/reference/midnight-seance-concept-reference.png','package-lock.json'].sort())sourceEvidence.push({path,sha256:sha256(await readFile(contained(PRODUCT_ROOT,path)))});
  sourceEvidence.push({path:'artwork/records/measured-assets.json',sha256:sha256(await readFile(contained(PRODUCT_ROOT,'artwork/records/measured-assets.json')))});
  for(const asset of artworkManifest.assets)sourceEvidence.push({path:`artwork/${asset.file}`,sha256:asset.sha256});
  return {tokens,schemas,defaults,game,puzzle,qc,typography,fonts,artwork,artworkManifest,fontEvidence,sourceEvidence,sourceHash:sha256(JSON.stringify({sourceEvidence,fontEvidence}))};
}
