export async function preflight(page,resources) {
  await page.evaluate(async()=>{
    await Promise.all([document.fonts.load('400 16px "Bodoni Moda"'),document.fonts.load('italic 400 16px "Bodoni Moda"'),document.fonts.load('400 16px "Source Sans 3"'),document.fonts.load('600 16px "Source Sans 3"')]);
    await document.fonts.ready;
    await Promise.all([...document.images].map(image=>image.decode()));
  });
  return page.evaluate(()=>{
    const issues=[];const pxMm=96/25.4;
    const illustrations=[...document.querySelectorAll('img[data-artwork-id]')].map(image=>{
      const b=image.getBoundingClientRect(),root=image.closest('.design').getBoundingClientRect();
      if(!b.width||!b.height)return{id:image.dataset.artworkId,treatment:image.dataset.treatment,hidden:true};
      const ppi=Math.max(image.naturalWidth/(b.width/pxMm),image.naturalHeight/(b.height/pxMm))*25.4;
      if(!image.complete||!image.naturalWidth)issues.push(`Artwork decode failed: ${image.dataset.artworkId}`);
      if(ppi<300)issues.push(`Artwork below 300 ppi: ${image.dataset.artworkId}`);
      if(b.left<root.left-.75||b.top<root.top-.75||b.right>root.right+.75||b.bottom>root.bottom+.75)issues.push(`Artwork outside page: ${image.dataset.artworkId}`);
      return{id:image.dataset.artworkId,treatment:image.dataset.treatment,ppi,boxMm:[b.width/pxMm,b.height/pxMm]};
    });
    if(document.querySelector('[data-development-motif],[data-artwork-status="development-only"]'))issues.push('Development artwork remains');
    const fonts=[...document.fonts].map(f=>({family:f.family,style:f.style,weight:f.weight,status:f.status}));
    for(const f of fonts)if(f.status!=='loaded')issues.push(`Font failed: ${f.family}/${f.style}/${f.weight}`);
    for(const root of document.querySelectorAll('.design')) {
      const bounds=root.getBoundingClientRect();
      const elements=[...root.querySelectorAll('.field,h1,.kicker,.instructions,.activity-grid,.word-list,.activity-footer,.moon-phases,.crescent,.welcome-greeting,.divider')];
      for(const el of elements){
        const b=el.getBoundingClientRect();
        if(b.width===0||b.height===0)continue;
        const inset=root.classList.contains('activity')?5:9;
        if(b.left<bounds.left+inset*pxMm-.75||b.right>bounds.right-inset*pxMm+.75||b.top<bounds.top+inset*pxMm-.75||b.bottom>bounds.bottom-inset*pxMm+.75)issues.push(`Out of safe content area: ${el.dataset.field||el.className}`);
        if(el.scrollWidth>el.clientWidth+2 || (['hidden','clip','auto','scroll'].includes(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight+2))issues.push(`Clipped: ${el.dataset.field||el.className}`);
        if(el.classList.contains('field')&&el.scrollHeight>el.clientHeight+3)issues.push(`Text exceeds allocated field height: ${el.dataset.field}`);
      }
      const fields=[...root.querySelectorAll('.field')];
      for(let i=0;i<fields.length;i++)for(let j=i+1;j<fields.length;j++){
        const a=fields[i].getBoundingClientRect(),b=fields[j].getBoundingClientRect();
        if(a.left<b.right&&a.right>b.left&&a.top<b.bottom-.75&&a.bottom>b.top+.75)issues.push(`Field overlap: ${fields[i].dataset.field}/${fields[j].dataset.field}`);
      }
      if(root.classList.contains('activity')){
        const grid=root.querySelector('.activity-grid').getBoundingClientRect(),list=root.querySelector('.word-list').getBoundingClientRect(),instructions=root.querySelector('.instructions').getBoundingClientRect();
        if(grid.top<instructions.bottom||list.top<grid.bottom)issues.push('Activity elements overlap');
      }
    }
    const utility=[...document.querySelectorAll('.date,.time,.venue,.address,.host,.rsvp,.word,.cell,.instructions')].map(el=>parseFloat(getComputedStyle(el).fontSize)*72/96);
    const artworkSlots=[...document.querySelectorAll('[data-artwork-slot]')].map(el=>{const root=el.closest('.design'),a=root.getBoundingClientRect(),b=el.getBoundingClientRect();return{id:el.dataset.artworkSlot,status:el.dataset.artworkStatus||'development-only',boxMm:[(b.left-a.left)/pxMm,(b.top-a.top)/pxMm,b.width/pxMm,b.height/pxMm],master:root.dataset.master};});
    return {issues,fonts,artworkSlots,illustrations,minimumUtilityPt:Math.min(...utility),sheetCount:document.querySelectorAll('.sheet').length};
  });
}
