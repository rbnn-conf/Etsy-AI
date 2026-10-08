/** Shared by the production renderer and the customer's offline preview. */
export async function probeDocument(doc,catalogue=[],masks={}){
  await doc.fonts.ready;
  const issues=[],fields=[],artwork=[];
  try{await Promise.all([...doc.images].map(image=>image.decode()));}
  catch{issues.push('Artwork failed to load. Reopen the original editor folder.');}
  const pxPerMm=96/25.4;
  const rect=r=>({left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
  for(const root of doc.querySelectorAll('.design')){
    const bounds=root.getBoundingClientRect(),safe=Number(root.dataset.safeMm??9)*pxPerMm;
    // Category floors are print sizes, not viewport-dependent screen sizes.
    const floors={S01:{eventTitle:20,date:11,time:10,venue:11,address:10,host:10,rsvp:9.5,dressCode:11},S03:{eventTitle:38,host:11,subtitle:12,motto:17},S02:{title:21,arrival:10.5,dress:10.5,details:10.5,contact:9},S09:{title:32,subtitle:12,detail:16},S10:{title:32,subtitle:12,detail:16},S11:{title:22,firstName:14.5,mainName:14.5,dessertName:14.5,firstDetail:10.5,mainDetail:10.5,dessertDetail:10.5,footer:9.5},S12:{title:24},S13:{names:17},S14:{labels:15,note:9},S15:{detail:9},S16:{message:15,host:9.5},S17:{title:30,prompt:12,nameLabel:11},S18:{title:22,message:13.5,signoff:10.5}};
    const master=root.dataset.master;
    const local=[];
    for(const el of root.querySelectorAll('.field')){
      if(!el.textContent.trim())continue;
      const r=el.getBoundingClientRect(),style=doc.defaultView.getComputedStyle(el),label=el.dataset.field;
      if(r.top<bounds.top+safe-1||r.left<bounds.left+safe-1||r.right>bounds.right-safe+1||r.bottom>bounds.bottom-safe+1)issues.push(`Text outside safe area: ${label}`);
      if(el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+2)issues.push(`Text does not fit: ${label}`);
      const pt=parseFloat(style.fontSize)*72/96;
      const minimum=floors[master]?.[label]??(/^S0[4-8]$/.test(master)?({title:44,subtitle:14,message:17,footer:17}[label]??9):master==='S12'?(label.startsWith('drink')?13:9.5):master==='S15'?14:9);
      if(pt<minimum-.01)issues.push(`Text is too small: ${label} (minimum ${minimum} pt)`);
      const value={master:root.dataset.master,label,pt,bounds:rect(r)};fields.push(value);local.push(value);
    }
    for(const el of root.querySelectorAll('.collection-line,.utility-label,.kicker')){
      const pt=parseFloat(doc.defaultView.getComputedStyle(el).fontSize)*72/96;
      if(pt<9-.01)issues.push('Caption is below the 9 pt print minimum');
    }
    for(let i=0;i<local.length;i++)for(let j=i+1;j<local.length;j++){
      const a=local[i].bounds,b=local[j].bounds;
      if(a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1)issues.push(`Text overlaps: ${local[i].label} / ${local[j].label}`);
    }
    const words=[];
    for(const el of root.querySelectorAll('.field'))if(el.firstChild?.nodeType===3)for(const match of el.textContent.matchAll(/\S+/gu)){
      const range=doc.createRange();range.setStart(el.firstChild,match.index);range.setEnd(el.firstChild,match.index+match[0].length);
      for(const r of range.getClientRects())words.push({label:el.dataset.field,r});
    }
    for(const image of root.querySelectorAll('img[data-artwork-id]')){
      const r=image.getBoundingClientRect();if(r.width<.1||r.height<.1)continue;
      const scale=Math.min(image.clientWidth/image.naturalWidth,image.clientHeight/image.naturalHeight);
      const w=image.naturalWidth*scale,h=image.naturalHeight*scale;
      const minWidth=catalogue.find(a=>a.id===image.dataset.artworkId)?.minWidthMm??0;
      const widthMm=w/pxPerMm,heightMm=h/pxPerMm,ppi=25.4/scale*pxPerMm;
      if(ppi<299.9)issues.push(`Artwork resolution below 300 dpi: ${image.dataset.artworkId}`);
      if(widthMm<minWidth-.35)issues.push(`Artwork below approved minimum size: ${image.dataset.artworkId} (${widthMm.toFixed(2)} mm)`);
      if(r.left<bounds.left-1||r.top<bounds.top-1||r.right>bounds.right+1||r.bottom>bounds.bottom+1)issues.push(`Artwork outside trim: ${image.dataset.artworkId}`);
      artwork.push({master:root.dataset.master,id:image.dataset.artworkId,treatment:image.dataset.treatment,widthMm,heightMm,ppi,pixels:[image.naturalWidth,image.naturalHeight]});
      const maskEntry=masks[image.dataset.treatment]?.[image.dataset.artworkId],mask=maskEntry?.mask??maskEntry;
      if(mask){
        const pixels=doc.defaultView.atob(mask.data),matrix=new doc.defaultView.DOMMatrix(doc.defaultView.getComputedStyle(image).transform),angle=Math.atan2(matrix.b,matrix.a),cos=Math.cos(angle),sin=Math.sin(angle);
        for(const word of words){
          const q=word.r,x0=Math.max(q.left,r.left),x1=Math.min(q.right,r.right),y0=Math.max(q.top,r.top),y1=Math.min(q.bottom,r.bottom);
          if(x1<=x0||y1<=y0)continue;
          let occupied=0,total=0;
          for(let py=y0+1;py<y1;py+=2)for(let px=x0+1;px<x1;px+=2){
            total++;
            const dx=px-(r.left+r.right)/2,dy=py-(r.top+r.bottom)/2;
            const mx=Math.floor(((cos*dx+sin*dy)/w+.5)*mask.width),my=Math.floor(((-sin*dx+cos*dy)/h+.5)*mask.height);
            if(mx>=0&&mx<mask.width&&my>=0&&my<mask.height&&pixels.charCodeAt(my*mask.width+mx)>64)occupied++;
          }
          if(occupied>1&&occupied/total>.02)issues.push(`Artwork overlaps wording: ${word.label} / ${image.dataset.artworkId}`);
        }
      }
    }
  }
  if(!doc.querySelector('.design'))issues.push('No printable page found');
  return {issues:[...new Set(issues)],fields,artwork,pageCount:doc.querySelectorAll('.sheet').length};
}
