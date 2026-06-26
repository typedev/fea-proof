import decompress from 'woff2-encoder/decompress'

/**
 * Decompress WOFF2 bytes into an sfnt (ttf/otf) byte array.
 * Uses woff2-encoder's decompress-only entry (small, self-contained wasm inlined
 * as a data URI), which initializes via a proper `ready` promise — unlike the
 * emscripten binding in `wawoff2`, it works cleanly under Vite in the browser.
 */
export async function decompressWoff2(input: Uint8Array): Promise<Uint8Array> {
  return decompress(input)
}
