import { CARCASE_PRESETS, PRESET_MATERIALS } from '../../scene/carcasePresets'
import { carcaseRoles } from '../../scene/carcaseRoles'
import { roleThicknessFor } from '../../scene/resolveThickness'
import { jointKindFor } from '../../scene/resolveJointKind'
import type { CarcaseComponent, CarcaseParams, ComponentId, Part } from '../../scene/types'

export const cabinet: CarcaseComponent = {
  kind: 'carcase',
  id: 'cmp_1',
  label: 'Base 600',
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: CARCASE_PRESETS[0].params,
}

// The parts a carcase's parameters imply, built the way regenerateComponents builds them, so every
// consumer of the projector is tested against what the app actually holds. Shared because four test
// files need it, and four copies of it are four things free to drift from the generator.
export function partsOfCarcase(params: CarcaseParams, parentId: ComponentId = cabinet.id): Part[] {
  return carcaseRoles(
    params,
    roleThicknessFor(params, PRESET_MATERIALS, new Map()),
    jointKindFor([], parentId),
  ).map((r, i) => ({
    kind: 'board',
    id: `board_${i}`,
    label: r.label,
    length: r.panel.length,
    width: r.panel.width,
    thickness: r.panel.thickness,
    grain: r.grain,
    material: '',
    color: '#888',
    position: r.panel.position,
    rotation: r.panel.rotation,
    rotationOrder: r.panel.rotationOrder,
    cuts: [],
    visible: true,
    parentId,
    driven: true,
    role: r.role,
  }))
}

export const partsOfBase600 = (): Part[] => partsOfCarcase(cabinet.params)
