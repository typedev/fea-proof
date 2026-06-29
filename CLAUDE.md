# CLAUDE.md

Guidance for working in this repo. See `README.md` for the user-facing overview.

## What this is

Client-side web tool: drop a font → introspect its OpenType (GSUB/GPOS) features →
render before/after proofs per feature on real words. **No backend; nothing is
uploaded.** React + Vite + TypeScript + Tailwind v4.

## Commands

```sh
npm run dev      # Vite dev server at http://localhost:5173
npm run build    # tsc --noEmit && vite build  (run before committing)
npm run test     # Vitest (no suites yet)
npx tsc --noEmit # type-check only
./deploy.sh      # build + publish to your configured target (see "Deploy" below)
```

Font introspection (ground-truth GSUB/GPOS/cmap dumps): use the git-ignored
Python venv — `.venv/bin/python` has **fonttools** (+ `ttx`, `pyftsubset`).
Managed with `uv`; add packages via `uv pip install --python .venv/bin/python <pkg>`.

## Architecture

- `src/core/` — font logic, framework-agnostic:
  - `load.ts` — File → sfnt (woff2 decoded via `woff2-encoder`), `opentype.js` parse,
    register `FontFace`. Returns `LoadedFont`.
  - `introspect.ts` — walk GSUB/GPOS ScriptList→LangSys→FeatureList→LookupList into
    `FeatureInfo[]` (tag, name, tables, default-on/off, scripts, langs, lookup types).
    Unwraps Extension lookups (type 7).
  - `glyphs.ts` — inverted cmap (`buildReverseCmap`), `coverageGlyphs`, `resolveLookup`.
  - `features/single.ts` — `affectedInputChars` (type-1 input chars; filters combining
    marks/format/control). `features/ligature.ts` — `reconstructLigatures` (type-4
    component sequences).
  - `registry.ts` — feature tag → name, default-on set, ignored set (`kern`).
  - `combinations.ts` — group base glyphs by the set of features that affect them
    (for the combinations explorer).
  - `interactions.ts` — `effectiveFeatures`: which toggled features actually change
    the shaping in the current state (live dependency/conflict indication).
  - `shape.ts` — lazy harfbuzzjs (wasm) wrapper: `loadShaper(sfnt)`, `shape()`,
    `changedRanges()` (character ranges whose shaping differs between two
    variants), `setVariations`; plus `loadOutlineFont(sfnt)` — an ISOLATED hb.Font
    exposing `glyphPath`/`glyphExtents` for VF-interpolated outlines (opentype.js
    can't interpolate gvar; kept separate so its axis state can't corrupt the
    shared analysis font).
  - `substitution.ts` — glyph substitution graph (type 1/3/4) + `resolveGlyph`
    (trace non-cmapped glyphs back to base chars + producer features).
  - `context.ts` — `deriveTriggers`: read contextual lookups (type 5/6, Format 3)
    to build trigger strings analytically.
  - `inspect.ts` — `findOrphanGlyphs`: glyphs with no cmap that no feature can
    produce (the "Unreachable glyphs" section).
  - `variations.ts` — variable fonts: `readVariations` (fvar axes + named
    instances), `defaultCoords`; `findTable(sfnt, tag)` raw sfnt table locator
    (shared). Recovers the HIDDEN-axis flag via a manual byte parse — opentype.js
    drops it. `LoadedFont.variations`.
  - `coords.ts` — normalized↔user-space: `toUserCoord` (avar-inverse + denormalize),
    `normalizeCoords` (user→normalized: fvar-linear + avar-forward, fvar axis
    order — for the ItemVariationStore), `inConditionCoords` (a user-space point
    inside a rvrn condition, for "apply coordinates"), `readAvarSegments`.
  - `featureVariations.ts` — manual DataView parse of GSUB `FeatureVariations`
    (rvrn; opentype.js doesn't expose it): `readFeatureVariations`,
    `rvrnSubstitutionGroups` (base→variant glyph pairs grouped by alternate lookup).
  - `marks.ts` — `buildMarkInventory`: base/mark glyph lists from GDEF
    `glyphClassDef` (class 1 = base, 3 = mark), cmap-joined. Powers the mark explorer.
  - `markAnchors.ts` — manual GPOS parse of mark (type 4) + mkmk (type 6)
    attachment (opentype.js returns `{error}` for these): `parseMarkAnchors`,
    `attachToBase`, `attachToMark`, `placeMarks` (anchor-based glyph positioning).
    For variable fonts: reads anchor fmt3 device VariationIndex + the GDEF
    ItemVariationStore; `resolveAnchor`/`placeMarks(…, resolve)` move anchors with
    the axes.
  - `itemVariationStore.ts` — parse the GDEF ItemVariationStore (`parseItemVariationStore`,
    incl. LONG_WORDS) + `regionScalar`/`ivsDelta` (variable anchor/metric deltas).
  - `unicodeName.ts` — Unicode standard names; lazily imports the bundled
    `unicodeNames.json` table (CJK derived algorithmically).
  - `types.ts` — shared types.
- `src/samples/` — sample-text generation:
  - `index.ts` — `prepareSamples(font, features)` → `Map<tag, FeatureSample>`; dispatches
    each feature (see "Dispatch" below); builds `locl` per-language samples.
  - `pick.ts` — choose real words covering affected chars (`pickSample`,
    `pickLigatureSample`), `classifyScript`. `pickSample` takes an `offset`
    (rotate the pool) so different features don't all surface the same
    top-frequency words (callers pass `tagOffset(tag)`), and `minLen` (default 4)
    to skip 2–3 letter function words — a 2nd pass rescues an otherwise-orphan
    char with a short word. `findLigatureWord` matches ligature sequences
    CASE-INSENSITIVELY then refits the word's case (uppercase display ligatures
    like `AA`/`AND` would otherwise find nothing in lowercase wordlists — this
    took one uppercase-ligature display face from 5/766 covered to ~670).
  - `spotlight.ts` — `inlineSamples`: lazily picks a demo word for each affected
    item so each tile shows `glyph1 → glyph2` PLUS that word (rendered with the
    feature applied, the item highlighted by string position — no shaping). Word
    bank is font-INDEPENDENT so it's cached globally; loaded when a grid expands.
    Multi-codepoint items use the ligature matcher; singles use `singleCandidates`
    (word start/end/middle interleaved, so positional contextual alternates —
    e.g. word-initial-only ssXX — surface a triggering word). Items with no word
    show just the pair. (Earlier hover-popover design removed for inline cells.)
  - `languages.ts` — `LanguageInfo[]` (OT-lang tag ↔ name ↔ BCP-47 ↔ wordlist
    `code`, per script), lazy `import.meta.glob` of `wordlists/*.json`. Used
    only for `locl` matching + word sourcing. `loadWordBank` **interleaves**
    languages round-robin (not `flat()`) so no single language dominates picks.
  - `wordlists/` — bundled FrequencyWords (MIT), trimmed per language (~5k each).
