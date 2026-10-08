// Stage 3 marketing strategy (deterministic; no model call). Shared by the
// listing copy and the visual campaign so both read as one campaign.
//
// PRODUCT TRUTH vs SALES PRESENTATION: production facts (facts.mjs + the
// claim allow-list) decide WHAT may be said. The strategy decides only HOW:
// tone, order, emotional angle, vocabulary, emoji and search focus. It never
// adds a fact; every value is presentation guidance derived from metadata.
//
// strategy = product-family profile (sales personality) + theme modifier
// (season / mood), resolved from product metadata.

const NUM=['zero','one','two','three','four','five','six','seven','eight','nine','ten'];
const lc=s=>String(s??'').toLowerCase();

/** Section order every description follows; each family sets the focus of each section. */
export const DESCRIPTION_STRUCTURE=['emotional hook','product experience','options / designs','what you receive','how it works','emotional use case','digital product disclosure'];

/** Phrases that make copy read machine-written (prompt guidance for every family). */
export const AVOID_ALWAYS=['elevate your','transform your',"whether you're",'designed to','crafted to','seamlessly','perfect for (more than once)','unleash','look no further','must-have','game-changer','buy now','limited time',"don't miss out",'only today'];

const FAMILIES={
  greeting_card:{intent:t=>`send a thoughtful ${t.occasion}greeting`,angle:'heartfelt, personal warmth',tone:['warm','thoughtful'],
    opening:t=>`emotion / ${t.label||'seasonal'} sentiment before technical details`,emphasis:['artwork and gifting first','technical formats second'],
    vocabulary:['warm wishes','send','share','someone special','illustrated','heartfelt'],avoid:['manifest-style file lists up front'],cta:'soft',emoji:{level:'light',min:2,max:5},
    focus:{'product experience':'the artwork, the scene and the feeling of receiving the card','options / designs':'name each design so the buyer can choose','how it works':'download, choose, print, trim and fold, give','emotional use case':'who the card is for, as supported'}},
  colouring_book:{intent:t=>`enjoy a relaxing ${t.occasion}colouring activity`,angle:'creative calm and seasonal fun',tone:['inviting','creative'],
    opening:()=>'the colouring experience and theme before files',emphasis:['artwork, theme and page experience first','file information later'],
    vocabulary:['colour','relax','pages','illustrations','creative'],avoid:[],cta:'soft',emoji:{level:'playful',min:2,max:6},
    focus:{'product experience':'the illustrations and what colouring them feels like','options / designs':'page themes','how it works':'download, print, colour','emotional use case':'quiet creative time, as supported'}},
  activity_book:{intent:t=>`keep children happily busy with ${t.occasion}activities`,angle:'playful fun and discovery',tone:['playful','energetic','approachable'],
    opening:()=>'the fun of the activities before files',emphasis:['activities and experience first','technical information later'],
    vocabulary:['fun','puzzles','activities','colour','play'],avoid:[],cta:'soft',emoji:{level:'playful',min:3,max:8},
    focus:{'product experience':'the activities and how children use them','options / designs':'the activity types included','how it works':'download, print, play','emotional use case':'screen-free fun, as supported'}},
  party_kit:{intent:t=>`host a memorable ${t.occasion}party with less effort`,angle:'shared fun and easy hosting',tone:['social','exciting','organised'],
    opening:()=>'the party experience before files',emphasis:['party experience and included activities first','files later'],
    vocabulary:['guests','host','games','together','celebrate'],avoid:[],cta:'soft',emoji:{level:'lively',min:2,max:6},
    focus:{'product experience':'what the party feels like with the kit','options / designs':'the games or pieces included','how it works':'download, print, set up, play','emotional use case':'the gathering, as supported'}},
  planner:{intent:()=>'feel organised and in control',angle:'calm clarity',tone:['calm','encouraging','practical'],
    opening:()=>'the benefit of feeling organised before pages and files',emphasis:['workflow and benefits first','page and file details later'],
    vocabulary:['plan','organise','track','routine','clarity'],avoid:['hype'],cta:'gentle',emoji:{level:'minimal',min:0,max:3},
    focus:{'product experience':'how planning with it feels day to day','options / designs':'the page types','how it works':'download, print or use, plan','emotional use case':'a calmer routine, as supported'}},
  spreadsheet:{intent:()=>'understand and manage information efficiently',angle:'clear, trustworthy control',tone:['clear','trustworthy','modern','practical'],
    opening:()=>'the problem it solves before tabs and formulas',emphasis:['benefits and workflow first','sheet and file details later'],
    vocabulary:['track','overview','automatic','clear','organised'],avoid:['hype','cute language'],cta:'plain',emoji:{level:'minimal',min:0,max:2},
    focus:{'product experience':'what the buyer can see and decide with it','options / designs':'the sheets included','how it works':'download, open, enter data','emotional use case':'confidence with the numbers, as supported'}},
  crochet_pattern:{intent:()=>'make beautiful handmade crochet pieces from clear written patterns',angle:'the calm joy of making something by hand',tone:['warm','encouraging','crafty'],
    opening:()=>'what the buyer will make and how it feels before files',emphasis:['the pieces and the making experience first','files and formats later'],
    vocabulary:['crochet','make','hook','yarn','stitch','handmade gifts','pattern'],avoid:['tested','guaranteed','easy for everyone'],cta:'soft',emoji:{level:'light',min:0,max:4},
    focus:{'product experience':'what the buyer makes and what making it feels like','options / designs':'a few highlight patterns by name','how it works':'download, print, gather materials, crochet','emotional use case':'handmade gifts and calm making time, as supported'}},
  general_printable:{intent:()=>'get a useful, attractive printable quickly',angle:'warm, practical usefulness',tone:['warm','clear','helpful'],
    opening:()=>'the benefit before files',emphasis:['benefits first','files later'],
    vocabulary:['print','use','enjoy','simple'],avoid:[],cta:'soft',emoji:{level:'light',min:0,max:4},
    focus:{'product experience':'what the buyer gets to enjoy','options / designs':'the variants included','how it works':'download, print, use','emotional use case':'the moment it is used, as supported'}}
};

