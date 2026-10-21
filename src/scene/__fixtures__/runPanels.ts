import { cabinet } from '../../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from '../carcasePresets'
import { applyPipeline } from '../pipeline'
import type { Scene } from '../types'
export const runPanelScene = (): Scene =>
  applyPipeline({
    components: ['a', 'b'].map((id, i) => ({
      ...structuredClone(cabinet),
      id,
      label: i ? 'Right cabinet' : 'Left cabinet',
      position: { x: i * 600, y: 0, z: 0 },
    })),
    parts: [],
    materials: structuredClone(PRESET_MATERIALS),
    joints: [],
    hardware: [],
  })
