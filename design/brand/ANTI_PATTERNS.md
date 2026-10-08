# LumiumX anti-patterns

The named ways a design **fails** the LumiumX standard. The Creative Director's
self-critique step (step 17) and the visual critic both score against this
file. Any design exhibiting an item below does not ship — it goes back for a
**redesign of the direction**, not a tweak.

This complements `docs/design/DESIGN_PRINCIPLES.md` ("the anti-generic test")
and `docs/design/LAYOUT.md` (composition anti-patterns). Those explain the
craft fix; this is the checklist.

---

## A. "Looks generic / AI-generated / template"

| # | Anti-pattern | Why it fails | The fix |
|---|---|---|---|
| A1 | **Generic spreadsheet** — a grid of equal cells, visible gridlines everywhere, no composition | Reads as "a spreadsheet made prettier", not a premium journal | Per-sheet/per-page composition: a dashboard is a KPI statement, a ledger is a hairline table, a log is a tight capture surface |
| A2 | **Generic Canva template** — pastel-on-white cards, soft drop shadows, a stock serif (Playfair/Lora) | The category is flooded with these; buyer's 3-second read is "low effort" | Ivory field, charcoal type, Spectral display, hairline structure, no shadowed cards |
| A3 | **Generic SaaS dashboard** — dark UI, neon accent, "productivity" icons, device screenshots in browser chrome | Wrong register for a money-serious adult buyer | Editorial stationery register; no chrome; real cropped previews framed as paper |
| A4 | **The repeated block** — `heading → card → card → card → footer` on every asset in the set | No composition variety; the set reads as one monotonous beat | One editorial pattern per asset (masthead+column, full-bleed+caption, numbered index, statement page); alternate density |
| A5 | **Could be any Etsy shop** — nothing distinctive in palette, type, motif or mockup style | The brand system is not being applied | Recognisable without the logo: kicker motif, LX mark, consistent margins, "same studio" mockup |
| A6 | **AI-looking advertisement** — a wall of text + a stats row + badges + subtitle all piled on the hero; unreadable at 170px | Fails the thumbnail test; looks auto-generated | Hero = title + one descriptor + one spec line + the product as focal point + one accent mark |

## B. Colour & decoration

| # | Anti-pattern | The fix |
|---|---|---|
| B1 | **Pastel overload** — three or more tints doing decorative work | One accent, 3–5 placements, on the family colour |
| B2 | **Rainbow / category-tag colours** — a different colour per section or category | Categories differ by label and position, not colour |
| B3 | **Accent as wallpaper** — accent on every badge, tick, icon box, KPI value, section bar | Count accent marks; >6 → delete until scarce |
| B4 | **Solid coloured section-heading bars** | Tracked-caps label on a Stone hairline, no fill |
| B5 | **Loud gradients / glows / large accent fills** | Flat colour; the only permitted accent fill is a hand-shaded progress strip |
| B6 | **Off-brand invented hexes** — `#FAF8F4`, `#6F8174`-as-only-accent, a "brand blue" | LUMIUMX hexes verbatim (`design/brand/lumiumx.tokens.json`) |
| B7 | **Random decorative elements** — clipart, stickers, coins, 3D shapes, "AI clutter" | Nothing on the page that isn't a label, a field, or one of the approved motifs |
| B8 | **Icon overload / icon-in-rounded-square rows** | Drop the icons; a numeral or a hairline + a strong label carries the meaning |
| B9 | **Emoji, cartoon illustration, childish visuals** | Not in this brand, in any product family |
| B10 | **Excessive shadows / glassmorphism** | One soft warm directional shadow on the mockup only |

## C. Typography

| # | Anti-pattern | The fix |
|---|---|---|
| C1 | **Weak hierarchy** — two headings one notch apart in size; everything 400–500 weight | Real jumps (≥1.5×); 400 vs 600 |
| C2 | **Inter-Bold display line** where the serif should be | Spectral for every display/title/statement line |
| C3 | **Tiny text** — body below 10pt (print) or a 22px label carrying real content on ivory | Respect the floors in `TYPOGRAPHY.md`; small text is Ink or `#3A3A3A`, never accent |
| C4 | **Colour used for hierarchy** — a terracotta subhead "to make it pop" | Distinguish by size + weight + space; hierarchy must survive greyscale |
| C5 | **Raw spec sentence as body copy**, with mid-word line breaks | Copy is written for the reader: tight, concrete, one idea per line on kickers |
| C6 | **Letter-spaced lowercase** body text | Tracking is positive on small caps only, zero on body |
| C7 | **Inconsistent label register** — kickers sometimes sentence case, sometimes caps, varying size | One tracked-caps kicker motif, used identically everywhere |

## D. Layout & composition

| # | Anti-pattern | The fix |
|---|---|---|
| D1 | **Rounded-card overload** — every content group wrapped in a bordered card | Groups separated by whitespace or one hairline; a card only for a genuinely distinct object |
| D2 | **Dead centred void** — big heading, then a >200px undesigned gap, then centred content | Anchor content under its heading; whitespace falls at the page edges |
| D3 | **Everything centred** | Asymmetric grid; left-align the title block |
| D4 | **Inconsistent spacing** — values off the scale, "nudged to fit" | Every gap from `[2,4,8,12,16]`mm (print) / the baseline (listing) |
| D5 | **Overly dense layout** — no breathing room, every mm used | Deliberate macro whitespace; balanced information density |
| D6 | **Elements touching the canvas edge** | Hold the margin; only a deliberate full-bleed image breaks it |
| D7 | **Fake browser chrome / traffic-light dots** around a screenshot | Editorial frame (thin Stone border, soft shadow, no chrome) or a believable desk scene |
| D8 | **Same density on every image** in a listing set | Alternate dense (index) → sparse (statement) → scene (lifestyle) |

## E. Product & tables (the "prettier Excel" failure)

| # | Anti-pattern | The fix |
|---|---|---|
| E1 | **Over-designed financial table** — heavy borders, fills on every row, banding, competing rules | Horizontal hairlines only; vertical rule only between column groups; no fills on calc/total rows |
| E2 | **Poor writing space** — rows below the 7mm floor, currency cells below 20mm, cramped labels | Respect the writing-space floors in the product spec on every page |
| E3 | **The dashboard is just another table** | A dashboard is a KPI statement: big tabular figure, label, one hairline, one emphasised result |
| E4 | **Blank-grid previews** in marketing — a 60%-empty sheet screenshot | Crop previews to the dense, meaningful region |
| E5 | **Invented UI** — a mockup of a screen the product doesn't have | Show the actual `.xlsx` sheet render / the actual PDF page |

## F. Trust & commerce

| # | Anti-pattern | The fix |
|---|---|---|
| F1 | **Cheap-looking mockups** — flat screenshot, AI hands, cluttered desk, stock-photo look | One consistent stationery mockup: warm light, soft directional shadow, sparse props |
| F2 | **Claims not backed by the product** — "8 worksheets" when there are 6 | Claims come only from the verified spec / QC report (`deriveMarketingData`) |
| F3 | **No differentiation move** — a competent design that looks like the three market references | State the one differentiation opening and make it visible (restraint + editorial type + real previews) |
| F4 | **Looks free** — a stranger would not assume this is a paid, professionally designed product | If F4 is true, the concept is wrong — redesign, don't nudge |
