# Changelog

All notable changes to this project are recorded here. The format is loosely based
on [Keep a Changelog](https://keepachangelog.com/); the project does not use formal
version numbers yet, so changes are grouped by date under **Unreleased** until
deployed.

Test fonts are never named here (some are under NDA); changes are described by the
OpenType feature or UI area they affect.

## [Unreleased]

## 2026-06-30

### Added
- Stylistic sets and character variants now show the type designer's own name
  (e.g. "Single-story 'a'") read from the font's GSUB feature parameters, in place
  of the generic "Stylistic Set N" / "Character Variant N" label. Fonts without a
  supplied name keep the generic label.
- Fonts using avar2 (the `avar` table, version 2+ — many axes driven by an
  axis-to-axis mapping) are now detected on load and politely refused with an
  explanatory banner instead of being loaded. Browser preview rendering is
  unreliable for avar2 and could destabilize the page; full avar2 support is planned
  separately.

### Fixed
- The glyph-outline cells (Feature combinations and Unreachable glyphs) now render
  through HarfBuzz instead of opentype.js. This fixes two variable-font problems:
  composite glyphs no longer vanish to their glyph name (opentype.js produced NaN
  path data for composites at a fractional baseline), and the cells now follow the
  axis sliders — outlines interpolate with the design coordinates like every other
  cell, instead of being frozen at the default master.

### Changed
- Feature combinations are now coordinate-aware on fonts with conditional
  substitutions (GSUB FeatureVariations): the stacked forms re-shape at the current
  design coordinate, so a substitution that fires only inside an axis range shows up
  in the matrix once that range is entered (e.g. via a feature card's "apply
  coordinates"). Fonts without FeatureVariations keep the single up-front enumeration.

## 2026-06-29

### Added
- Feature Combinations is now an inline section that auto-surfaces only the glyphs
  whose features GENUINELY combine: for each such glyph or ligature it lists every
  distinct stacked form (features applied in the font's LookupList order) as a glyph,
  labelled with the minimal feature combination that produces it. Click a feature tag
  to jump to its card; a "Show all" button reveals the rest. Forms that are merely
  parallel single-feature alternates are omitted — they already appear on each
  feature's own card. Replaces the earlier toggle-chip explorer.
- The feature navigator moves into a right-hand side rail on short-height viewports,
  reclaiming vertical space for the proofs (tall screens are unchanged).
- A "scroll to top" button in the controls bar.

### Changed
- Feature combinations now isolate ligature and contextual fragments: a ligature is
  only stacked with features that genuinely restyle its OUTPUT, never with an
  unrelated feature pulled in just because one of its characters happens to appear
  inside the ligature (e.g. a figure feature matched by a digit inside a ligature
  word). This removes nonsensical combinations and the all-on-all blow-up on faces
  with many ligatures.
- A feature whose glyphs are all produced by another feature (e.g. a stylistic set
  restyling ligatures) now shows the real default→feature inventory of those restyled
  glyphs on its card, alongside a pointer to Feature Combinations — instead of only a
  pointer, and with no fabricated cross-feature word proof (so the occasional garbled
  demo word on decorative faces is gone too).
- Outline glyph cells (Feature Combinations, conditional / `rvrn` substitutions,
  unreachable glyphs) now match the single-feature cards' glyph cells in size and
  baseline: the glyph is positioned from the font's own metrics instead of rendering
  smaller and sitting high.
- The mark · mkmk explorer switches to a three-column layout (bases · preview ·
  marks) on short-height viewports, and the composed-glyph preview now scales to
  fit its box instead of overflowing on small screens.

### Fixed
- Ligatures no longer break when a sample wraps to a new line — each word is kept
  intact, so arrow ligatures and the like survive wrapping (most visible at large
  sizes).
- Ordinal proofs (`ordn`) render every ordinal form correctly even when a sample
  mixes scripts: a script-neutral digit no longer inherits a neighbouring token's
  script and suppresses the ligature. Each ordinal token is shaped in isolation.
- The `ordn` fallback template lists only the ordinal forms a font actually builds,
  instead of showing unsupported placeholders.
- Demo words now render the highlighted target in its own shaping run (its feature
  on) with the surrounding text ligatures-off, so a greedy/longer ligature can't
  absorb the target and the tile shows exactly the substitution it claims (e.g. an
  `AA` ligature instead of `MA`+`AR`).
