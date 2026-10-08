// Canonical crochet abbreviations (ADR-048, ADR-050): only terms whose MEANING is
// fixed by the terminology (US or UK). inc/dec mean "increase"/"decrease" in both
// (Craft Yarn Council); how to work them is the pattern's own business. Never
// pattern-defined stitches such as puff, cluster or bobble. Used to give an
// over-long abbreviation meaning its standard short form (the model's full wording
// kept verbatim in the pattern notes), and to define a standard abbreviation a
// draft uses but forgot to list.

const COMMON={ch:'chain','ch-sp':'chain space','sl st':'slip stitch',st:'stitch',sts:'stitches',rnd:'round',rnds:'rounds',rep:'repeat',sp:'space',
  sk:'skip',mr:'magic ring',blo:'back loop only',flo:'front loop only',beg:'beginning',rs:'right side',ws:'wrong side',fo:'fasten off',
  tog:'together',rem:'remaining',inc:'increase',dec:'decrease'};
export const CANONICAL_ABBREVIATIONS=Object.freeze({
  US:Object.freeze({...COMMON,sc:'single crochet',hdc:'half double crochet',dc:'double crochet',tr:'treble crochet',dtr:'double treble crochet',
    yo:'yarn over',sc2tog:'single crochet 2 stitches together'}),
  UK:Object.freeze({...COMMON,ss:'slip stitch',dc:'double crochet',htr:'half treble crochet',tr:'treble crochet',dtr:'double treble crochet',
    ttr:'triple treble crochet',yrh:'yarn round hook',dc2tog:'double crochet 2 stitches together'})});

/** The fixed meaning of a standard abbreviation in this terminology, or null (pattern-defined or unknown). */
export const canonicalMeaning=(abbr,terminology='US')=>CANONICAL_ABBREVIATIONS[terminology==='UK'?'UK':'US'][String(abbr).trim().toLowerCase()]??null;
export const SPECIAL_STITCH_MEANING='special stitch (full method in Notes)';
