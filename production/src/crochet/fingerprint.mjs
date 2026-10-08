// Crochet PATTERN -> VISUAL FINGERPRINT (ADR-046). Deterministic, no model.
//
// The written pattern is the source of truth for what a crochet visual may
// show. A fingerprint holds only what the pattern itself states:
//   - structured fields (name, category, size, yarn weight, hook, yarn colours,
//     materials, sections, assembly) are read directly;
//   - counts and shapes (petals, layers, leaves, centre type, stem length) are
//     taken only from EXPLICIT wording ("5 petals", "Leaf (make 2)",
//     "spiral centre"). A value implied only by stitch arithmetic
//     ("*ch 8, sl st in next st; rep from * around") is NOT computed: it is
//     null, and listed in `unknown`.
// A piece the complete instructions never make (no leaf section, no leaf
// instruction) is a KNOWN absence (present: false), not an unknown.
// Every derived value records its evidence. Nothing is guessed.

export const FINGERPRINT_VERSION=1;

// Longest first, so "sweet pea" wins over "pea" and "rosebud" over "rose".
export const FLOWER_TYPES=['forget-me-not','baby\'s breath','lily of the valley','sweet pea','rosebud','ranunculus','hydrangea','carnation','chrysanthemum','sunflower',
  'snowdrop','bluebell','buttercup','camellia','magnolia','marigold','primrose','waxflower','foxglove','lavender','gardenia','hibiscus','wisteria','freesia',
  'anemone','dahlia','gerbera','cosmos','poppy','peony','tulip','daisy','orchid','violet','pansy','zinnia','aster','lotus','protea','clover','jasmine','lilac',
  'heather','thistle','iris','lily','rose'].sort((a,b)=>b.length-a.length);
const FOLIAGE_TYPES=['eucalyptus','maidenhair','fern','ivy','olive','willow','berry','leaf','leaves','foliage','branch','sprig','spray','stem','collar','vine','grass'];
const NUM={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,eighteen:18,twenty:20,
  single:1,double:2,triple:3};
const N=`(\\d{1,2}|${Object.keys(NUM).join('|')})`;
const num=s=>/^\d+$/.test(s)?Number(s):NUM[String(s).toLowerCase()]??null;
const lower=s=>String(s??'').toLowerCase();
const uniq=a=>[...new Set(a)];

/** Every construction text with its location (instructions, assembly, finishing; notes are optional advice, not construction). */
function texts(p){
  const out=[];
  (p.instructions??[]).forEach((s,i)=>{out.push({at:`instructions[${i}].heading`,text:s.heading,section:i});
    (s.steps??[]).forEach((st,j)=>out.push({at:`instructions[${i}].steps[${j}].text`,text:st.text,section:i}));});
  (p.assembly??[]).forEach((t,i)=>out.push({at:`assembly[${i}]`,text:t}));
  (p.finishing??[]).forEach((t,i)=>out.push({at:`finishing[${i}]`,text:t}));
  return out;
}
const find=(T,re)=>T.map(t=>({...t,m:re.exec(t.text)})).filter(t=>t.m);

