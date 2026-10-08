# Product 003 font evidence

Downloaded directly from the upstream sources on 2026-09-17. Exact local SHA-256 hashes appear in every generated proof manifest. No installed system fonts or legacy product font files are used.

| Font | Upstream source | Licence evidence | Purpose / fallback |
|---|---|---|---|
| Bodoni Moda Regular + Italic | [Google Fonts distribution](https://github.com/google/fonts/tree/main/ofl/bodonimoda); [original project](https://github.com/indestructible-type/Bodoni) | Bundled `LICENSE-BodoniModa.txt`, SIL OFL 1.1, copyright 2020 project authors | Fashion/editorial titles, italic voice; Georgia/serif emergency fallback |
| Source Sans 3 Regular + Semibold | [Adobe upstream release](https://github.com/adobe-fonts/source-sans/tree/release/OTF) | Bundled `LICENSE-SourceSans3.md`, SIL OFL 1.1, Adobe 2010–2024, Reserved Font Name Source | Utility details, forms, puzzle cells; Arial/sans-serif emergency fallback |

Unmodified original font binaries and licence notices are retained. OFL permits use, embedding and redistribution under its conditions; fonts are not sold on their own, and notices accompany distribution. No renamed/modified font binary is produced.

Bodoni's variable regular/italic files are used at weight 400 and optical size 18. Browser `@font-face` normalizes ascent/descent to 95%/25% and removes line gap for predictable boxes; this is CSS layout configuration, not a font-file modification. Title line-height is 1.3; high-fashion hairlines still require representative physical print inspection in Prompt 8.

Browser embedding: fonts are base64 local data resources in the self-contained editor and generated HTML. The renderer explicitly loads all four faces; failures stop proof production. PDF embedding: this Chromium build emits self-contained **Type 3 font glyph streams with ToUnicode maps**, rather than FontFile2/3 binaries. Preflight checks every CharProcs glyph stream and Unicode map, so these are not dependent on installed reader fonts; text extraction remains functional. Conventional embedded FontFile/FontFile2/FontFile3 resources are also supported by the checker. Unit tests check glyph presence for the actual default, maximum, UK/US and special-character fixtures. All utility text is at least 8.5 pt; activity letters are 12 pt. Reader/physical-printer compatibility is still part of later full QC; the proof does not claim PDF/X certification.

Fallbacks are diagnostic safeguards, not accepted substitutions. A missing bundled font fails validation. Supported editing is Latin-script text with common punctuation; unsupported scripts and emoji are rejected rather than silently rendered with a system fallback.