- `src/render/` — `featureSettings.ts` (before/after `font-feature-settings`:
  plain, ligature isolation, figure isolation `figureBeforeAfter`/`figureFeatures`;
  plus `toVariationSettings` for `font-variation-settings`), `Preview.tsx`,
  `LoclPreview.tsx` (per-language cells + localized-forms inventory, each form
  shown with an inline localized demo word), `highlight.tsx` (mark affected chars).
  - `variationContext.ts` — React context carrying the current
    `font-variation-settings` string into EVERY preview (avoids prop-drilling
    axis coords through the whole tree).
  - `featureVariationsContext.ts` — context with the rvrn substitution groups
    (keyed by substituted feature tag) + `applyByLookup` coords + `onApply`, so
    they render inside the substituted feature's (navigable) card.
- `src/ui/` — `DropZone`, `Header`, `Controls` (sticky bar; hosts `FeatureNav`,
  `AxisControls`, publishes `--scroll-offset`), `AxisControls` (variable-font axis
  sliders + named-instance picker; collapses >4 axes, hides hidden axes),
  `FeatureNav` (jump-list), `FeatureList`, `FeatureCard`, `AffectedGlyphs` (full
  inventory; each tile shows the pair plus an inline demo word — off for numeric
  features, gated by `isFigureLikeFeature`), `AltGrid` (alternates),
  `FeatureVariationsGroups` (rvrn: base→variant glyph-outline pairs + condition
  ranges + "apply coordinates", rendered inside the feature card),
  `ContextualExamples`, `CombinationExplorer`, `OrphanGlyphs` (unreachable),
  `GlyphOutline` (render a glyph by gid from its outline; `fit` bbox mode for
  marks/variants — shared by OrphanGlyphs, rvrn groups, mark explorer),
  `MarkExplorer` (full-screen mark·mkmk explorer overlay), `ComposedGlyphs`
  (base + marks positioned by GPOS anchors in one SVG).
- `src/App.tsx` — state + layout (incl. axis `coords`, the variable/rvrn/mark
  contexts, and the mark-explorer overlay state).

## Conventions & hard-won gotchas

