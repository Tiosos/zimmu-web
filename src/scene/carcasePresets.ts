import { legacyToSection } from './migrateSections'
import type { CarcaseParams, MaterialDef } from './types'

export interface CarcasePreset {
  name: string
  params: CarcaseParams
}

// Exported because the file parser needs them: a pre-v14 carcase names one material and states its
// own thickness, so the slots it does not have have to fall back on the names a new scene is seeded
// with.
export const DEFAULT_CARCASE_MATERIAL = '18mm Ply'
export const DEFAULT_BACK_MATERIAL = '12mm MDF'
// The one place the preset panel thickness is written. `legacyToSection` needs it as a number —
// a section percentage is a share of the clear span, so it depends on what the divisions spend.
const CARCASE_THICKNESS = 18

// The materials the presets name. `CARCASE_PRESETS` is data, so a scene that has never seen these
// definitions cannot resolve a single panel: seeded wherever a new scene is created, and the
// preset test drops each preset into a fresh scene to prove it.
export const PRESET_MATERIALS: Record<string, MaterialDef> = {
  [DEFAULT_CARCASE_MATERIAL]: { thickness: CARCASE_THICKNESS },
  [DEFAULT_BACK_MATERIAL]: { thickness: 12 },
}

// Shared by every preset: the parameters a cabinet's *size* does not change.
const COMMON = {
  carcaseMaterial: DEFAULT_CARCASE_MATERIAL,
  backMaterial: DEFAULT_BACK_MATERIAL,
  backMode: 'captured',
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
      section: legacyToSection([], 1, 600, CARCASE_THICKNESS),
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
      section: legacyToSection([], 1, 600, CARCASE_THICKNESS),
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
      section: legacyToSection([], 4, 600, CARCASE_THICKNESS),
    },
  },
]
