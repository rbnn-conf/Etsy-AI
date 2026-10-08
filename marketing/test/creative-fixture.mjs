// Synthetic crochet Stage 3 facts and artwork for the creative-direction tests
// (ADR-058). No product files, no model, no network: renders and pages are
// small solid PNGs with the real aspect ratios.
import { createHash } from 'node:crypto';
import { sharp } from '../../production/src/lib.mjs';
import { crochetPatternBundle } from '../src/stage3/adapters/crochet-pattern-bundle.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const PATTERNS=[['garden-rose','Garden Rose','Intermediate'],['moon-peony','Moon Peony','Experienced'],['blush-tulip','Blush Tulip','Easy'],
  ['wild-sunflower','Wild Sunflower','Beginner'],['sage-eucalyptus','Sage Eucalyptus','Easy'],['twilight-lily','Twilight Lily','Experienced']];
const TEXT_FREE={bouquet:.235,overview:.21,detail:.27};
const depicts=items=>items.map(([pattern_id,quantity])=>({pattern_id,pattern_name:PATTERNS.find(p=>p[0]===pattern_id)[1],quantity}));
export const RENDER_ITEMS={bouquet:depicts([['garden-rose',1],['blush-tulip',2],['sage-eucalyptus',2]]),overview:depicts(PATTERNS.map(p=>[p[0],1])),detail:depicts([['garden-rose',1]])};

export function creativeFacts({renders=true,levels=['Beginner','Easy','Intermediate','Experienced']}={}){
  const f={schema_version:1,product_id:'900',product_name:'Fixture Meadow Crochet Bouquet Pattern Bundle',product_type:'Crochet flower bouquet pattern bundle',product_format:'crochet-pattern-bundle',
    theme:'Crochet flower bouquets',season:null,target_customer:'adults',
    patterns:{count:PATTERNS.length,list:PATTERNS.map(([pattern_id,name,level],i)=>({pattern_id,number:i+1,name,category:'flower',level})),categories:['flower']},
    terminology:'US',skill_levels:levels,skill_text:levels.length>1?`${levels[0]} to ${levels.at(-1)}`:levels[0],combinations:null,
    formats:[{key:'A4',label:'A4',files:7},{key:'US-Letter',label:'US Letter',files:7}],printing_guide:true,individual_pattern_pdfs:true,
    selection:{inside:'garden-rose',collage:PATTERNS.map(p=>p[0]),detail:renders?'garden-rose':null,feature:'moon-peony'},
    renders:renders?Object.entries(RENDER_ITEMS).map(([role,d])=>({role,asset:`proof-${role}`,file:`proofs/${role}.png`,sha256:'0'.repeat(64),width:1024,height:1536,kind:'illustration',
      photographic_evidence:false,depicts:d,text_free:{x:0,y:TEXT_FREE[role],w:1,h:+(1-TEXT_FREE[role]).toFixed(4)}})):[],
    stitch_counts:false,integrity:{all_tested:false,verification:{tested:0,unverified:6}},artwork:{hero:{photographic_evidence:false}},
    deliverables:{step_by_step_instructions:true},visuals:{visual_match_status:'internally_checked',physically_verified:false,pattern_facts:[],pictured:{combination:'Fixture posy',items:RENDER_ITEMS.bouquet}},
    process_claims:['handmade','handcrafted','made by hand'],page_quantity:{total_pages:60,content_pages:6,content:'pattern'},item_quantity:{count:6,noun:'pattern'},
    digital_download:true,physical_item:false,editable:false,package:{parts:1},style:{mood:null}};
  f.claims=crochetPatternBundle.claimIndex(f);
  return f;
}

async function png(w,h,colour,key,alt){
  const bytes=await sharp({create:{width:w,height:h,channels:3,background:colour}}).png().toBuffer();
  return {key,alt,uri:`data:image/png;base64,${bytes.toString('base64')}`,sha256:sha(bytes),width:w,height:h};
}
/** prepareArt()'s shape: documents, pattern pages and the three approved renders (with depicts and text_free). */
export async function creativeArt(facts){
  const page=(k,c)=>png(1240,1754,c,k,k);   // A4 at 150 dpi, as Stage 3 renders the PDFs
  const A={cover:await page('doc-cover','#F3E9DD'),index:await page('doc-index','#FAF5EC'),materials:await page('doc-materials','#F5EEE2'),
    abbreviations:await page('doc-abbreviations','#F7F0E4'),guide:await page('doc-guide','#FFFDF8'),pages:{},renders:{}};
  for(const p of facts.patterns.list)A.pages[p.pattern_id]=await page(`pattern-${p.number}`,'#FBF6EE');
  for(const r of facts.renders){const a=await png(1024,1536,'#E9C9C0',`render-${r.role}`,`Approved ${r.role} render`);A.renders[r.role]={...a,role:r.role,depicts:r.depicts,text_free:r.text_free,ground:'#ede3d3'};}
  A.manifest=[A.cover,A.index,A.materials,A.abbreviations,A.guide,...Object.values(A.pages),...Object.values(A.renders)].map(({uri,...x})=>x);
  return A;
}
