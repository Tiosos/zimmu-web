import { cabinet } from '../../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from '../carcasePresets'
import { applyPipeline } from '../pipeline'
import { defaultProject, emptyRoomGeometry } from '../projectStructure'
import type { Scene } from '../types'
export function installationFixture() {
  const scene: Scene = applyPipeline({
    parts: [],
    components: [
      {
        ...structuredClone(cabinet),
        id: 'a',
        label: 'Base A',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
      },
      {
        ...structuredClone(cabinet),
        id: 'b',
        label: 'Base B',
        position: { x: 1000, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
      },
    ],
    materials: structuredClone(PRESET_MATERIALS),
    joints: [],
    hardware: [],
  })
  const project = defaultProject(scene, 'installation'),
    room = project.areas[0].rooms[0]
  room.id = 'room'
  room.name = 'Kitchen'
  room.geometry = {
    ...emptyRoomGeometry(),
    walls: [
      { id: 'back', name: 'Back wall', start: { x: 0, y: 0 }, end: { x: 3000, y: 0 } },
      {
        id: 'left',
        name: 'Left side wall',
        start: { x: -100, y: -500 },
        end: { x: -100, y: 1500 },
      },
      {
        id: 'right',
        name: 'Right side wall',
        start: { x: 700, y: -500 },
        end: { x: 700, y: 1500 },
      },
    ],
  }
  return { scene, project, room }
}
