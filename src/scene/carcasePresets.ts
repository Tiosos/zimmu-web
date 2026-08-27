import { legacyToSection } from './migrateSections'
import type { CarcaseParams } from './types'

export interface CarcasePreset {
  name: string
  params: CarcaseParams
}

// Shared by every preset: the parameters a cabinet's *size* does not change.
const COMMON = {
  material: '18mm Ply',
  thickness: 18,
  backMode: 'captured',
  backThickness: 12,
  jointMethod: 'dado-rabbet',
  adjustableShelves: {
    rows: 2,
    pitch: 32,
    setback: 37,
    backSetback: 37,
    startHeight: 200,
    count: 10,
  },
} satisfies Partial<CarcaseParams>

export const CARCASE_PRESETS: CarcasePreset[] = [
  {
    name: 'Base 600',
    params: {
      ...COMMON,
      width: 600,
      height: 720,
      depth: 560,
      hasTop: true,
      baseMode: 'toe-kick',
      toeKickHeight: 100,
      toeKickSetback: 60,
      section: legacyToSection([], 1, 600, 18),
    },
  },
  {
    name: 'Wall 600',
    params: {
      ...COMMON,
      width: 600,
      height: 720,
      depth: 330,
      hasTop: true,
      baseMode: 'none',
      toeKickHeight: 100,
      toeKickSetback: 60,
      section: legacyToSection([], 1, 600, 18),
    },
  },
  {
    name: 'Tall 600',
    params: {
      ...COMMON,
      width: 600,
      height: 2100,
      depth: 560,
      hasTop: true,
      baseMode: 'toe-kick',
      toeKickHeight: 100,
      toeKickSetback: 60,
      section: legacyToSection([], 4, 600, 18),
    },
  },
]
