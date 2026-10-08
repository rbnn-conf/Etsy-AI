/** Physical coordinates only: never scale finished stationery to fit a carrier. */
export function impose({paper, finished, count, margin=10, gap=4}) {
  if (![...paper,...finished,margin,gap,count].every(Number.isFinite) ||
      paper.some(n=>n<=0) || finished.some(n=>n<=0) || margin<0 || gap<0 ||
      !Number.isInteger(count) || count<1) throw new Error('Invalid print geometry');
  const [pw,ph]=paper,[w,h]=finished;
  const columns=Math.floor((pw-2*margin+gap)/(w+gap));
  const rows=Math.floor((ph-2*margin+gap)/(h+gap));
  if(columns<1 || rows<1) throw new Error('Finished item requires a separate reflowed paper edition');
  const capacity=columns*rows;
  const left=(pw-(columns*w+(columns-1)*gap))/2;
  const top=(ph-(rows*h+(rows-1)*gap))/2;
  return Array.from({length:Math.ceil(count/capacity)},(_,page)=>({
    paperMm:[pw,ph],
    placements:Array.from({length:Math.min(capacity,count-page*capacity)},(_,index)=>({
      item:page*capacity+index,
      xMm:left+(index%columns)*(w+gap),
      yMm:top+Math.floor(index/columns)*(h+gap),
      widthMm:w,heightMm:h
    }))
  }));
}

export function trimSegments({xMm:x,yMm:y,widthMm:w,heightMm:h},offset=1,length=2) {
  return [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].flatMap(([cx,cy],i)=>{
    const dx=i%2===0?-1:1,dy=i<2?-1:1;
    return [
      [cx+dx*offset,cy,cx+dx*(offset+length),cy],
      [cx,cy+dy*offset,cx,cy+dy*(offset+length)]
    ];
  });
}
