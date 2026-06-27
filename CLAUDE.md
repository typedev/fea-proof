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
npm run test     # Vitest
npx tsc --noEmit # type-check only
```

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
  - `shape.ts` — lazy harfbuzzjs (wasm) wrapper: `loadShaper(sfnt)`, `shape()`,
    `changedRanges()` (character ranges whose shaping differs between two variants).
  - `substitution.ts` — glyph substitution graph (type 1/3/4) + `resolveGlyph`
    (trace non-cmapped glyphs back to base chars + producer features).
  - `context.ts` — `deriveTriggers`: read contextual lookups (type 5/6, Format 3)
    to build trigger strings analytically.
  - `types.ts` — shared types.
- `src/samples/` — sample-text generation:
  - `index.ts` — `prepareSamples(font, features)` → `Map<tag, FeatureSample>`; dispatches
    each feature (see "Dispatch" below); builds `locl` per-language samples.
  - `pick.ts` — choose real words covering affected chars (`pickSample`,
    `pickLigatureSample`), `classifyScript`.
  - `languages.ts` — language metadata + OT-tag↔BCP-47, lazy `import.meta.glob` of
    `wordlists/*.json`.
  - `wordlists/` — bundled FrequencyWords (MIT), trimmed per language.
- `src/render/` — `featureSettings.ts` (before/after `font-feature-settings`),
  `Preview.tsx`, `LoclPreview.tsx`, `highlight.tsx` (mark affected chars).
- `src/ui/` — `DropZone`, `Header`, `Controls`, `FeatureList`, `FeatureCard`,
  `AffectedGlyphs` (full inventory), `CombinationExplorer`.
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
  type-4 ligature `No`→№). Rule in `samples/index.ts`: locl/case special → figure
  templates → type-4 ⇒ ligature → type-1 ⇒ single → else (contextual) no preview.
- **Lookup application order = LookupList index order** (ascending), NOT feature
  order (per the OpenType spec). Combinations sort feature toggles by min lookup
  index; the browser shaper applies enabled features correctly.
- **`locl` is language-driven**, not toggled by `font-feature-settings`. Proof each
  language with `font-language-override: "TAG"` (+ `lang`). Confirmed to switch
  glyphs in Chromium.
- **Ligature before/after is isolated**: `before` disables ALL ligature features so
  components show separately; `after` enables only the target (standard liga/clig
  are default-on and would otherwise ligate identically on both sides). See
  `ligatureBeforeAfter`.
- **Highlighting is a real HarfBuzz shaping diff** (`shape.ts` `changedRanges` →
  `samples/index.ts` → `highlight.tsx`): exact changed clusters as char ranges,
  ratio-gated for single/locl (skip when ~everything changes), exempt for
  ligatures. Degrades gracefully (no highlight) if the wasm fails to load.
- **Contextual features** (calt, context swashes): triggers are derived
  analytically from the lookup coverage (`context.ts`), non-cmapped context glyphs
  resolved via the substitution graph (`substitution.ts`); the best trigger is
  confirmed by shaping. No brute-force.
- **Default-on/off matters**: default-off → before = baseline, after = `"tag" 1`;
  default-on → before = `"tag" 0`, after = `"tag" 1`.

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

- True cross-feature cascades via shaping (stage D of the HarfBuzz plan — deferred;
  the combinations explorer already covers the main case).
- Contextual lookup Formats 1/2 in `context.ts` (only Format 3 handled).
- `aalt`/`salt` alternates grid; more scripts; visual design pass.
