/**
 * Marketing design system — the single stylesheet for the DETERMINISTIC
 * lifestyle mockup engine (ADR-013). No AI imagery, no photos: a warm desk
 * photographed in soft top-left daylight is built from layered CSS gradients
 * + inline SVG grain; real rendered product pages are laid on it as physical
 * sheets with a three-part shadow; a few coded props (pencil, clip, mug,
 * coins, greenery) frame the product; copy is minimal Spectral/Inter.
 *
 * Compositions emit markup with these classes and a
 * single `<div id="canvas">…</div>`.  Nothing bleeds past the canvas (Visual QC
 * measures element rects against #canvas), every request is inline, min font
 * stays ≥ 20px.
 */

/**
 * @param {import("./tokens.mjs").DEFAULT_MARKETING_THEME} t
 * @param {string} fontFaces  output of fontFaceCss()
 */
export function baseCss(t, fontFaces) {
  const c = t.color;
  const f = t.font;
  const sc = t.scene;
  const W = t.canvas.width;
  const H = t.canvas.height;

  // inline SVG fractal-noise grain (no network)
  const grain =
    "data:image/svg+xml;base64," +
    Buffer.from(
      `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='240' height='240' filter='url(%23n)' opacity='1'/></svg>`.replace(
        /%23/g,
        "#",
      ),
    ).toString("base64");

  return `
${fontFaces}

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px}
body{font-family:${f.sans};font-size:${f.size.body}px;line-height:${f.lineHeight.normal};
  color:${c.ink};background:${c.paper};
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}

#canvas{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:${sc.deskMid}}

/* ---------- the desk ---------- */
.scene{position:absolute;inset:0;z-index:0;
  background:
    radial-gradient(1400px 1100px at 20% 8%, ${sc.lightWarm} 0%, rgba(255,247,232,0) 62%),
    radial-gradient(1700px 1500px at 78% 108%, ${sc.deskShade} 0%, rgba(169,140,100,0) 60%),
    linear-gradient(158deg, ${sc.deskTop} 0%, ${sc.deskMid} 44%, ${sc.deskLow} 100%);
}
.scene::before{content:"";position:absolute;inset:0;
  background-image:url(${grain});background-repeat:repeat;background-size:520px 520px;
  opacity:${sc.grainOpacity};mix-blend-mode:multiply}
.scene::after{content:"";position:absolute;inset:0;
  background:radial-gradient(1900px 1600px at 50% 46%, rgba(0,0,0,0) 55%, ${sc.vignette} 100%);
  pointer-events:none}
#canvas.warm .scene{filter:saturate(1.04) brightness(0.985)}

/* faint wood-plank seams — three long soft lines, not a pattern */
.plank{position:absolute;left:0;right:0;height:2px;z-index:1;
  background:linear-gradient(90deg, rgba(120,92,58,0) 0%, rgba(120,92,58,0.16) 12%, rgba(120,92,58,0.16) 88%, rgba(120,92,58,0) 100%)}

/* ---------- physical printed sheet (a REAL page render) ---------- */
.sheet{position:absolute;z-index:5;background:${sc.sheetFace};
  border-radius:${sc.sheetRadius}px;overflow:hidden;
  outline:1px solid ${sc.sheetEdge};outline-offset:-1px;
  box-shadow:${sc.contact}, ${sc.cast}, ${sc.ambient}}
.sheet>img{display:block;width:100%;height:100%;object-fit:cover;object-position:top center;
  border-radius:inherit}
.sheet::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:${sc.sheen}}
.sheet.tilt-l{transform:rotate(-3.1deg)}
.sheet.tilt-r{transform:rotate(2.4deg)}
.sheet.tilt-lg{transform:rotate(-5.4deg)}
.sheet.lay{transform:perspective(2600px) rotateX(2.6deg) rotate(-2.4deg)}
.sheet.flat{transform:none}

/* ---------- props (pure CSS / inline SVG) ---------- */
.prop{position:absolute;pointer-events:none}

.prop-pencil{width:520px;height:34px;z-index:7;
  filter:drop-shadow(10px 20px 16px rgba(40,28,16,0.34))}
.prop-pencil .barrel{position:absolute;left:64px;right:74px;top:0;bottom:0;border-radius:5px;
  background:linear-gradient(180deg, ${sc.pencilBody} 0%, ${sc.pencilBody} 42%, ${sc.pencilBodyDark} 100%)}
.prop-pencil .barrel::after{content:"";position:absolute;inset:0;border-radius:5px;
  background:linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 40%)}
.prop-pencil .wood{position:absolute;right:34px;top:-2px;border-style:solid;border-width:19px 0 19px 42px;
  border-color:transparent transparent transparent #E9CFA0}
.prop-pencil .lead{position:absolute;right:22px;top:5px;border-style:solid;border-width:12px 0 12px 16px;
  border-color:transparent transparent transparent ${sc.graphite}}
.prop-pencil .ferrule{position:absolute;left:40px;top:0;bottom:0;width:34px;border-radius:4px 0 0 4px;
  background:linear-gradient(180deg,#CDB98E,#9C8763)}
.prop-pencil .eraser{position:absolute;left:0;top:2px;bottom:2px;width:44px;border-radius:16px 5px 5px 16px;
  background:linear-gradient(180deg,#E1A79A,#C98374)}

.prop-clip{width:150px;height:150px;z-index:7;
  filter:drop-shadow(8px 16px 12px rgba(40,28,16,0.32))}
.prop-plant{width:340px;height:340px;z-index:6;
  filter:drop-shadow(14px 26px 22px rgba(40,28,16,0.30))}

.prop-mug{width:300px;height:270px;z-index:8;
  filter:drop-shadow(24px 34px 34px rgba(40,28,16,0.34))}
.prop-mug .cup{position:absolute;left:24px;right:24px;bottom:0;top:44px;border-radius:26px 26px 40px 40px;
  background:linear-gradient(120deg, ${sc.ceramic} 0%, ${sc.ceramicShade} 100%)}
.prop-mug .rim{position:absolute;left:24px;right:24px;top:22px;height:56px;border-radius:50%;
  background:${sc.ceramicShade};box-shadow:inset 0 6px 10px rgba(40,28,16,0.18)}
.prop-mug .brew{position:absolute;left:44px;right:44px;top:32px;height:38px;border-radius:50%;
  background:radial-gradient(circle at 40% 35%, #7A5238 0%, ${sc.coffee} 70%)}
.prop-mug .handle{position:absolute;right:-2px;top:86px;width:78px;height:104px;border-radius:50%;
  border:22px solid ${sc.ceramicShade};border-left-color:transparent;border-bottom-color:transparent}

.prop-coins{width:210px;height:120px;z-index:7;
  filter:drop-shadow(10px 18px 14px rgba(40,28,16,0.32))}
.prop-coins i{position:absolute;width:118px;height:118px;border-radius:50%;
  background:radial-gradient(circle at 38% 34%, ${sc.brassLight} 0%, ${sc.brass} 68%, #8C6631 100%);
  border:3px solid #7C5A2C}
.prop-coins i:nth-child(1){left:0;top:0;transform:rotate(-8deg)}
.prop-coins i:nth-child(2){left:56px;top:2px}
.prop-coins i:nth-child(3){left:92px;top:-2px;transform:rotate(7deg)}

/* ---------- copy ---------- */
.copyblock{position:absolute;z-index:20;display:flex;flex-direction:column;gap:${t.space.sm}px}
.copyblock.scrimmed{padding:${t.space.lg}px;border-radius:22px;
  background:${sc.copyScrim};backdrop-filter:saturate(1.05)}
.copyblock.pad{padding:${t.space.md}px 0}

.kicker{font-family:${f.sans};font-weight:${f.weight.semibold};font-size:${f.size.kicker}px;
  letter-spacing:.26em;text-transform:uppercase;color:${c.accentDark}}
.headline{font-family:${f.display};font-weight:${f.weight.semibold};
  font-size:104px;line-height:1.02;letter-spacing:-.02em;color:${c.ink}}
.headline.md{font-size:80px}
.subhead{font-family:${f.display};font-weight:${f.weight.semibold};font-size:56px;
  line-height:1.12;letter-spacing:-.01em;color:${c.ink}}
.spec{font-family:${f.sans};font-weight:${f.weight.semibold};font-size:${f.size.spec ?? f.size.small}px;
  letter-spacing:.16em;text-transform:uppercase;color:${c.ink}}
.leadline{font-family:${f.sans};font-size:${f.size.lead}px;line-height:1.4;color:${c.subtleInk};max-width:1180px}
.accent-rule{width:132px;height:4px;background:${c.accent};border:0;border-radius:2px}
.accent-rule.thin{height:3px;width:96px}

/* tracked-caps label with a short terracotta tick — A4 / US LETTER / PLAN */
.chip{display:inline-flex;align-items:center;gap:16px;font-family:${f.sans};
  font-weight:${f.weight.semibold};font-size:28px;letter-spacing:.18em;text-transform:uppercase;color:${c.ink}}
.chip::before{content:"";width:34px;height:4px;background:${c.accent};border-radius:2px;flex:none}
.chip.stack{flex-direction:row}

/* how-it-works numeral */
.stepnum{font-family:${f.display};font-weight:${f.weight.semibold};font-size:120px;line-height:.8;
  color:${c.accent}}
.steprow{display:flex;align-items:center;gap:${t.space.lg}px}
.steprow .st-t{font-family:${f.display};font-weight:${f.weight.semibold};font-size:52px;color:${c.ink};line-height:1.05}
.steprow .st-c{font-size:${f.size.body}px;color:${c.subtleInk};line-height:1.4;max-width:980px;margin-top:10px}

/* ---------- brand mark (bottom-left, always present for QC) ---------- */
.brandfoot{position:absolute;left:96px;bottom:84px;z-index:25;display:flex;align-items:center;gap:22px;
  font-family:${f.sans};font-size:22px;color:${c.ink}}
.brandfoot .mark{font-family:${f.display};font-weight:${f.weight.semibold};font-size:28px;letter-spacing:.04em}
.brandfoot .sep{width:2px;height:26px;background:${c.accent};opacity:.9}
`;
}
