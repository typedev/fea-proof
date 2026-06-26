# Test fonts

Font files here are **git-ignored** (licensing + repo cleanliness). Drop your own
`.otf` / `.ttf` / `.woff` / `.woff2` files in this folder to use them during local
development and browser testing.

Fonts used while building this tool (all OFL / permissively licensed):

- **Source Code Pro** (Regular `.otf`, Italic `.otf`) — Adobe, OFL. Many ssXX/cvXX,
  numeric features, `locl` (SRB/NSM/SKS). Monospace, no ligatures.
- **EB Garamond** (Regular `.ttf`, Italic `.ttf`) — Octavio Pardo / Georg Duffner,
  OFL. Rich ligatures (`liga`/`dlig`/`hlig`), small caps, swashes, `locl`
  (latn + cyrl). Get them from Google Fonts:
  - https://github.com/google/fonts/tree/main/ofl/ebgaramond

The dev server serves this folder at `/test_fonts/<file>` for quick testing.
