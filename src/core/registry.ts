// Human-readable names and behavioural flags for OpenType feature tags.
// Covers the registered features common to latn / cyrl / grek fonts; ssXX and
// cvXX names are generated. See the OpenType feature tag registry for the full set.

const FEATURE_NAMES: Record<string, string> = {
  aalt: 'Access All Alternates',
  afrc: 'Alternative Fractions',
  calt: 'Contextual Alternates',
  case: 'Case-Sensitive Forms',
  ccmp: 'Glyph Composition / Decomposition',
  cpsp: 'Capital Spacing',
  c2pc: 'Petite Capitals from Capitals',
  c2sc: 'Small Capitals from Capitals',
  clig: 'Contextual Ligatures',
  cswh: 'Contextual Swash',
  curs: 'Cursive Positioning',
  dlig: 'Discretionary Ligatures',
  dnom: 'Denominators',
  expt: 'Expert Forms',
  frac: 'Fractions',
  fwid: 'Full Widths',
  hist: 'Historical Forms',
  hlig: 'Historical Ligatures',
  hwid: 'Half Widths',
  kern: 'Kerning',
  liga: 'Standard Ligatures',
  lnum: 'Lining Figures',
  locl: 'Localized Forms',
  mark: 'Mark Positioning',
  mgrk: 'Mathematical Greek',
  mkmk: 'Mark to Mark Positioning',
  nalt: 'Alternate Annotation Forms',
  numr: 'Numerators',
  onum: 'Oldstyle Figures',
  ordn: 'Ordinals',
  ornm: 'Ornaments',
  pcap: 'Petite Capitals',
  pnum: 'Proportional Figures',
  pwid: 'Proportional Widths',
  rlig: 'Required Ligatures',
  rvrn: 'Required Variation Alternates',
  salt: 'Stylistic Alternates',
  sinf: 'Scientific Inferiors',
  size: 'Optical Size',
  smcp: 'Small Capitals',
  subs: 'Subscript',
  sups: 'Superscript',
  swsh: 'Swash',
  titl: 'Titling',
  tnum: 'Tabular Figures',
  unic: 'Unicase',
  zero: 'Slashed Zero',
}

/** Features the shaper turns on by default (relevant to latn/cyrl/grek). */
const DEFAULT_ON = new Set([
  'calt', 'ccmp', 'clig', 'curs', 'dist', 'kern', 'liga', 'locl',
  'mark', 'mkmk', 'rlig', 'rvrn',
])

/** Features we don't build a before/after proof for. */
const IGNORED = new Set(['kern'])

export function featureName(tag: string): string {
  if (FEATURE_NAMES[tag]) return FEATURE_NAMES[tag]
  const ss = /^ss(\d{2})$/.exec(tag)
  if (ss) return `Stylistic Set ${Number(ss[1])}`
  const cv = /^cv(\d{2})$/.exec(tag)
  if (cv) return `Character Variant ${Number(cv[1])}`
  return tag
}

export function isDefaultOn(tag: string): boolean {
  return DEFAULT_ON.has(tag)
}

export function isIgnored(tag: string): boolean {
  return IGNORED.has(tag)
}