- **WOFF2: use `woff2-encoder/decompress`, NOT `wawoff2`.** wawoff2's emscripten
  binding hangs under Vite (sync init races `onRuntimeInitialized`). opentype.js
  reads otf/ttf/woff1 natively; only woff2 needs decoding. `FontFace` is given the
  original bytes (browser decodes all four formats for rendering).
- **opentype.js ESM exports a named `parse`** — `import { parse } from 'opentype.js'`
  (no default export).
- **Dispatch previews by ACTUAL lookup type, not by tag.** Fonts implement the same
  feature with different lookups (e.g. `dlig` as type-1 decorative alts; `ordn` as a
  type-4 ligature `No`→№). Rule in `samples/index.ts`: locl → aalt/salt
  (alternates grid) → case → figure templates → collect contextual (type 5/6)
  examples → type-4 ⇒ ligature (or cascade) → type-1 ⇒ cascade/single → else
  (contextual-only) examples. A feature can mix kinds, so examples are gathered
  alongside the primary ligature/single preview.
- **Lookup application order = LookupList index order** (ascending), NOT feature
  order (per the OpenType spec). Combinations sort feature toggles by min lookup
  index; the browser shaper applies enabled features correctly.
- **`locl` is language-driven**, not toggled by `font-feature-settings`. Proof each
  language with `font-language-override: "TAG"` (+ `lang`). Confirmed to switch
  glyphs in Chromium. Each language shows a real-word proof AND a **full
  default→localized inventory** of every input char it substitutes — a picked
  word covers only a few forms (Bulgarian alone localizes ~27 letters). The
  inventory is skipped only for coverage-string samples (the word already lists
  every form). See `LoclPreview` / `buildLoclSample`.
- **Naming locl languages: extend `languages.ts`.** An unmatched OT-lang tag
  falls back to showing the bare tag (e.g. `BSH`) with no native words. To audit
  which tags a font (or `test_fonts/`) gates `locl` with, dump LangSys tags via
  fonttools and cross-ref `LANGUAGES`. Entries without a `wordlists/<code>.json`
  still resolve a name + BCP-47 (words fall back to the script bank). The same
  OT tag can appear under multiple scripts (e.g. `SRB` latn + cyrl) — add an
  entry per script.
- **Ligature before/after is isolated**: `before` disables ALL ligature features so
  components show separately; `after` enables only the target (standard liga/clig
  are default-on and would otherwise ligate identically on both sides). See
  `ligatureBeforeAfter`.
- **Figure features are isolated** (like ligatures). A figure feature's lookup
  often doesn't touch the base cmapped digit (its input is another figure's
  output, e.g. `lnum` converts the oldstyle glyph). Proofing it naively let the
  cascade path fabricate a producer — usually the `aalt` catch-all — and enable
  it in BOTH cells, polluting "default" with arbitrary first-alternates. Fix:
  `figureBeforeAfter`/`figureFeatures` turn the whole figure group (+ aalt/salt)
  OFF for "before" and toggle only the target for "after"; figure-template
  features are handled there and NEVER fall through to the cascade. If the
  isolated toggle changes nothing (e.g. `lnum` on an already-lining font), the
  proof is honestly identical with a "no effect on this font's default figures"
  note (`inert`). Separately, `aalt`/`salt` are never used as cascade producers.
- **Cascades label their producer context — "default" must never lie.** A genuine
  cascade (a feature acting on glyphs another feature makes, e.g. `ss03` restyling
  `dlig` ligatures) keeps the producer(s) ON in BOTH cells — the target has nothing
  to act on otherwise. So a bare "default" label would be false. `cascadeLabels`
  names the actual context from whatever producers were detected: `dlig` /
  `dlig + ss03`, or `numr + dnom` / `numr + dnom + frac`. The sample carries this
  as `labels`, passed through to `Preview`. Non-cascade single features keep the
  default `default`/`feature on` labels. Generalizes to any producer set; if a
  glyph has multiple possible producers, `resolveGlyph` picks one path (use the
  combinations explorer to see the full interaction space). Guiding rule: a
  "default" cell must show either the true font default or an explicitly-named
  producer context — never a silently pre-applied feature.
- **Highlighting is a real HarfBuzz shaping diff** (`shape.ts` `changedRanges` →
  `samples/index.ts` → `highlight.tsx`): exact changed clusters as char ranges,
  ratio-gated for single/locl (skip when ~everything changes), exempt for
  ligatures. Degrades gracefully (no highlight) if the wasm fails to load.
