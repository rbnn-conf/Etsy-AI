// Moonlit Meadow: the premium editorial theme for crochet pattern documents
// (PROTOTYPE, not yet used by the Stage 2 adapter). Design as data: every
// colour, size and spacing the components use lives here, so a template never
// hard-codes styling. Presentation only: nothing here touches pattern text.
import { readFile } from 'node:fs/promises';
import { fontkit, rgb } from '../../lib.mjs';

const hex=h=>{const n=parseInt(h.slice(1),16);return rgb(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255);};

// Roles, not swatches. Ivory dominates; rose marks labels and badges; gold is
// a hairline accent only (frame, moon, footer rule); sage draws the botanicals
// and icons. Text colours keep AA contrast on ivory and white.
export const PALETTE=Object.freeze({
  ivory:'#FAF5EC',      // reference pages and cards
  cream:'#F3EADB',      // card fill
  blush:'#F3E1DA',      // instruction section bars
  blushDeep:'#E9CBC1',  // badge outline
  rose:'#9E5A57',       // labels, badges, numerals
  sage:'#8C9C7E',       // botanicals, icons
  olive:'#6E7550',      // leaf strokes
  taupe:'#7A6A5E',      // secondary text
  ink:'#3A302C',        // body text
  gold:'#B3955C',       // hairlines, moon
  line:'#E4D8C8',       // dividers
  white:'#FFFFFF'});
export const COLOURS=Object.freeze(Object.fromEntries(Object.entries(PALETTE).map(([k,v])=>[k,hex(v)])));

// Type roles (pt). Body never below 10 pt, leading ~1.48 for instructions.
// Letter-spacing (tracking, pt) stays at or below ~0.09 em: wider spacing makes PDF
// readers extract "C O N T E N T S" (copy, search and screen readers break).
export const TYPE=Object.freeze({
  coverBrand:{font:'display',size:40,leading:46,tracking:2.2},
  coverSub:{font:'italic',size:17,leading:22},
  pageTitle:{font:'display',size:30,leading:35},
  patternName:{font:'display',size:30,leading:35},
  meta:{font:'italic',size:12.5,leading:17},
  section:{font:'serif',size:12.5,leading:17},
  cardTitle:{font:'bold',size:7.5,leading:10,tracking:0.7},
  kicker:{font:'bold',size:7.5,leading:10,tracking:0.7},
  body:{font:'body',size:10.5,leading:15.5},
  bodyStrong:{font:'bold',size:10.5,leading:15.5},
  small:{font:'body',size:9,leading:12.5},
  smallStrong:{font:'bold',size:9,leading:12.5},
  badge:{font:'bold',size:9,leading:12.5},
  numeral:{font:'display',size:12,leading:15.5},
  folio:{font:'display',size:9,leading:11},
  running:{font:'body',size:7.5,leading:10,tracking:0.6}});

// Page geometry (mm): inside every home printer's unprintable edge.
export const GEOMETRY=Object.freeze({margin:{top:24,bottom:22,side:20},footerY:11.5,headerY:13,frameInset:9,
  // measure: the reading-text column (instructions, assembly, finishing, notes): ~85 characters
  // per line at 10.5 pt (owner target 82-88; measured on #016: 84.8 average). Same on A4 and Letter.
  measure:130,labelCol:21,labelGap:3,cardPad:4.5,cardRadius:2.5,sectionBar:7.5});

// Page background per page kind. Instruction pages stay white (light on ink;
// the printing guide promises mostly text on white); reference pages are ivory.
export const PAGE_TINT=Object.freeze({cover:'ivory',welcome:'ivory',index:'ivory',materials:'ivory',abbreviations:null,pattern:null,combinations:'ivory',back:'ivory',guide:null});

const font=p=>new URL(`../../../../${p}`,import.meta.url);
export const FONT_FILES=Object.freeze({
  display:font('products/003-midnight-seance/fonts/BodoniModa-Regular.ttf'),     // high-contrast headings
  displayItalic:font('products/003-midnight-seance/fonts/BodoniModa-Italic.ttf'),
  serif:font('marketing/assets/fonts/Spectral-SemiBold.ttf'),                      // section headings
  italic:font('marketing/assets/fonts/Spectral-Italic.ttf'),                       // subtitles, captions
  body:font('products/003-midnight-seance/fonts/SourceSans3-Regular.otf'),         // instructions: humanist, very legible
  bold:font('products/003-midnight-seance/fonts/SourceSans3-Semibold.otf')});      // labels, badges, small caps

/** The theme: brand line, cover wording and optional decorative asset overrides (PNG paths). */
export const MOONLIT_MEADOW=Object.freeze({
  id:'moonlit-meadow',brand:'Moonlit Meadow',
  // Cover fact line: count and terms are computed; the wording is the owner's.
  coverLine:({count,terms})=>`${count} crochet bouquet patterns • ${terms} terms`,   // flowers, foliage, stem, wrap and vase: all bouquet pieces
  coverNote:'Digital pattern collection to print at home',
  maker:'LUMIUMX',
  // Display crops (fractions) for the approved Stage 1 illustrations, which carry their
  // lettering in a top band: a frame shows the artwork below it, never the baked-in text.
  crops:{hero:{x:0,y:0.235,w:1,h:0.6},overview:{x:0.02,y:0.21,w:0.96,h:0.66},detail:{x:0.06,y:0.27,w:0.88,h:0.47}},
  assets:{}});

let cache=null;
export async function loadMoonlitFonts(){
  if(!cache)cache=(async()=>{const out={};for(const [k,url] of Object.entries(FONT_FILES)){const bytes=await readFile(url);out[k]={bytes,face:fontkit.create(bytes)};}return out;})();
  return cache;
}
