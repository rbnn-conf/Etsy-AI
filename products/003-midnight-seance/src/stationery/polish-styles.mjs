/** Prompt 4 refinement only. No modifications to approved Prompt 3 components. */
export function polishStyles(){return `
/* Botanicals interrupt the inner rules instead of floating above an intact rectangle. */
.design:not(.archetype-small):not(.archetype-apothecary) .frame:before{border-width:.8pt;clip-path:polygon(0 16%,1px 16%,1px 1px,16% 1px,16% 0,100% 0,100% 84%,calc(100% - 1px) 84%,calc(100% - 1px) calc(100% - 1px),84% calc(100% - 1px),84% 100%,0 100%)}
.design.welcome:not(.archetype-small):not(.archetype-apothecary) .frame:before,.design.archetype-sign:not(.archetype-small):not(.archetype-apothecary) .frame:before{clip-path:polygon(0 0,100% 0,100% 81%,calc(100% - 1px) 81%,calc(100% - 1px) calc(100% - 1px),81% calc(100% - 1px),81% 100%,19% 100%,19% calc(100% - 1px),1px calc(100% - 1px),1px 81%,0 81%)}
.design.master-S17:not(.archetype-small):not(.archetype-apothecary) .frame:before{clip-path:none}
.design:not(.archetype-small):not(.archetype-apothecary) .frame:after{display:none}
.frame .frame-break,.frame .frame-bead{display:none}.frame .corner{width:7mm;height:7mm;padding:1mm}
.formal-top-left{left:4mm;top:4mm;width:25mm;height:33mm}.formal-bottom-right{right:4mm;bottom:4mm;width:22mm;height:30mm}
.collection-line{font-size:9.5pt;letter-spacing:.11em}.utility-label{font-size:9pt;letter-spacing:.055em}.utility-copy{font-size:9pt;line-height:1.4}
/* Invitation: one connected summons, hero and title sequence; framed information below. */
.invitation-content{inset:12mm 14mm 12mm;justify-content:space-between;gap:1.8mm}.invitation-identity{display:flex;flex-direction:column;align-items:stretch;gap:1.3mm}.invitation-details{display:flex;flex-direction:column;align-items:stretch;gap:2mm}
.summons .kicker{font-size:12pt;margin-bottom:.4mm}.summons h1{font-size:32pt;letter-spacing:.035em}
.invitation-hero{height:28mm;margin-top:.3mm}.hero-moth{width:42mm;height:22mm;left:calc(50% - 21mm)}
.invitation-hero .moon-phases{width:47mm;height:6mm;left:calc(50% - 23.5mm);bottom:0}
.invitation .event-title{font-size:29pt;line-height:1.18;margin:.5mm auto 0}
.invitation .engraved-separator{width:68mm;height:5mm;margin:1mm auto}
.date-group{padding-top:2.5mm;border-top:.6pt solid var(--ornament);gap:1.2mm}
.venue-group{gap:1.1mm;margin-top:1mm}.date,.venue{font-size:11pt}.time,.address,.invitation .host{font-size:10pt;line-height:1.35}
.invitation .host{margin-top:1mm}.invitation-footer{padding-top:2mm;border-top:.6pt solid var(--ornament);gap:1.2mm}.rsvp{font-size:9.5pt}.dress-code{font-size:11pt;line-height:1.35}
.botanic-tl{width:30mm;height:33mm;left:4mm;top:4mm}.botanic-tr{width:25mm;height:29mm;right:4mm;top:4mm}.botanic-bl{width:23mm;height:27mm;left:4mm;bottom:4mm}.botanic-br{width:26mm;height:29mm;right:4mm;bottom:4mm}
.invitation:has(.event-title.long) .invitation-content{gap:1mm}.invitation:has(.event-title.long) .invitation-hero{height:15mm}.invitation:has(.event-title.long) .invitation-identity{gap:1mm}.invitation:has(.event-title.long) .invitation-details{gap:1mm}.invitation:has(.event-title.long) .date-group{padding-top:1mm}.invitation:has(.event-title.long) .invitation-footer{padding-top:1mm}.invitation .event-title.long{font-size:20pt;line-height:1.25}
/* Welcome: title, enlarged ravens and hosts form the central focal group. */
.welcome-content{inset:16mm 25mm 19mm;gap:2mm;justify-content:space-between}
.celestial-hero{height:33mm;width:74mm}.celestial-hero .crescent{width:28mm;height:31mm}.celestial-stars{top:7mm;width:12mm;height:16mm}
.welcome-greeting .kicker{font-size:26pt}.welcome-greeting h1{font-size:14pt;letter-spacing:.12em;margin-top:1mm}
.welcome .event-title{font-size:59pt;line-height:1.15}.welcome .host{font-size:13pt;line-height:1.4;letter-spacing:.065em}.welcome .host.long{font-size:11pt}
.raven-pair{width:75mm;height:35mm}.welcome-closing{padding:3mm 0 1mm;gap:2mm}.welcome .subtitle{font-size:12pt;line-height:1.35;letter-spacing:.06em}.welcome .motto{font-size:17pt;line-height:1.4}
.welcome-seal,.botanical-divider{width:83mm;height:19mm}.welcome-botanic-left{width:40mm;height:55mm;left:4mm;bottom:4mm}.welcome-botanic-right{width:35mm;height:49mm;right:4mm;bottom:4mm}
.welcome:has(.event-title.long) .raven-pair{width:58mm;height:28mm}.welcome:has(.event-title.long) .welcome-content{gap:2mm}.welcome:has(.event-title.long) .welcome-seal,.welcome:has(.event-title.long) .botanical-divider{height:14mm;width:68mm}
/* Menu: a joined moon/title block, legible accompaniments and an anchored seal. */
.menu-content{inset:11mm 16mm;gap:1.7mm;justify-content:space-between}.master-S11{--hero-w:18mm;--hero-h:20mm}
.master-S11 .formal-title{font-size:26pt;line-height:1.2;text-transform:uppercase;letter-spacing:.025em}
.course{padding-top:2mm;gap:1.1mm}.course-name{font-size:14.5pt;line-height:1.35}.course-detail{font-size:10.5pt;line-height:1.4;font-style:normal}.master-S11 .utility-copy{font-size:9.5pt}
.master-S11 .stationery-closing,.master-S11 .closing-art{height:15mm}.master-S11 .closing-art{width:22mm}
.course-name{text-wrap:balance}.master-S11 .formal-title.long{font-size:22pt}.master-S11:has(.formal-title.long) .menu-content{inset:10.5mm 16mm;gap:.7mm}.master-S11:has(.formal-title.long) .course{gap:.7mm;padding-top:1.3mm}.master-S11:has(.formal-title.long) .stationery-closing,.master-S11:has(.formal-title.long) .closing-art{height:13mm}
/* Other masters: systematic type and scale-sensitive decoration. */
.sign-content{gap:3mm}.sign-subtitle{font-size:14pt;letter-spacing:.035em}.sign-phrase{font-style:normal;font-size:17pt}.sign-botanical-left{left:4mm;bottom:4mm;width:39mm;height:54mm}.sign-botanical-right{right:4mm;bottom:4mm;width:33mm;height:47mm}
.formal-subtitle{font-size:12pt}.formal-detail{font-size:16pt}.details-content .field:not(.formal-title):not(.utility-copy){font-size:10.5pt;line-height:1.35}.details-content .utility-copy{font-size:9pt}
.drink-detail{font-size:9.5pt;line-height:1.4}.drink-list{gap:1.8mm}.drink-entry{gap:.5mm}
.small-frame{border-width:.75pt}.small-frame:before{border-width:.6pt}.small-star{width:6mm;height:6mm}.small-leaf-divider{width:34mm;height:8mm}
.food-note,.potion-detail{font-size:9pt;line-height:1.35}.potion-copy .utility-label{font-size:9pt}.tag-host{font-size:9.5pt;line-height:1.4}.thanks-signoff{font-size:10.5pt;line-height:1.4}.thanks-message{font-size:13.5pt;line-height:1.45}.thanks-content{gap:1.5mm}
.sheet.economy .frame:before{border:.6pt solid var(--rule)}.sheet.economy .small-frame:before{display:block;border:.4pt solid var(--rule)}
`;}
