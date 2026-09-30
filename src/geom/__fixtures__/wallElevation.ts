import { CARCASE_PRESETS, PRESET_MATERIALS } from '../../scene/carcasePresets'
import { setFrontOn } from '../../scene/sectionInterior'
import {
  emptyRoomGeometry,
  type RoomGeometry,
  type SiteMeasurement,
} from '../../scene/projectStructure'
import type { CarcaseComponent, Scene } from '../../scene/types'

export function wallCabinet(
  id: string,
  x = 0,
  params: Partial<CarcaseComponent['params']> = {},
): CarcaseComponent {
  const base = CARCASE_PRESETS[0].params
  return {
    kind: 'carcase',
    id,
    label: id,
    parentId: null,
    visible: true,
    position: { x, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    params: {
      ...base,
      section: setFrontOn(base.section, base.section.id, { kind: 'door', leaves: 1, hinge: 'left' }),
      ...params,
    },
  }
}

export function wallScene(components: CarcaseComponent[]): Scene {
  return { parts: [], materials: PRESET_MATERIALS, hardware: [], joints: [], components }
}

export const SITE: SiteMeasurement = {
  value: 3983,
  uncertainty: 5,
  source: 'Laser',
  recordedAt: '2026-09-30',
}

// A 3983 mm straight wall: a Base 600 at x = 1000 and a window from 1800 to 3000. The cabinet is
// deliberately not at the wall start, so a wall-start/wall-end flip or a dropped offset shows up.
export function kitchenWall(measuredLength?: SiteMeasurement) {
  const cabinet = wallCabinet('kitchen', 1000)
  const room: RoomGeometry = {
    ...emptyRoomGeometry(),
    walls: [
      {
        id: 'long',
        name: 'Kitchen',
        start: { x: 0, y: 0 },
        end: { x: 3983, y: 0 },
        ...(measuredLength ? { measuredLength } : {}),
      },
    ],
    openings: [
      { id: 'window', wallId: 'long', kind: 'window', offset: 1800, width: 1200, sill: 900, height: 1100 },
    ],
    placements: [
      { cabinetId: cabinet.id, wallId: 'long', offset: 1000, setback: 0, manualOffset: { x: 0, y: 0 } },
    ],
  }
  return { room, cabinet, scene: wallScene([cabinet]), cabinetIds: new Set([cabinet.id]) }
}
