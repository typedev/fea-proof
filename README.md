# OpenType Features Proof

A web tool that shows what a font's OpenType features actually do — on **real words**.

**▶ Live:** [typedev.github.io/fea-proof](https://typedev.github.io/fea-proof/)

This is the development repository. To run it locally or host your own copy, see
[Run locally](#run-locally) and [Build & host](#build--host).

Drop a font (`.otf` / `.ttf` / `.woff` / `.woff2`) and it introspects the font's
GSUB/GPOS features, works out which glyphs each feature affects, and renders a
**before / after** proof for every feature using realistic sample text in the
right language.

**Everything runs in your browser.** Fonts are never uploaded — parsing,
analysis and rendering all happen client-side, so licensed fonts stay on your
machine.

## What it shows

- **Feature list** — every GSUB/GPOS feature with its human-readable name, lookup
  kind, default-on/off state, and the scripts & language systems it's registered
  under.
- **Single substitutions** (`smcp`, `onum`, `ssXX`, `cvXX`, `case`, positional
  `init`/`fina`/`isol`, …) proofed on living words picked from frequency
  wordlists, with the affected glyphs highlighted. When a feature only acts on
  another feature's output (e.g. a stylistic set restyling `dlig` ligatures), the
  proof keeps that producer on and labels the cells with the real context
  (`dlig` → `dlig + ss03`) rather than a misleading "default".
- **Ligatures** (`liga`, `dlig`, `hlig`, …) shown inside real words, with standard
  ligatures isolated so you see exactly what each feature adds.
- **Localized forms** (`locl`) broken out **per language** (via
  `font-language-override` + `lang`), e.g. Serbian/Bulgarian Cyrillic, classical
  Latin, etc. — each language shows a real-word proof **plus the complete
  default→localized inventory** of every form it substitutes (Bulgarian alone
  can be ~30 letters that no single word would surface).
- **Contextual features** (`calt`, context-driven swashes) — trigger text is
  derived analytically from the lookups and confirmed by shaping.
- **Figures** (`onum`/`lnum`/`tnum`/`pnum`/`frac`/`zero`…) on numeric templates,
  each shown in isolation so "default" is the font's nominal figures — never a
  sibling figure style leaking in. A figure feature with no effect on the default
  is labelled as such instead of faked.
- **Full glyph inventory** — for features that touch many glyphs (small caps over
  whole alphabets), a "Show all N affected glyphs" grid grouped by script.
- **Feature combinations** — base glyphs touched by several features get
  interactive toggles so you can stack them and see how they combine (applied in
  the font's correct LookupList order). Chips with no effect in the current
  combination are dimmed, revealing dependencies and conflicts (HarfBuzz-checked).
- **Alternates** (`aalt`, `salt`) — a grid of every glyph's alternate forms.
- **Unreachable glyphs** — glyphs with no Unicode mapping that no feature toggle
  can produce, so they can't be typed or reached at all (useful QA signal).
- **Feature navigator** — a jump-list in the sticky top bar with a chip per
  feature (plus the Feature combinations / Unreachable sections); scrolls the
  page to any of them.
- Adjustable preview size and a light/dark theme.

Scripts covered for sample generation: **Latin, Cyrillic, Greek** (the
architecture is pluggable for more).

## Run locally

```sh
npm install
npm run dev      # Vite dev server at http://localhost:5173
npm run build    # type-check + production build
npm run test     # Vitest (unit tests)
```

Drop your own fonts onto the page. For local testing you can put fonts in
`test_fonts/` (git-ignored — see `test_fonts/README.md`); the dev server serves
them at `/test_fonts/<file>`.

## Build & host

`npm run build` emits a static `dist/` with a **relative base**, so you can host
it anywhere — a domain root, any subfolder (e.g. GitHub Pages project sites),
Netlify/Vercel/S3, or opened straight from disk. No server-side code. Need an
absolute base instead? Build with `VITE_BASE=/my/path/ npm run build`.

To preview the production build, serve `dist/` with any static file server (e.g.
`npx serve dist` or `python3 -m http.server -d dist`).

There's a small `deploy.sh` for pushing the build to a personal hosting repo;
copy `deploy.config.example` → `deploy.config` and set your target.

## How it works

- **Parsing:** [`opentype.js`](https://github.com/opentypejs/opentype.js) reads
  the sfnt tables. WOFF2 is decoded to sfnt with
  [`woff2-encoder`](https://www.npmjs.com/package/woff2-encoder); WOFF1/OTF/TTF
  are read natively.
- **Rendering:** previews use the browser's own shaper — the font is registered
  as a `FontFace` and rendered with CSS `font-feature-settings` /
  `font-language-override`. This gives correct shaping (and complex-script / RTL
  support in future) for free.
- **Sample text:** affected input glyphs are mapped back to Unicode via the
  inverted cmap, then real words containing those characters are chosen from
  bundled frequency wordlists (lazy-loaded per script).
- **Analysis:** [HarfBuzz](https://github.com/harfbuzz/harfbuzzjs) (wasm, lazy
  loaded) is used as an analysis engine — not a renderer — to diff shaping
  before/after a feature (exact changed glyphs to highlight) and to confirm
  contextual triggers.

## Tech

React + Vite + TypeScript + Tailwind v4. No backend.

## Data & licensing

- Sample wordlists in `src/samples/wordlists/` are derived from
  [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (Hermit Dave,
  MIT) — top entries per language, filtered by script.
- Test fonts are **not** committed.
- Code is MIT-licensed.

## Roadmap

- True cross-feature cascade detection via shaping (the combinations explorer
  already covers most of this).
- More scripts (Arabic, Devanagari, Hebrew — the browser already shapes them; the
  work is sample generation and UI).
- Visual design pass.
