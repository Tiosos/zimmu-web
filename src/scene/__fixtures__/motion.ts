import { cabinet } from '../../geom/__fixtures__/cabinetSheet'
import { DEFAULT_FRAME, PRESET_MATERIALS } from '../carcasePresets'
import { defaultInterior } from '../sectionInterior'
import { applyPipeline } from '../pipeline'
import type { Scene } from '../types'
export const motionScene = (kind: 'door' | 'pair' | 'drawer' = 'door', frame = false): Scene => {
  const c = structuredClone(cabinet)
  c.id = 'cab'
  c.params = {
    ...c.params,
    frontReveal: 2,
    section: {
      ...c.params.section,
      front:
        kind === 'drawer'
          ? { kind: 'drawer-front' }
          : { kind: 'door', leaves: kind === 'pair' ? 2 : 1, hinge: 'left' },
      interior: defaultInterior(0),
    },
    ...(frame ? { frame: structuredClone(DEFAULT_FRAME) } : {}),
  }
  return applyPipeline({
    components: [c],
    parts: [],
    materials: structuredClone(PRESET_MATERIALS),
    joints: [],
    hardware: [],
  })
}
