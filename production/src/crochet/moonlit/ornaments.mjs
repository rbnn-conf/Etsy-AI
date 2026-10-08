// Moonlit Meadow decorative assets: deterministic vector line art, defined
// once and reused on every page (no image generation, no per-page asset).
// Each asset is SVG path data in its own view box (y down). A theme may
// override an asset with a PNG path; a missing or disabled asset is simply
// not drawn, and the document still lays out identically.
const r=n=>Math.round(n*100)/100;
const P=(x,y)=>`${r(x)} ${r(y)}`;
const rad=d=>d*Math.PI/180;
/** An almond leaf from (x,y), `len` long, at `angle` degrees. */
function leaf(x,y,len,w,angle){
  const a=rad(angle), dx=Math.cos(a), dy=Math.sin(a), nx=-dy, ny=dx, tx=x+dx*len, ty=y+dy*len, mx=x+dx*len*0.5, my=y+dy*len*0.5;
  return `M${P(x,y)} Q${P(mx+nx*w,my+ny*w)} ${P(tx,ty)} Q${P(mx-nx*w,my-ny*w)} ${P(x,y)} Z`;
}
const circle=(cx,cy,R)=>`M${P(cx-R,cy)} A${r(R)} ${r(R)} 0 1 0 ${P(cx+R,cy)} A${r(R)} ${r(R)} 0 1 0 ${P(cx-R,cy)} Z`;
/** A five-petal blossom of radius R. */
function blossom(cx,cy,R,petals=5){
  const out=[];
  for(let i=0;i<petals;i++)out.push(leaf(cx,cy,R,R*0.42,-90+i*360/petals));
  return out.join(' ');
}
/** Crescent: outer circle minus an offset inner circle. */
function crescent(cx,cy,R,off=0.34,r2=0.86){
  const c2x=cx+R*off, c2y=cy-R*off*0.75, R2=R*r2;
  const d=Math.hypot(c2x-cx,c2y-cy), a=(R*R-R2*R2+d*d)/(2*d), h=Math.sqrt(R*R-a*a);
  const ux=(c2x-cx)/d, uy=(c2y-cy)/d, px=cx+a*ux, py=cy+a*uy;
  const p1=[px+h*uy,py-h*ux], p2=[px-h*uy,py+h*ux];
  return `M${P(...p1)} A${r(R)} ${r(R)} 0 1 0 ${P(...p2)} A${r(R2)} ${r(R2)} 0 1 1 ${P(...p1)} Z`;
}

const S={stroke:'sage',width:0.9}, LEAF={stroke:'olive',fill:'sage',width:0.4,opacity:0.55}, GOLD={fill:'gold'}, ROSE={stroke:'rose',fill:'blush',width:0.6};

// Horizontal sprig: a gently curved stem with alternating leaves (header flanks, dividers).
function sprig(){
  const parts=[{d:`M${P(4,30)} C${P(30,22)} ${P(60,38)} ${P(116,28)}`,...S}];
  // Leaves point towards the tip, alternately above (-) and below (+) the stem.
  for(const [x,y,ang] of [[20,27,-38],[34,29,40],[50,31,-36],[66,32,38],[82,31,-34]])parts.push({d:leaf(x,y,14,4.2,ang),...LEAF});
  parts.push({d:blossom(112,28,6),...ROSE},{d:circle(112,28,1.6),fill:'gold'});
  return {box:[120,56],parts};
}
// Corner branch for frames: an arc with leaves and two small blossoms, drawn for the top-left corner.
function corner(){
  const parts=[{d:`M${P(6,94)} C${P(6,48)} ${P(30,14)} ${P(94,6)}`,...S},{d:`M${P(14,60)} C${P(24,52)} ${P(32,48)} ${P(44,46)}`,...S}];
  for(const [x,y,a] of [[10,74,-30],[14,58,200],[22,40,-60],[34,26,170],[50,16,-80],[66,10,150]])parts.push({d:leaf(x,y,14,4.4,a),...LEAF});
  parts.push({d:blossom(46,46,7),...ROSE},{d:circle(46,46,1.8),fill:'gold'});
  parts.push({d:blossom(86,8,5),...ROSE},{d:circle(86,8,1.3),fill:'gold'});
  return {box:[100,100],parts};
}
export const ORNAMENTS=Object.freeze({
  moon:{box:[100,100],parts:[{d:crescent(50,52,40),...GOLD}]},
  sprig:sprig(),
  corner:corner(),
  // Filled petals and a gold centre: reads as a flower at icon size, never as an asterisk (a crochet repeat mark).
  flower:{box:[100,100],parts:[{d:blossom(50,50,40,5),stroke:'rose',fill:'blush',width:5},{d:circle(50,50,10),fill:'gold'}]},
  leaf:{box:[100,40],parts:[{d:`M${P(2,20)} L${P(98,20)}`,stroke:'sage',width:3},{d:leaf(30,20,30,9,-35),...LEAF,width:2},{d:leaf(55,20,30,9,35),...LEAF,width:2},{d:leaf(78,20,22,7,-30),...LEAF,width:2}]},
  yarn:{box:[100,100],parts:[{d:circle(48,48,36),stroke:'sage',width:4},
    {d:`M${P(18,34)} C${P(38,30)} ${P(62,44)} ${P(80,64)} M${P(14,52)} C${P(36,46)} ${P(58,60)} ${P(70,80)} M${P(26,20)} C${P(46,24)} ${P(70,38)} ${P(84,46)}`,stroke:'sage',width:4},
    {d:`M${P(74,76)} C${P(84,86)} ${P(92,84)} ${P(96,94)}`,stroke:'sage',width:4}]},
  hook:{box:[100,100],parts:[{d:`M${P(16,90)} L${P(78,22)} M${P(78,22)} C${P(86,12)} ${P(96,18)} ${P(90,28)} C${P(86,34)} ${P(80,30)} ${P(82,26)}`,stroke:'sage',width:4},
    {d:`M${P(34,66)} L${P(46,52)}`,stroke:'sage',width:10}]},
  scissors:{box:[100,100],parts:[{d:circle(26,74,14),stroke:'sage',width:4},{d:circle(74,74,14),stroke:'sage',width:4},
    {d:`M${P(36,64)} L${P(76,8)} M${P(64,64)} L${P(24,8)}`,stroke:'sage',width:4}]},
  ruler:{box:[100,100],parts:[{d:`M${P(10,36)} L${P(90,36)} L${P(90,64)} L${P(10,64)} Z`,stroke:'sage',width:4},
    {d:[22,34,46,58,70,82].map((x,i)=>`M${P(x,36)} L${P(x,i%2?48:54)}`).join(' '),stroke:'sage',width:4}]},
  dot:{box:[10,10],parts:[{d:circle(5,5,2.2),fill:'gold'}]}});

/** An asset as a standalone SVG document (for review or reuse outside the PDF). */
export function ornamentSvg(name,palette){
  const o=ORNAMENTS[name], c=k=>k?palette[k]:'none';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${o.box[0]} ${o.box[1]}">${o.parts.map(p=>
    `<path d="${p.d}" fill="${c(p.fill)}" stroke="${c(p.stroke)}" stroke-width="${p.width??0}" stroke-linecap="round" stroke-linejoin="round"${p.opacity?` fill-opacity="${p.opacity}"`:''}/>`).join('')}</svg>`;
}