function size(raw){
  const s=lower(raw), out={raw:String(raw??''),width_cm:null,height_cm:null};
  const conv=(v,u)=>u.startsWith('mm')?v/10:u.startsWith('in')||u==='"'?+(v*2.54).toFixed(1):v;
  for(const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(?:(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*)?(cm|mm|inches|inch|in\b|")\s*(across|wide|in diameter|diameter|long|tall|high|in length)?/g)){
    const v=m[2]?(Number(m[1])+Number(m[2]))/2:Number(m[1]), cm=conv(v,m[3]), dim=m[4]??'';
    if(/long|tall|high|length/.test(dim)){if(out.height_cm===null)out.height_cm=cm;}
    else if(out.width_cm===null)out.width_cm=cm;
  }
  return out;
}

/**
 * The visual fingerprint of ONE validated pattern (production/schemas/crochet-pattern-bundle.schema.json).
 * @returns {object} fingerprint; `unknown` lists every visual attribute the pattern does not state.
 */
export function patternFingerprint(p){
  const T=texts(p), evidence={}, ev=(k,at)=>{evidence[k]=at;};
  const name=lower(p.name), cat=lower(p.category), all=T.map(t=>lower(t.text)).join('\n');
  const headings=(p.instructions??[]).map(s=>s.heading);

  // Motif and flower type: name first, then category (never the free text, which may name other pieces).
  const flower=FLOWER_TYPES.find(f=>new RegExp(`\\b${f.replace(/[-']/g,m=>`\\${m}`)}s?\\b`).test(name))??FLOWER_TYPES.find(f=>new RegExp(`\\b${f}\\b`).test(cat))??null;
  if(flower)ev('flower_type',name.includes(flower)?'name':'category');
  const foliage=FOLIAGE_TYPES.find(f=>new RegExp(`\\b${f}\\b`).test(name)||new RegExp(`\\b${f}\\b`).test(cat));
  const motif_type=flower?(flower==='rosebud'?'bud':'flower'):/leaf|foliage|fern/.test(cat)||/leaf|leaves|fern|eucalyptus|ivy/.test(name)?'foliage'
    :/stem|wire|branch/.test(cat+' '+name)?'stem':/flower|bloom|blossom/.test(cat)?'flower':foliage?'foliage':cat||null;
  ev('motif_type','category/name');

  // Petals: explicit counts only.
  // "6 petals per section" / "3 dc in each petal" are per-unit counts, never the flower's total.
  const perUnit=t=>/\b(each|per|every)\s+petal/i.test(t.m[0])||/^\s*(per|each|in each|on each|for each)\b/i.test(t.text.slice(t.m.index+t.m[0].length));
  const petalCounts=uniq(find(T,new RegExp(`\\b${N}\\s+(?:[a-z-]+\\s+){0,2}?petals?\\b`,'i')).filter(t=>!perUnit(t))
    .map(t=>{ev('petal_count',t.at);return num(t.m[1]);}).filter(Boolean));
  const totalPetals=find(T,new RegExp(`\\b(?:total of|in total)\\s+${N}\\s+petals|\\b${N}\\s+petals\\s+in total`,'i'))[0];
  const petal_count=totalPetals?num(totalPetals.m[1]??totalPetals.m[2]):petalCounts.length===1?petalCounts[0]:null;
  if(totalPetals)ev('petal_count',totalPetals.at);
  const layerWord=find(T,new RegExp(`\\b${N}\\s+(?:petal\\s+)?layers?\\b`,'i'))[0];
  const layerHeadings=uniq(headings.filter(h=>/petal/i.test(h)&&/(inner|middle|outer|layer\s*\d|first|second|third)/i.test(h)).map(h=>lower(h)));
  const petal_layer_count=layerWord?num(layerWord.m[1]):layerHeadings.length>1?layerHeadings.length:null;
  if(layerWord)ev('petal_layer_count',layerWord.at);else if(layerHeadings.length>1)ev('petal_layer_count','instruction headings');
  const shape=find(T,/\b(pointed|rounded|round|ruffled|scalloped|frilled|narrow|wide|fringed|curled|cupped|heart-shaped|teardrop)\s+petals?\b/i)[0];
  if(shape)ev('petal_shape',shape.at);

  // Centre.
  const centreSec=headings.findIndex(h=>/cent(re|er)|middle|stamen|core/i.test(h));
  const centreText=find(T,/\b(spiral|bobble|french knot|puff|popcorn|button|coiled|bead(?:ed)?|stamen|ring)\s+cent(?:re|er)\b/i)[0];
  const centrePresent=centreSec>=0||/\bcent(re|er)\b/.test(all);
  const centreColour=centreSec>=0?(find(T.filter(t=>t.section===centreSec),/\bwith\s+([a-z][a-z -]{1,20}?)(?:,|\s+yarn\b|\s+make\b|\s+ch\b)/i)[0]?.m[1]??null):null;
  if(centreText)ev('centre_type',centreText.at);if(centreSec>=0)ev('centre_present',`instructions[${centreSec}].heading`);

  // Leaves (for a foliage motif the leaf IS the motif).
  let leaves=null;
  if(motif_type!=='foliage'){
    const leafSecs=headings.map((h,i)=>({h,i})).filter(x=>/lea(f|ves)/i.test(x.h));
    const mention=/\blea(f|ves)\b/.test(all);
    const made=find(T,new RegExp(`\\bmake\\s+${N}\\s+lea(?:f|ves)|lea(?:f|ves)\\s*\\((?:make\\s*)?${N}\\)|lea(?:f|ves)\\s*\\(make\\s+${N}\\)|\\b${N}\\s+(?:[a-z-]+\\s+)?lea(?:f|ves)\\b`,'i'))
      .map(t=>({at:t.at,n:num(t.m.slice(1).find(Boolean))})).filter(x=>x.n);
    const counts=uniq(made.map(x=>x.n));
    const lshape=find(T,/\b(pointed|rounded|oval|long|narrow|heart-shaped|serrated|round)\s+lea(?:f|ves)\b/i)[0];
    const attach=find(T,/\b(?:sew|attach|join|stitch)\b[^.;]{0,50}\blea(?:f|ves)\b[^.;]{0,50}\b(?:to|onto|on)\s+(?:the\s+)?(stem|base|flower|petals|calyx|back)\b/i)[0];
    leaves={present:leafSecs.length>0||mention,count:counts.length===1?counts[0]:(!(leafSecs.length||mention)?0:null),
      shape:lshape?lower(lshape.m[1]):null,attachment:attach?`sewn to the ${lower(attach.m[1])}`:null};
    if(made[0])ev('leaf_count',made[0].at);if(!leaves.present)ev('leaf_count','no leaf section or leaf instruction');
    if(lshape)ev('leaf_shape',lshape.at);if(attach)ev('leaf_attachment',attach.at);
  }

  // Stem and wire.
  const mats=(p.additional_materials??[]).map(lower);
  const wire=mats.some(m=>/\bwire\b|pipe cleaner|chenille stem/.test(m));
  const stemSec=headings.some(h=>/stem/i.test(h)), stemText=/\bstems?\b/.test(all)||/stem/.test(cat+' '+name);
  const stemLen=find(T,/\b(\d+(?:\.\d+)?)\s*cm\s+(?:long\s+)?stem\b|\bstem\b[^.;]{0,30}?\b(\d+(?:\.\d+)?)\s*cm\b/i)[0];
  const stem={present:stemSec||stemText,type:!(stemSec||stemText)?'none':wire?'crochet-covered wire':'crochet',
    length_cm:stemLen?Number(stemLen.m[1]??stemLen.m[2]):null,wired:wire};
  if(stemLen)ev('stem_length',stemLen.at);ev('stem',stemSec?'instruction headings':stemText?'instructions/assembly text':'no stem section or stem instruction');

  // Embellishments: only what the materials or instructions call for.
  const EMB=[['bead',/\bbeads?\b/],['button',/\bbuttons?\b/],['wire',/\bwire\b|pipe cleaner|chenille stem/],['stamens',/\bstamens?\b/],['felt',/\bfelt\b/],
    ['ribbon',/\bribbon\b/],['glue',/\bglue\b/],['embroidery',/\bembroider/],['stuffing',/fibre ?fill|fiberfill|stuffing/],['safety eyes',/safety eyes?/],['sequins',/\bsequins?\b/]];
  const embellishments=EMB.filter(([,re])=>mats.some(m=>re.test(m))||re.test(all)).map(([k])=>k);

  const fibres=uniq((p.yarn??[]).flatMap(y=>[...lower(y.description).matchAll(/\b(cotton|acrylic|wool|merino|bamboo|linen|mohair|alpaca|polyester|chenille|velvet|silk)\b/g)].map(m=>m[1])));
  const colour_roles=(p.yarn??[]).map(y=>({role:String(y.description).replace(/\b(cotton|acrylic|wool|merino|bamboo|linen|mohair|alpaca|polyester|chenille|velvet|silk)\b\s*(yarn)?,?\s*/gi,'').trim()||null,colour:y.colour??null}));
  const details=uniq([[/\bmagic ring\b|\bMR\b/,'magic ring start'],[/\bin the round\b|\brnd\b/i,'worked in the round'],[/\brow \d/i,'worked in rows'],
    [/\bBLO\b|back loops? only/i,'back loop only'],[/\bFLO\b|front loops? only/i,'front loop only'],[/\broll(?:ed)?\b|\bcoil/i,'rolled or coiled'],
    [/\bsurface (?:slip )?st/i,'surface crochet']].filter(([re])=>T.some(t=>re.test(t.text))).map(([,d])=>d));

  const fp={version:FINGERPRINT_VERSION,pattern_id:p.pattern_id,pattern_name:p.name,motif_type,flower_type:flower,
    petal_layer_count,petal_count,petal_counts_stated:petalCounts,petal_shape:shape?lower(shape.m[1]):null,
    centre:{present:centrePresent,type:centreText?lower(centreText.m[1]):null},centre_colour_role:centreColour?lower(centreColour.trim()):null,
    leaves,stem,finished:size(p.finished_size),yarn_weight:p.yarn_weight??null,hook_mm:p.hook_size?.mm??null,fibres,colour_roles,
    pieces:headings,assembly:{required:p.assembly_required===true||(p.assembly??[]).length>0||headings.length>1,steps:(p.assembly??[]).length},
    embellishments,construction_details:details,evidence};
  fp.unknown=unknownOf(fp);
  return fp;
}

/** Visual attributes the pattern does not state (never guessed). */
export function unknownOf(fp){
  const u=[];
  if(fp.motif_type==='flower'||fp.motif_type==='bud'){
    if(fp.petal_count===null)u.push('petal_count');if(fp.petal_layer_count===null)u.push('petal_layer_count');if(!fp.petal_shape)u.push('petal_shape');
    if(fp.centre.present&&!fp.centre.type)u.push('centre_type');
  }
  if(!fp.flower_type&&fp.motif_type==='flower')u.push('flower_type');
  if(fp.leaves?.present&&fp.leaves.count===null)u.push('leaf_count');
  if(fp.leaves?.present&&!fp.leaves.shape)u.push('leaf_shape');
  if(fp.stem.present&&fp.stem.length_cm===null)u.push('stem_length');
  if(fp.finished.width_cm===null)u.push('finished_width');
  return u;
}

/** Fingerprints for every pattern of an approved bundle, keyed by pattern_id. */
export const bundleFingerprints=bundle=>Object.fromEntries(bundle.patterns.map(p=>[p.pattern_id,patternFingerprint(p)]));

/**
 * A fingerprint as LISTING FACTS for Stage 3 (ADR-047): what the written pattern establishes, in plain
 * values. A null number means the pattern does not state it; "not stated" likewise. Never a guess.
 */
export function listingFacts(fp){
  return {pattern_id:fp.pattern_id,pattern_name:fp.pattern_name,motif_type:fp.motif_type,flower_type:fp.flower_type,
    finished_size:fp.finished.raw||null,finished_width_cm:fp.finished.width_cm,finished_height_cm:fp.finished.height_cm,
    yarn_weight:fp.yarn_weight,hook_mm:fp.hook_mm,fibres:fp.fibres,colour_roles:fp.colour_roles,
    petal_count:fp.petal_count,petal_layer_count:fp.petal_layer_count,petal_shape:fp.petal_shape,
    centre:fp.centre.present?(fp.centre.type??'present, type not stated'):'none',
    leaves:fp.leaves===null?'not applicable (the piece is foliage)':!fp.leaves.present?'none':fp.leaves.count!==null?fp.leaves.count:'present, count not stated',
    stem:!fp.stem.present?'none':fp.stem.wired?'crochet-covered wire':'crochet',embellishments:fp.embellishments,unknown:fp.unknown};
}
