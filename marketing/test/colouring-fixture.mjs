// Shared fixture for the colouring-book Stage 3 tests: facts and art for a 10-page book (cover + 9 pages) in either
// orientation. Synthetic images only; no model, no network, nothing product-specific.
import { sharp } from '../../production/src/lib.mjs';

const SHA=n=>String(n).padStart(2,'0').repeat(32);
export async function artItem(key,w,h,n){
  const bytes=await sharp({create:{width:w,height:h,channels:3,background:{r:230-n*5,g:230,b:225}}}).png().toBuffer();
  return {key,alt:key,uri:`data:image/png;base64,${bytes.toString('base64')}`,sha256:SHA(n),width:w,height:h,source:{file:key,sha256:SHA(n)}};
}
export async function book(orientation='landscape',{season='Autumn'}={}){
  const [pw,ph]=orientation==='landscape'?[1400,933]:orientation==='square'?[1200,1200]:[933,1400], pages=[];
  for(let i=1;i<=10;i++)pages.push({page_number:i,title:`Page ${i}`,role:i===1?'cover':'page',asset:`P${i}`,file:`p${i}.png`,sha256:SHA(i),width:pw,height:ph});
  const colouring=pages.slice(1), showcase=[2,6,10];
  const facts={product_id:'999',product_name:'Test Book',product_type:'Colouring book',product_format:'colouring-book',season,target_customer:'adults',
    book:{page_count:10,colouring_pages:9,cover:true,orientation,page_px:[pw,ph],non_colouring_pages:[{page_number:1,kind:'cover',title:'Page 1'}]},pages,
    selection:{cover:1,lead:1,showcase,collage:colouring.map(p=>p.page_number),example:2,pages_used:pages.map(p=>p.page_number)},
    formats:[{key:'A4',label:'A4'},{key:'US-Letter',label:'US Letter'},{key:'Colouring-Pages-PNG',label:'PNG pages'}],png_pages:true,printing_guide:true,line_art:true,
    sheet_preview:{file:'sheet.png',sha256:SHA(50),label:'A4'},
    page_quantity:{total_pages:10,content_pages:9,content:'colouring'},style:{subject:null,palette:null,mood:null},package:{parts:1},creative:null};
  const A={pages:{},manifest:[]};
  for(const p of pages)A.pages[p.page_number]=await artItem(`page-${p.page_number}`,pw,ph,p.page_number);
  A.lead=A.pages[1];A.sheet=await artItem('sheet',orientation==='landscape'?842:596,orientation==='landscape'?596:842,50);A.guide=await artItem('guide',827,1170,60);
  return {facts,A};
}
