# Prompt 3 artwork visual QC

Production review: all 35 signature illustrations and all 35 independently generated economy redraws were individually inspected. Final source/production hashes are bound to findings in `records/visual-inspections.json`; `records/asset-manifest.json` identifies the exact accepted generation prompt and native tool output. This is production acceptance; owner visual approval remains pending.

## Inspection findings

| Family | Accepted pairs | Findings |
|---|---:|---|
| Botanical A01–A09 | 9 | Connected rose petals, coherent leaves/thorns and complete silhouettes. Independently composed upper corners open inward; lower corners establish a trailing botanical frame. Ivory/white previews show no paper rectangles or visible matte halos. Economy branches preserve identity through open petals and neutral hatch lines. A09 was redrawn to remove a grey wash; A02/A04 were redrawn for clean native boundaries. |
| Hero B01–B06 | 6 | Death’s-head moth has two antennae, six legs and coherent paired wings. Ravens face inward with readable beaks, feet and connected perch. Crystal ball, candles, key and seal have intentional engraved outlines and no generated lettering. Neutral economy redraws replace coloured shading; the economy raven/candle figures retain fine hatching within their silhouettes. |
| Celestial C01–C06 | 6 | Cratered crescent, engraved starburst, clustered stars, corner, constellation and seven-phase divider coordinate with the collection. Moon divider now consistently waxes with right-hand illumination and wanes with left-hand illumination; rejected versions reversed/ignored lighting. Final economy divider is neutral and uses open unlit regions rather than solid dark disks. |
| Apothecary D01–D09 | 9 | Six bottle shapes are distinct; labels contain no generated words. Empty label frame leaves usable text space. Snake has a coherent continuous body and a single head; sprig is connected and botanical. Purpose-drawn economy engraving uses neutral contours/hatching and preserves blank labels. Production placement of labels will be checked with actual editable wording in Prompt 4. |
| Lace E01–E05 | 5 | Lace divider/corner retain openwork character; flourish/separator/footer emblem use coherent engraved silhouettes. Delicate interiors remain secondary to outer contours at small scale. Economy separator/emblem were regenerated to remove colour, not mechanically desaturated. |

Each asset has native-resolution ivory and white backdrop files in `review/`. The labelled signature and economy sheets show all 70 accepted variants on both backgrounds. The older generated-draft overview and rejected source files remain preserved as review evidence.

## Technical results

All 70 sources have real RGBA transparency, more than 8% fully transparent pixels and zero pixels above alpha 16 at the source perimeter. Production preparation crops to alpha bounds and adds 20 fully transparent pixels on every side, without resizing or upscaling. Lowest effective resolution at the specified maximum contain box is **779.78 ppi**; all exceed 300 ppi. Density metadata alone is not used as evidence of resolution.

Economy opaque pixels are checked with RGB channel spread tolerance 15 and a maximum 1% chromatic fraction. Worst accepted result is **0.4877%**, from isolated antialiasing fringes; visible drawings are neutral. Final C02 economy is 0%. Exact measurements, dimensions, safe minimum widths/heights and intended placements are in the manifest. Starbursts may be used as a 3 mm structural silhouette; use 12 mm or larger when engraved interior detail is important.

## Rejected candidates and corrections

**19 candidates are preserved**, with hashes/reasons in `records/rejections.json`: 12 coloured economy candidates; A09 economy wash; A02/A04 economy native-boundary defects; two incorrect signature moon dividers; the corresponding incorrect economy moon divider; and its phase-correct but residually coloured economy replacement. Every correction used the built-in image generator. No rejected file is referenced by a production page.

## Integrated proof review and limitations

All eight required PDFs were rasterized to 300 dpi PNG and individually viewed at native resolution. Botanical corners deliberately meet layered rules without cropping or covering text. Moth/phase hierarchy gives the invitation a clear focal point; crescent/ravens/lower florals create a distinct welcome composition. Activity header and footer ornaments stay clear of the grid, instructions and word list; answer pages use the same identity. No dashed zones, numbered markers, development labels or substitute illustration remain in the rendered proofs.

Fourteen designs per treatment are used where appropriate across the three proof types; the remaining accepted library supports the approved later stationery/planning inventory. No remaining stationery, marketing page or final customer package was produced during this milestone. Artwork is raster illustration, not an editable vector library; page wording and layouts remain deterministic/editable. Physical printer behavior and very fine engraved detail require representative print checks in Prompt 8. No CMYK/PDF-X, metallic-foil or unrestricted enlargement claim is made.