// Theme modifiers: seasonal/mood personality layered over the family. `when` sees lower-cased metadata text.
const THEMES=[
  {id:'christmas',when:m=>/christmas|xmas|noel|festive/.test(m.season+' '+m.type+' '+m.name),label:'Christmas',
    tone:m=>[...(m.traditional?['nostalgic']:[]),'festive'],angle:m=>`cosy ${m.traditional?'traditional ':''}Christmas warmth`,cta:'festive',
    vocabulary:['cosy','festive','winter','Christmas wishes','season'],visual:m=>`premium cosy ${m.traditional?'traditional ':''}Christmas`},
  {id:'halloween_dark',when:m=>/halloween/.test(m.season+' '+m.type+' '+m.name)&&/dark|gothic|eerie|mysterious|haunt|macabre/.test(m.mood),label:'Halloween',
    tone:()=>['atmospheric','mysterious'],angle:()=>'atmospheric Halloween mystery',cta:'intriguing',vocabulary:['moonlit','mysterious','eerie','atmosphere'],visual:()=>'moody atmospheric Halloween'},
  {id:'halloween_cute',when:m=>/halloween/.test(m.season+' '+m.type+' '+m.name),label:'Halloween',
    tone:()=>['playful','cosy-spooky'],angle:()=>'charming, cosy-spooky Halloween fun',cta:'playful',vocabulary:['spooky','cute','pumpkin','not-too-scary'],visual:()=>'playful cosy-spooky Halloween'},
  {id:'autumn',when:m=>/autumn|fall|harvest|thanksgiving/.test(m.season+' '+m.type+' '+m.name),label:'autumn',
    tone:()=>['cosy','seasonal'],angle:()=>'cosy autumn warmth',cta:'cosy',vocabulary:['cosy','autumn','harvest','crisp'],visual:()=>'warm cosy autumn'},
  {id:'wedding',when:m=>/wedding|bridal|engagement/.test(m.season+' '+m.type+' '+m.name),label:'wedding',
    tone:()=>['elegant','celebratory','refined'],angle:()=>'elegant celebration',cta:'refined',vocabulary:['celebrate','elegant','timeless'],visual:()=>'elegant refined wedding',emojiMax:2},
  {id:'none',when:()=>true,label:'',tone:()=>[],angle:null,cta:null,vocabulary:[],visual:()=>'premium warm lifestyle'}
];

