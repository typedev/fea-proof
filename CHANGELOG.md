# Changelog

All notable changes to this project are recorded here. The format is loosely based
on [Keep a Changelog](https://keepachangelog.com/); the project does not use formal
version numbers yet, so changes are grouped by date under **Unreleased** until
deployed.

Test fonts are never named here (some are under NDA); changes are described by the
OpenType feature or UI area they affect.

## [Unreleased]

### Fixed
- Ligatures no longer break when a sample wraps to a new line — each word is kept
  intact, so arrow ligatures and the like survive wrapping (most visible at large
  sizes).
- Ordinal proofs (`ordn`) render every ordinal form correctly even when a sample
  mixes scripts: a script-neutral digit no longer inherits a neighbouring token's
  script and suppresses the ligature. Each ordinal token is shaped in isolation.
- The `ordn` fallback template lists only the ordinal forms a font actually builds,
  instead of showing unsupported placeholders.
- A feature whose glyphs are all produced by another feature (e.g. a stylistic set
  restyling ligatures) no longer fabricates a misleading cross-feature proof in its
  card — it now points to the Feature Combinations explorer. This also removes
  occasional garbled demo words on decorative faces.
- Demo words now render the highlighted target in its own shaping run (its feature
  on) with the surrounding text ligatures-off, so a greedy/longer ligature can't
  absorb the target and the tile shows exactly the substitution it claims (e.g. an
  `AA` ligature instead of `MA`+`AR`).

## 2026-06-29

### Added
- The feature navigator moves into a right-hand side rail on short-height viewports,
  reclaiming vertical space for the proofs (tall screens are unchanged).
- A "scroll to top" button in the controls bar.

### Changed
- The mark · mkmk explorer switches to a three-column layout (bases · preview ·
  marks) on short-height viewports, and the composed-glyph preview now scales to
  fit its box instead of overflowing on small screens.
