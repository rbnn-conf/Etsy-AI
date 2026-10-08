// Crochet pattern document design system (ADR-041): a premium, readable
// printable. Warm cream, soft blush, muted rose, sage and a little lavender;
// warm charcoal/brown type. Instruction pages stay white with small tinted
// panels (no ink-heavy backgrounds); the accent is used sparingly, for labels
// and rules. Generic: nothing here is specific to flowers.
import { readFile } from 'node:fs/promises';
import { fontkit, rgb } from '../lib.mjs';

const hex=h=>{const n=parseInt(h.slice(1),16);return rgb(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255);};
export const COLOURS=Object.freeze({
  ink:hex('#3A3230'),       // body text: warm charcoal
  soft:hex('#6B5A4E'),      // secondary text: warm brown
  rose:hex('#A8605F'),      // accent: labels, rules, numbers (AA on white at label sizes)
  blush:hex('#F4E3DE'),     // tinted panels
  cream:hex('#FBF6EE'),     // cover field, index rows
  sage:hex('#7E9A7A'),      // secondary accent: materials markers
  sageTint:hex('#E8EFE5'),
  lavender:hex('#9A8DBB'),  // sparing: difficulty badges
  lavenderTint:hex('#EEEAF5'),
  line:hex('#E2D6CC'),
  white:rgb(1,1,1)});
// Type scale (pt). Body never below 10 pt; leading about 1.45.
export const TYPE=Object.freeze({
  coverTitle:{size:30,leading:36},display:{size:22,leading:27},h2:{size:14,leading:19},h3:{size:11.5,leading:16},
  body:{size:10.5,leading:15.2},small:{size:9,leading:12.5},label:{size:8,leading:11,tracking:0.8},
  folio:{size:8,leading:10}});
// Page geometry (mm). Inside every home printer's unprintable edge.
export const GEOMETRY=Object.freeze({margin:{top:20,bottom:20,side:18},headerGap:8,footerY:10});
export const PAPERS=Object.freeze({'A4':{w:210,h:297,label:'A4'},'US-Letter':{w:215.9,h:279.4,label:'US Letter'}});

const FONT_FILES=Object.freeze({
  display:new URL('../../../marketing/assets/fonts/Spectral-SemiBold.ttf',import.meta.url),
  italic:new URL('../../../marketing/assets/fonts/Spectral-Italic.ttf',import.meta.url),
  body:new URL('../../../products/003-midnight-seance/fonts/SourceSans3-Regular.otf',import.meta.url),
  bold:new URL('../../../products/003-midnight-seance/fonts/SourceSans3-Semibold.otf',import.meta.url)});
let cache=null;
/** The document fonts: bytes (for embedding) and fontkit faces (for measuring and glyph checks). */
export async function loadFonts(){
  if(!cache)cache=(async()=>{
    const out={};
    for(const [k,url] of Object.entries(FONT_FILES)){const bytes=await readFile(url);out[k]={bytes,face:fontkit.create(bytes)};}
    return out;
  })();
  return cache;
}
/** Width of text in pt, exactly as pdf-lib lays it out (fontkit shaping). */
export const widthOf=(font,text,size)=>font.face.layout(text).advanceWidth*size/font.face.unitsPerEm;
/** Code points the font cannot draw (never silently replaced). */
export const missingGlyphs=(font,text)=>[...new Set([...String(text)].filter(ch=>ch.trim()&&!font.face.hasGlyphForCodePoint(ch.codePointAt(0))))];
