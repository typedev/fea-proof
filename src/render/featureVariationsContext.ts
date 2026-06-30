import { createContext, useContext } from 'react'
import type { Font } from 'opentype.js'
import type { VariationAxis } from '../core/variations'
import type { AvarSegments } from '../core/coords'
import type { RvrnGroup } from '../core/featureVariations'
import type { OutlineFont } from '../core/shape'

/**
 * GSUB FeatureVariations data, provided once per loaded font and consumed by the
 * FeatureCard of whichever feature a group substitutes (usually `rvrn`) — so the
 * conditional substitutions live inside the navigable feature list instead of a
 * separate, unlinked card.
 */
export interface FeatureVariationsData {
  font: Font
  axes: VariationAxis[]
  avar: AvarSegments
  /** Substitution groups keyed by the substituted feature tag (e.g. "rvrn"). */
  groupsByTag: Map<string, RvrnGroup[]>
  /** Per-group (by lookup index) user-space coords that make it fire. */
  applyByLookup: Map<number, Record<string, number>>
  /** Set the global axis coordinates (so the substitution shows in the proofs). */
  onApply: (coords: Record<string, number>) => void
  /** HarfBuzz outline font for the base→variant glyph pairs (VF-accurate, no NaN). */
  outline?: OutlineFont
  /** Current axis coords — drives the HB outlines and re-keys their paths. */
  coords: Record<string, number>
}

export const FeatureVariationsContext = createContext<FeatureVariationsData | null>(null)

export const useFeatureVariations = (): FeatureVariationsData | null =>
  useContext(FeatureVariationsContext)