- **Contextual features** (calt, context swashes): triggers are derived
  analytically from the lookup rules (`context.ts`, all subtable Formats 1/2/3),
  non-cmapped context glyphs resolved via the substitution graph
  (`substitution.ts`); confirmed by shaping. No brute-force. A feature shows ALL
  its contextual substitutions (one example per rule), alongside any
  ligature/single primary — features mix lookup kinds.
- **Contextual features are also proofed on real words.** One derived trigger only
  stands in ONE representative ('o') for a 98-glyph "any letter" rule (e.g. a
  swash's init/fin forms), so `contextualInputChars` returns the whole substituted
  coverage; a contextual feature with cmapped base input is dispatched like a
  `single` — a real-word primary preview PLUS the full affected-letter grid (each
  letter gets a shape-verified inline demo word) — with the per-rule triggers kept
  alongside. Boundary handling: the inline shape-check tries each candidate word
  BOTH standalone and space-padded (` word `) and renders whichever context
  actually fires — an initial form triggers at the string start (no space), a
  swash-final form needs a real space after the letter, and they'd cancel under a
  single fixed context.
- **Positional features** (`init`/`fina`/`medi`/`isol`) are usually plain
  single-subs (no positional gating of their own — `calt` drives position at
  runtime), so forcing `fina=1` applies the final form to the WHOLE run. The demo
  word must therefore place the glyph in the named position and highlight only it
  (`positionalRole` → `inlineSamples` position arg: init=start, fina=end,
  medi=mid, isol=space-isolated); otherwise a final form shows up word-initially
  and reads as a wrong substitution. A letter with no word in that slot (few words
  end in `b`) honestly falls back to the bare pair.
- **Default-on/off matters**: default-off → before = baseline, after = `"tag" 1`;
  default-on → before = `"tag" 0`, after = `"tag" 1`.
- **Sticky nav scroll offset.** The feature navigator lives in the sticky
  `Controls` bar; it measures its own height (ResizeObserver) into the
  `--scroll-offset` CSS var. Every jump target (`FeatureCard`,
  `CombinationExplorer`, `OrphanGlyphs`) sets `scroll-margin-top:
  var(--scroll-offset)` so a jumped-to heading lands just below the bar instead
  of hiding under it. Anchor ids: `featureAnchorId(feature)`,
  `feature-combinations`, `unreachable-glyphs`.
- **Variable fonts.** `Controls`→`AxisControls` exposes axis sliders + a
  named-instance picker; the chosen coords (`Record<tag, value>`, user-space)
  drive `font-variation-settings` on EVERY preview via `VariationSettingsContext`,
  and `shape.ts setVariations` keeps the HarfBuzz analysis at the same point.
  opentype.js does NOT expose the fvar axis `flags`, so the HIDDEN flag is read by
  a manual byte parse (`variations.ts`); hidden axes get no slider but stay in the
  coord map. Normalization ALWAYS maps axis min→−1, default→0, max→+1 regardless
  of avar (only interior points remap) — used by `inConditionCoords`'s anchor
  rule. Condition ranges are shown in user-space via `toUserCoord` (avar-inverse).
- **rvrn / GSUB FeatureVariations.** opentype.js doesn't parse it → manual
  DataView parse (`featureVariations.ts`, mirrors the `findTable` byte-parse
  pattern). Conditions are NORMALIZED axis ranges (F2Dot14). It substitutes a
  feature's lookups by coordinate (NOT a toggle), and can be active AT THE DEFAULT
  instance — so don't diff default-vs-coordinate; show the analytical base→variant
  pairs (`rvrnSubstitutionGroups`) as glyph outlines instead. Rendered inside the
  substituted feature's card (usually `rvrn`) via `FeatureVariationsContext`; each
  group has an "apply coordinates" button (`inConditionCoords` → set global coords).
- **mark / mkmk explorer.** mark (GPOS type 4 MarkToBase) / mkmk (type 6
  MarkToMark) POSITION a mark glyph on a base/another-mark by matching per-class
  anchors — no precomposed glyph needed. The base/mark glyph lists come from GDEF
  `glyphClassDef` (opentype DOES parse that), but the ANCHORS do NOT (GPOS mark
  subtables come back `{error}`) → manual byte parse (`markAnchors.ts`; GPOS
  Extension is type 9). **Do NOT compose via browser text:** the browser/HarfBuzz
  normalizes "a"+U+0304 into the precomposed `amacron` (and the acute then lands
  offset), hiding real attachment — so we position glyph OUTLINES ourselves
  (`placeMarks` → `ComposedGlyphs`). Math (verified vs HB): mark-to-base
  `markPos = baseAnchor − markAnchor`; mkmk `mark2Pos + mark2Anchor − mark1Anchor`.
  Marks that can't attach to the selected base / top mark are greyed out.
  **Variable-font-accurate:** the preview follows the axes — outlines via HB
  `loadOutlineFont`/`glyphToPath` (opentype can't interpolate), anchors via the
  GDEF ItemVariationStore (`itemVariationStore.ts` + `markAnchors` device
  VariationIndex + `coords.normalizeCoords`); axis sliders live INSIDE the modal
  (it covers the page). Verified exact vs HB (`b+macron+acute` @wght900). Both HB
  `glyphToPath` and opentype raw `glyph.path` are Y-UP (only `getPath()` flips) —
  `ComposedGlyphs` takes y-up items and flips once. (Columns stay default-master.)
- **Shared glyph-inventory style + size.** New glyph-grid UIs reuse the common
  tile look (container `bg-neutral-50`, tile `bg-white`, muted base → arrow →
  variant) and the shared size cap `Math.min(size, 30)` — don't invent a new
  look/sizing (see `AffectedGlyphs`, rvrn groups, `OrphanGlyphs`, mark columns).
  `GlyphOutline`'s `fit` mode renders a glyph at em-proportion from its bbox
  (marks have ~0 advance and would otherwise clip). Scrollbars are theme-colored
  app-wide in `src/index.css`.

## Deploy

The build uses a **relative base** (`base: process.env.VITE_BASE || './'` in
`vite.config.ts`), so `dist/` is portable — host it at a root or any subfolder
without rebuilding. `./deploy.sh` is generic: it reads the publish target from a
git-ignored `deploy.config` (`DEPLOY_DEST=...`, copied from
`deploy.config.example`), builds, copies `dist/` there, then commits & pushes
that repo. Keep personal hosting paths in `deploy.config` only — never hardcode
them in tracked files (this repo is public). Push only on the user's explicit
request.

**Verify a prod build with a plain static server** (`npx serve dist`, or lay it
out under a subfolder and `python3 -m http.server`), NOT `npm run preview` —
vite preview 404s requests carrying `Sec-Fetch-Dest: script` (the header
Chromium sends for module scripts), so the app won't load in a browser even
though curl gets 200. Real static hosts (GitHub Pages, etc.) don't do this.

## Test fonts

Live in `test_fonts/` and are **git-ignored** (licensing/cleanliness). The dev
server serves them at `/test_fonts/<file>`. OFL references: Source Code Pro, EB
Garamond (also a `wght` variable font), and **Recursive** (5-axis VF with GSUB
`FeatureVariations`/`rvrn` and mkmk — the test case for the variable + mark work;
see `test_fonts/README.md`). Don't commit fonts or reference non-public/NDA fonts
in code, docs, or commit messages.

## Verifying in the browser (Playwright MCP)

Run the dev server, then navigate to `http://localhost:5173`, click the drop zone
(`div[role="button"]`) and `browser_file_upload` a font from `test_fonts/`.

Gotcha: when probing modules via `browser_evaluate` with dynamic `import('/src/...')`,
the ES module is cached per URL for the page session — **reload the page** to pick
up source edits, or the probe runs stale code.

## Deferred (future)

- rvrn follow-ups: general conditional-features / axis-space explorer; ConditionTable
  formats 2/3; avar2 / dozens-of-axes register UI.
- Mark explorer follow-ups: >2 mixed above/below stacks (the "previous mark" host
  heuristic), fmt2 anchorPoint, non-cmapped marks, RTL; VF-aware column tiles
  (currently default-master).
- More scripts (Arabic/Indic/Hebrew); visual design pass.
- Cyrillic variants of the Turkic locl langs: `KAZ` now has a Cyrillic entry
  (`kk`, with a real wordlist — Kazakh is primarily Cyrillic); `AZE`/`TAT`/`CRT`
  remain `latn`-only, so a font gating their Cyrillic `locl` shows the bare tag.
- `az` has no FrequencyWords corpus (404 in both 2016/2018), so Azerbaijani `locl`
  falls back to the general Latin bank + the localized-forms inventory.

Done already: alternates (`ui/AltGrid.tsx`, `font-feature-settings: "<tag>" N`);
full per-language `locl` inventory; sticky feature navigator; portable
relative-base deploy; figure-feature isolation + honest cascade labels (swept all
`test_fonts/` for "default"-cell leaks — clean except intended `dlig` cascades);
**variable fonts** (axis sliders + named instances + `font-variation-settings`
everywhere); **rvrn / FeatureVariations** (conditional substitutions in the
feature card, with "apply coordinates"); **mark·mkmk explorer** (anchor-based
composition + validity gating + variable-font-accurate outlines & anchors).
