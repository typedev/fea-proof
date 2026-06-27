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
    `changedRanges()` (character ranges whose shaping differs between two variants).
  - `substitution.ts` — glyph substitution graph (type 1/3/4) + `resolveGlyph`
    (trace non-cmapped glyphs back to base chars + producer features).
  - `context.ts` — `deriveTriggers`: read contextual lookups (type 5/6, Format 3)
    to build trigger strings analytically.
  - `inspect.ts` — `findOrphanGlyphs`: glyphs with no cmap that no feature can
    produce (the "Unreachable glyphs" section).
  - `types.ts` — shared types.
- `src/samples/` — sample-text generation:
  - `index.ts` — `prepareSamples(font, features)` → `Map<tag, FeatureSample>`; dispatches
    each feature (see "Dispatch" below); builds `locl` per-language samples.
  - `pick.ts` — choose real words covering affected chars (`pickSample`,
    `pickLigatureSample`), `classifyScript`.
  - `languages.ts` — `LanguageInfo[]` (OT-lang tag ↔ name ↔ BCP-47 ↔ wordlist
    `code`, per script), lazy `import.meta.glob` of `wordlists/*.json`. Used
    only for `locl` matching + word sourcing.
  - `wordlists/` — bundled FrequencyWords (MIT), trimmed per language.
- `src/render/` — `featureSettings.ts` (before/after `font-feature-settings`),
  `Preview.tsx`, `LoclPreview.tsx` (per-language cells + localized-forms
  inventory), `highlight.tsx` (mark affected chars).
- `src/ui/` — `DropZone`, `Header`, `Controls` (sticky bar; hosts `FeatureNav`
  + publishes `--scroll-offset`), `FeatureNav` (jump-list), `FeatureList`,
  `FeatureCard`, `AffectedGlyphs` (full inventory), `AltGrid` (alternates),
  `ContextualExamples`, `CombinationExplorer`, `OrphanGlyphs` (unreachable).
- `src/App.tsx` — state + layout.

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
- **Default-on/off matters**: default-off → before = baseline, after = `"tag" 1`;
  default-on → before = `"tag" 0`, after = `"tag" 1`.
- **Sticky nav scroll offset.** The feature navigator lives in the sticky
  `Controls` bar; it measures its own height (ResizeObserver) into the
  `--scroll-offset` CSS var. Every jump target (`FeatureCard`,
  `CombinationExplorer`, `OrphanGlyphs`) sets `scroll-margin-top:
  var(--scroll-offset)` so a jumped-to heading lands just below the bar instead
  of hiding under it. Anchor ids: `featureAnchorId(feature)`,
  `feature-combinations`, `unreachable-glyphs`.

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
Garamond (see `test_fonts/README.md`). Don't commit fonts or reference
non-public/NDA fonts in code, docs, or commit messages.

## Verifying in the browser (Playwright MCP)

Run the dev server, then navigate to `http://localhost:5173`, click the drop zone
(`div[role="button"]`) and `browser_file_upload` a font from `test_fonts/`.

Gotcha: when probing modules via `browser_evaluate` with dynamic `import('/src/...')`,
the ES module is cached per URL for the page session — **reload the page** to pick
up source edits, or the probe runs stale code.

## Deferred (future)

- More scripts (Arabic/Indic/Hebrew); visual design pass.
- Cyrillic variants of the Turkic locl langs (AZE/KAZ/TAT/CRT are added under
  `latn` only — a font gating their Cyrillic `locl` would show the bare tag).

Done already: alternates (`ui/AltGrid.tsx`, `font-feature-settings: "<tag>" N`);
full per-language `locl` inventory; sticky feature navigator; GitHub Pages deploy.