export function productFamily(meta){
  const t=lc(`${meta.product_format} ${meta.product_type}`);
  if(/crochet/.test(t))return 'crochet_pattern';
  if(/greeting|card/.test(t)&&!/flash ?card|bingo/.test(t))return 'greeting_card';
  if(/colou?ring/.test(t))return 'colouring_book';
  if(/activity|puzzle|workbook/.test(t))return 'activity_book';
  if(/party|bingo|game|kit/.test(t))return 'party_kit';
  if(/spreadsheet|xlsx|excel|google sheets|budget tracker/.test(t))return 'spreadsheet';
  if(/planner|journal|organi[sz]er|tracker/.test(t))return 'planner';
  return 'general_printable';
}

/**
 * Resolve the marketing strategy from product metadata (Stage 3 facts or any
 * object with product_format, product_type, season, product_name, style,
 * target_customer, designs, insides). Pure and deterministic.
 */
export function deriveStrategy(meta){
  const family=productFamily(meta), F=FAMILIES[family];
  const m={season:lc(meta.season),type:lc(meta.product_type),name:lc(meta.product_name),mood:lc(`${meta.style?.mood??''} ${meta.style?.palette??''}`),
    traditional:/traditional|nostalgi|classic|vintage/.test(lc(`${meta.style?.mood??''} ${meta.target_customer??''} ${meta.product_type??''}`))};
  const theme=THEMES.find(x=>x.when(m));
  const t={label:theme.label,occasion:theme.label?`${theme.label} `:''};
  const n=meta.designs?.length??0;
  const sharedInside=(meta.insides?.length===1)&&(meta.insides[0].shared_by?.length>1);
  const season=theme.label||meta.season||'';
  const subject=lc(meta.style?.subject??'').split(/\s+/).filter(Boolean).at(-1)??'';
  const positioning=family==='greeting_card'
    ?`${n>1?`${NUM[n]??n} coordinated`:'a'} printable ${season?`${season} `:''}card design${n>1?'s':''}${sharedInside?' with a shared illustrated inside':''}`
    :`${lc(meta.product_type)||'printable'}${season?` for ${season}`:''}`;
  const seo=family==='greeting_card'
    ?[`printable ${lc(season)} cards`,subject&&`${subject} ${lc(season)} card`,m.traditional&&`traditional ${lc(season)} card`,n>1&&`${lc(season)} card set`,'instant digital download']
    :[`printable ${lc(meta.product_type)}`,season&&`${lc(season)} ${lc(meta.product_type)}`,subject&&`${subject} ${lc(meta.product_type)}`,'instant digital download'];
  const tone=[F.tone[0],...theme.tone(m),...F.tone.slice(1)];
  return {schema_version:1,
    product_family:family,theme:{id:theme.id,label:theme.label||null},
    primary_customer_intent:F.intent(t).replace(/\s+/g,' ').trim(),
    emotional_angle:theme.angle?theme.angle(m):F.angle,
    tone:[...new Set(tone)],
    positioning:positioning.replace(/\s+/g,' ').trim(),
    opening_strategy:F.opening(t),
    description_structure:DESCRIPTION_STRUCTURE.map(section=>({section,focus:F.focus[section]??null})),
    description_emphasis:F.emphasis,
    preferred_vocabulary:[...new Set([...F.vocabulary,...theme.vocabulary])],
    avoid_vocabulary:[...AVOID_ALWAYS,...F.avoid],
    cta_style:[F.cta,theme.cta].filter(Boolean).join(' '),
    seo_focus:[...new Set(seo.filter(Boolean).map(s=>s.replace(/\s+/g,' ').trim()))],
    title_strategy:['primary search phrase','product type / subject','key differentiator','secondary search intent'],
    emoji_level:{...F.emoji,max:Math.min(F.emoji.max,theme.emojiMax??99)},
    visual_marketing_mood:theme.visual(m),
    target_length_words:family==='spreadsheet'||family==='planner'?[200,450]:[250,500],
    note:'Presentation guidance only. Production facts and the claim allow-list decide what may be said.'};
}
