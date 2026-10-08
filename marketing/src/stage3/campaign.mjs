import { deriveStrategy } from './strategy.mjs';
import { STAGE3_ADAPTERS } from './adapters/index.mjs';

// Stage 3 campaign direction (deterministic data, not a template): colour
// tokens, environment-scene directions and the art-directed copy for each
// composition primitive. Seasonal styling lives here; the primitives
// (primitives.mjs) only read tokens, so a future product swaps direction,
// not code. All copy is rendered by code; factual phrases carry a claim key
// that is checked against the production facts.

/** Bump when compositions change, so cached renders are redone (free). */
export const CAMPAIGN_VERSION='2026-10-06.1';

const CHRISTMAS={
  name:'cozy-premium-christmas',
  tokens:{forest:'#1E3A2C',forestDeep:'#10231A',berry:'#8E2B35',berryDeep:'#4A1219',gold:'#C9A35B',goldLight:'#E8D3A2',
    cream:'#F8F1E4',paper:'#FBF7EF',linen:'#EFE5D3',ink:'#211A15',walnut:'#4A2B1A',walnutDeep:'#24140B',needle:'#2F5A3A',needleDark:'#1C3B26',berryFruit:'#B3242F'},
  // Environment only. The real Stage 2 artwork is composited on top by code.
  scenes:{
    tabletop:{purpose:'Hero and two-design tabletop.',allow:[],
      direction:'Premium cosy Christmas product-photography environment: warm walnut tabletop seen from slightly above, evergreen branches, red holly berries and subtle pinecones along the top and side edges, a lit candle, soft golden Christmas-light bokeh in the background, shallow depth of field, elegant traditional British Christmas mood. Keep a large clear tabletop area in the centre and lower middle, reserved for products added later.'},
    inside:{purpose:'An open card on a calm festive surface.',allow:[],
      direction:'Close, calm Christmas tabletop in warm candlelight: cream linen runner over dark wood, a few sprigs of fir and holly with berries at the right and top edges, soft warm bokeh behind, gentle shadows, quiet and intimate. Keep the centre and left two-thirds clear and even for a product added later.'},
    print:{purpose:'A home printing corner.',allow:['printer'],
      direction:'Warm, tidy home desk at Christmas: a modern white home printer on the far left of the desk with an empty paper tray, a small potted fir sprig, a mug, warm window light and golden fairy-light bokeh behind. Keep the right half and the whole foreground of the desk clear and empty for products added later.'},
    gift:{purpose:'A warm Christmas gifting moment.',allow:['envelope'],
      direction:'Christmas gifting still life: a wrapped present with kraft paper and red velvet ribbon and one blank, unmarked kraft envelope placed at the left edge, evergreen and berries, a candle, warm golden bokeh from a blurred Christmas tree behind, rich and cosy. Keep the centre and right of the tabletop clear for a product added later.'}
  }
};
const NEUTRAL={name:'warm-premium',tokens:{...CHRISTMAS.tokens,berry:'#8C4A3A',berryDeep:'#3E1F17',berryFruit:'#A5553F'},scenes:CHRISTMAS.scenes};

/**
 * Visual direction from the shared marketing strategy (strategy.mjs), so the
 * images and the listing copy read as one campaign: the strategy theme picks
 * the tokens and scenes, and its visual mood travels with the campaign.
 */
export function campaignFor(facts,strategy=deriveStrategy(facts)){
  // A format with its own campaign direction (colouring books) supplies it; greeting cards use the one below.
  const own=STAGE3_ADAPTERS[facts?.product_format]?.campaign;
  if(own)return own(facts,strategy);
  const base=strategy.theme.id==='christmas'?CHRISTMAS:NEUTRAL;
  return {...base,mood:strategy.visual_marketing_mood,strategy:{family:strategy.product_family,theme:strategy.theme.id}};
}

const NUM=['zero','one','two','three','four','five','six','seven','eight','nine','ten'];
const T=(text,claim)=>claim?{text,claim}:{text};

/**
 * Art-directed copy per slide template. `\n` is a deliberate line break.
 * Text is title case; the primitives set capitals with CSS, so claim text
 * still matches the facts exactly.
 */
export function campaignCopy(facts){
  const n=facts.designs.length, multi=n>1, season=facts.season?`${facts.season} `:'';
  const shared=facts.insides.length===1&&facts.insides[0].shared_by.length===n&&multi;
  const kind=/greeting/i.test(facts.product_type)?'Greeting Cards':'Cards';
  return {
    hero:{headline:T(`Printable ${season}\n${kind}`),
      subline:multi?T(`${NUM[n]??n} beautiful designs in one set`,['design-count',`${NUM[n]??n} designs`]):T('A beautiful design to print at home',['digital','Print at home'])},
    designs:{headline:T(`${n} card designs\nincluded`,['design-count',`${n} card designs`])},
    inside:{headline:T('A beautiful\ninside message',['inside','Inside message']),
      subline:shared?T(`The same illustrated inside\nfor ${n===2?'both':'all'} designs.`,['inside','Shared inside message']):T('An illustrated inside message.',['inside','Illustrated inside message'])},
    included:{headline:T('What’s included?')},
    design:{headline:null},
    print:{headline:T('Print at home',['digital','Print at home']),subline:T('Create beautiful cards\nin a few simple steps.')},
    sizes:{headline:T(facts.formats.length>1?'Multiple sizes\nfor easy printing':'Ready to print')},
    gift:{headline:T('A thoughtful card\nfor loved ones'),subline:T('For family, friends and neighbours.')},
    digital:{headline:T('Digital download',['digital','Digital download'])}
  };
}
