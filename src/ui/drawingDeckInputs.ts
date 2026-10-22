import type { CarcaseComponent, Component, ComponentId, Scene } from '../scene/types'
import { descendantIds } from '../scene/componentTree'
import { roomComponentIds, type ProjectStructure } from '../scene/projectStructure'

// Every carcase gets an assembly sheet ahead of the part sheets. Its parts are the cabinet's own
// descendants — the same set the cabinet editor draws, and so the same sheet its own export
// buttons build — rather than the visible boards, which are the deck's separate question of which
// boards get a sheet of their own.
export function drawingDeckInputs(
  scene: Scene,
  project: ProjectStructure,
  byId: Map<ComponentId, Component>,
) {
  const cabinets = scene.components
    .filter((c): c is CarcaseComponent => c.kind === 'carcase')
    .map((cabinet) => {
      const mine = new Set(descendantIds(cabinet.id, scene.components, scene.parts).partIds)
      return {
        cabinet,
        parts: scene.parts.filter((p) => mine.has(p.id)),
        materials: scene.materials,
        byId,
      }
    })
  const rooms = project.areas
    .flatMap((area) => area.rooms)
    .flatMap((room) =>
      room.geometry === undefined
        ? []
        : [
            {
              roomName: room.name,
              room: room.geometry,
              scene,
              cabinetIds: roomComponentIds(
                room.items.flatMap((item) => item.rootComponentIds),
                scene,
              ),
            },
          ],
    )
  return { cabinets, rooms }
}
