import { cabinet } from '../../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from '../carcasePresets'
import type { BoardPart, Scene } from '../types'
export const worktopBoard = (): BoardPart => ({
  kind: 'board',
  id: 'top',
  label: 'Kitchen worktop',
  length: 1200,
  width: 600,
  thickness: 30,
  grain: 'length',
  material: Object.keys(PRESET_MATERIALS)[0],
  color: '#888888',
  position: { x: 0, y: -20, z: 720 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  parentId: null,
  visible: true,
  driven: false,
  cuts: [],
})
export const worktopScene = (): Scene => ({
  components: [structuredClone(cabinet)],
  parts: [worktopBoard()],
  materials: PRESET_MATERIALS,
  joints: [],
  hardware: [],
})
