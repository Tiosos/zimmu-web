import { cabinet } from '../../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from '../carcasePresets'
import { applyPipeline } from '../pipeline'
import type { Scene } from '../types'
export function cornerScene(): Scene {
  return applyPipeline({
    parts: [],
    joints: [],
    hardware: [],
    materials: structuredClone(PRESET_MATERIALS),
    components: [
      {
        ...structuredClone(cabinet),
        id: 'a',
        label: 'Main',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        params: { ...structuredClone(cabinet.params), width: 1200 },
      },
      {
        ...structuredClone(cabinet),
        id: 'b',
        label: 'Return',
        position: { x: 1200, y: -600, z: 0 },
        rotation: { x: 0, y: 0, z: 90 },
      },
    ],
  })
}
