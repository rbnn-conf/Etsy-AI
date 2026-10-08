// Product canvas: the format-dependent physical properties of the artwork
// (orientation, background, edge treatment). The specification step chooses
// it per product; this module validates it against the product format, turns
// it into deterministic image-prompt text, and maps orientation to an image
// size the configured model actually supports. Line art vs colour stays in
// the creative direction (`colour_mode`).
export const ORIENTATIONS=Object.freeze(['portrait','landscape','square']);
export const BACKGROUNDS=Object.freeze(['white','coloured','illustrated']);
export const EDGES=Object.freeze(['safe-margin','full-bleed']);

// Formats printed as documents on a home printer: white page, safe margins.
const PRINT_PAGE={background:['white'],edge:['safe-margin']};
const FORMAT_CANVAS=Object.freeze({
  'colouring-book':PRINT_PAGE,
  'activity-book':PRINT_PAGE,
  'worksheet-bundle':{edge:['safe-margin']},
  'planner':{edge:['safe-margin']},
  // Illustrations placed inside a printable document: never full-bleed.
  'crochet-pattern-bundle':{edge:['safe-margin']}
});
// One deterministic sentence per format, so e.g. a card never drifts into
// looking like a colouring page.
const FORMAT_HINTS=Object.freeze({
  'greeting-card':'It must look like a finished, retail-quality greeting card design, not a colouring page or worksheet.',
  'invitation':'It must look like a finished invitation, with clear, well-proportioned space reserved for the event wording.',
  'single-printable':'It must look like a finished piece of printable wall art or a single printable sheet.',
  'printable-set':'It must look like one finished item from a coordinated printable set.',
  'party-kit':'It must look like one finished, coordinated item from a party printable kit.',
  'planner':'It is a printable document page: readable headings and generous, clearly ruled writing space matter more than decoration.',
  'worksheet-bundle':'It is a printable worksheet: readable headings and generous writing or working space matter more than decoration.',
  'activity-book':'It is an activity-book page: clean closed outlines, clear activity elements, easy to print and use.',
  'colouring-book':'It is a colouring page: clean closed outlines on white, no grey fills or shading, easy to colour.',
  // The crochet product's look (realistic yarn and stitches; illustrated branding only) is the CROCHET PRODUCT DIRECTION (ADR-043).
  'crochet-pattern-bundle':'It is artwork for a printable crochet pattern collection (the cover or a representative page), following the CROCHET PRODUCT DIRECTION, and contains no written instructions, stitch diagrams, charts or step text.'
});

/** Canvas problems for a product format; [] when valid. */
export function canvasProblems(format,canvas,path='$.canvas'){
  const rule=FORMAT_CANVAS[format];
  if(!rule)return [];
  const e=[];
  for(const k of ['background','edge'])if(rule[k]&&!rule[k].includes(canvas[k]))e.push(`${path}.${k}: ${format} requires ${rule[k].join(' or ')}, got ${canvas[k]}`);
  return e;
}

/**
 * The specification schema as the MODEL sees it for this format (ADR-061): canvas
 * enums narrowed to the values FORMAT_CANVAS allows, and orientation to the chosen
 * concept's. A value the format forbids is never offered as a choice. Local
 * validation still uses the committed schema plus canvasProblems.
 */
export function specificationSchemaFor(schema,format,orientation=null){
  const rule={...FORMAT_CANVAS[format],...(orientation?{orientation:[orientation]}:{})};
  const c=schema.properties.canvas;
  const narrow=(k,v)=>{const e=rule[k]&&v.enum?.filter(x=>rule[k].includes(x));return e?.length?{...v,enum:e}:v;};   // never an empty enum: validation decides
  const props=Object.fromEntries(Object.entries(c.properties).map(([k,v])=>[k,narrow(k,v)]));
  return {...schema,properties:{...schema.properties,canvas:{...c,properties:props}}};
}

/**
 * The one canvas repair (ADR-061): `edge` is a print-layout property fixed by the
 * format, so when the format allows exactly one edge it is set to it. Nothing else
 * is changed: a forbidden background (an artwork-content error) is left for
 * canvasProblems to reject.
 */
export function normaliseCanvas(format,data){
  const only=FORMAT_CANVAS[format]?.edge;
  const canvas=data?.canvas;
  if(!canvas||only?.length!==1||canvas.edge===only[0])return {data,changes:[]};
  return {data:{...data,canvas:{...canvas,edge:only[0]}},changes:[{field:'canvas.edge',from:canvas.edge,to:only[0],reason:`${format} requires ${only[0]}`}]};
}

const BACKGROUND_TEXT={white:'a plain white background',coloured:'a solid or softly textured coloured background',illustrated:'an illustrated background that is part of the artwork'};
const EDGE_TEXT={'safe-margin':'Keep a clear margin on every side; nothing important touches the edges, so it prints cleanly on a home printer.',
  'full-bleed':'The artwork runs to every edge (full bleed). Keep all text and key elements inside a comfortable inner safe area.'};
/** Deterministic CANVAS paragraph for the image prompt. */
export function canvasPrompt(canvas,format){
  return [`A single ${canvas.orientation} design with ${BACKGROUND_TEXT[canvas.background]}.`,EDGE_TEXT[canvas.edge],
    FORMAT_HINTS[format]??'',canvas.format_notes,'Any printed text must be short, correctly spelled and exactly as quoted.'].filter(Boolean).join(' ');
}

// Sizes each image-model family supports, per orientation. Only documented
// sizes: an unknown model is a configuration error, not a guess.
export const IMAGE_SIZES=Object.freeze({
  'gpt-image':{portrait:'1024x1536',landscape:'1536x1024',square:'1024x1024'},
  'dall-e-3':{portrait:'1024x1792',landscape:'1792x1024',square:'1024x1024'}
});
// Documented `quality` values per family: the cheapest one for the throwaway
// concept previews, and the default for creative proofs. OPENAI_IMAGE_QUALITY
// and AUTOMATION_PREVIEW_QUALITY override them and are checked against `allowed`.
export const IMAGE_QUALITIES=Object.freeze({
  'gpt-image':{allowed:['low','medium','high','auto'],preview:'low',proof:'medium'},
  'dall-e-3':{allowed:['standard','hd'],preview:'standard',proof:'standard'}
});
export const imageFamily=model=>Object.keys(IMAGE_SIZES).find(f=>String(model??'').startsWith(f))??null;
/** Image size for a model and orientation. Throws for an unknown model. */
export function imageSizeFor(model,orientation){
  const family=imageFamily(model);
  if(!family)throw new Error(`No image size table for model ${JSON.stringify(model)}; add its supported sizes to IMAGE_SIZES in src/orchestrator/canvas.mjs`);
  const size=IMAGE_SIZES[family][orientation];
  if(!size)throw new Error(`Unknown orientation ${JSON.stringify(orientation)}`);
  return size;
}
