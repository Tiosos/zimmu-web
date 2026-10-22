import type { BoardPart, Scene } from '../scene/types'
import type { WallBinding } from '../scene/installationRecipe'
import type { ProjectStructure } from '../scene/projectStructure'
import { roomComponentIds } from '../scene/projectStructure'
import { installationRows } from '../scene/roomInstallation'
import { roomPoint } from '../scene/roomGeometry'
import { applyMatrixToPoint, resolveWorldMatrix } from '../geom/transform'
export function RoomInstallationViews({
  scene,
  project,
  roomId,
  binding,
  wallId,
  selectedIds,
  filler,
}: {
  scene: Scene
  project: ProjectStructure
  roomId: string
  binding: WallBinding
  wallId: string
  selectedIds: string[]
  filler?: BoardPart | null
}) {
  const room = project.areas.flatMap((a) => a.rooms).find((r) => r.id === roomId),
    ids = room
      ? roomComponentIds(
          room.items.flatMap((i) => i.rootComponentIds),
          scene,
        )
      : new Set<string>(),
    rows = installationRows(scene, binding, [...ids]),
    length = Math.hypot(binding.end.x - binding.start.x, binding.end.y - binding.start.y),
    tx = (binding.end.x - binding.start.x) / length,
    ty = (binding.end.y - binding.start.y) / length
  const projectPoint = (x: number, y: number) => ({
    x: (x - binding.start.x) * tx + (y - binding.start.y) * ty,
    y: -(x - binding.start.x) * ty + (y - binding.start.y) * tx,
  })
  const byId = new Map(scene.components.map((c) => [c.id, c])),
    parts = filler ? [filler] : []
  const fillerBoxes = parts.map((p) => {
    const m = resolveWorldMatrix(p, byId),
      points = [0, p.length].flatMap((x) =>
        [0, p.width].flatMap((y) =>
          [0, p.thickness].map((z) => {
            const w = applyMatrixToPoint(m, x, y, z)
            return { ...projectPoint(w[0], w[1]), z: w[2] }
          }),
        ),
      )
    return {
      x0: Math.min(...points.map((p) => p.x)),
      x1: Math.max(...points.map((p) => p.x)),
      y0: Math.min(...points.map((p) => p.y)),
      y1: Math.max(...points.map((p) => p.y)),
      z0: Math.min(...points.map((p) => p.z)),
      z1: Math.max(...points.map((p) => p.z)),
      label: p.label,
    }
  })
  const openingRects =
    room?.geometry?.openings.flatMap((o) => {
      const w = room.geometry!.walls.find((w) => w.id === o.wallId)
      if (!w) return []
      const len = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y)
      if (!len) return []
      const point = (offset: number) => {
        const world = roomPoint(
          {
            x: w.start.x + ((w.end.x - w.start.x) * offset) / len,
            y: w.start.y + ((w.end.y - w.start.y) * offset) / len,
          },
          room.geometry!,
        )
        return projectPoint(world.x, world.y)
      }
      const a = point(o.offset),
        b = point(o.offset + o.width)
      return [{ ...o, a, b, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y: (a.y + b.y) / 2 }]
    }) ?? []
  return (
    <div className="space-y-3">
      {(['Plan', 'Elevation'] as const).map((view) => {
        const all = [...rows, ...fillerBoxes],
          x0 = Math.min(0, ...all.map((b) => b.x0)) - 100,
          x1 = Math.max(length, ...all.map((b) => b.x1)) + 100,
          y0 =
            view === 'Plan'
              ? Math.min(-100, ...all.map((b) => b.y0)) - 100
              : Math.min(0, ...all.map((b) => b.z0)) - 100,
          y1 =
            view === 'Plan'
              ? Math.max(100, ...all.map((b) => b.y1)) + 100
              : Math.max(
                  1000,
                  ...all.map((b) => b.z1),
                  ...openingRects.map((o) => o.sill + o.height),
                ) + 100
        return (
          <svg
            key={view}
            role="img"
            aria-label={`${view} installation preview`}
            viewBox={`${x0} ${-y1} ${x1 - x0} ${y1 - y0}`}
            className="w-full max-h-80 border rounded"
          >
            <title>
              {view}: wall {length.toFixed(1)} mm
            </title>
            <line x1={0} x2={length} y1={0} y2={0} stroke="#555" strokeWidth="8" />
            <text x={length / 2} y={-y1 + 40} textAnchor="middle" fontSize="28">
              Wall {length.toFixed(1)} mm
            </text>
            {openingRects
              .filter((o) => view === 'Plan' || o.wallId === wallId)
              .map((o) =>
                view === 'Plan' ? (
                  <line
                    key={o.id}
                    data-opening-id={o.id}
                    x1={o.a.x}
                    y1={-o.a.y}
                    x2={o.b.x}
                    y2={-o.b.y}
                    stroke="#9859b9"
                    strokeWidth="12"
                  >
                    <title>
                      {o.kind} · {o.width} × {o.height} mm
                    </title>
                  </line>
                ) : (
                  <rect
                    key={o.id}
                    x={o.x0}
                    y={-(o.sill + o.height)}
                    width={Math.max(5, o.x1 - o.x0)}
                    height={o.height}
                    fill="none"
                    stroke="#9859b9"
                    strokeWidth="5"
                  >
                    <title>
                      {o.kind} · {o.width} × {o.height} mm
                    </title>
                  </rect>
                ),
              )}
            {rows.map((b) => (
              <g key={b.id}>
                <rect
                  x={b.x0}
                  y={view === 'Plan' ? -b.y1 : -b.z1}
                  width={b.x1 - b.x0}
                  height={view === 'Plan' ? b.y1 - b.y0 : b.z1 - b.z0}
                  fill={selectedIds.includes(b.id) ? '#80b7df' : '#ddd'}
                  stroke="#333"
                  strokeWidth="3"
                >
                  <title>
                    {b.label}: {(b.x1 - b.x0).toFixed(1)} mm
                  </title>
                </rect>
                <text
                  x={(b.x0 + b.x1) / 2}
                  y={view === 'Plan' ? -(b.y0 + b.y1) / 2 : -(b.z0 + b.z1) / 2}
                  fontSize="22"
                  textAnchor="middle"
                >
                  {b.label} · {(b.x1 - b.x0).toFixed(1)}
                </text>
              </g>
            ))}
            {fillerBoxes.map((b) => (
              <rect
                key={b.label}
                x={b.x0}
                y={view === 'Plan' ? -b.y1 : -b.z1}
                width={b.x1 - b.x0}
                height={view === 'Plan' ? b.y1 - b.y0 : b.z1 - b.z0}
                fill="#d9b17e"
                stroke="#333"
                strokeWidth="3"
              >
                <title>
                  {b.label} · {(b.x1 - b.x0).toFixed(1)} mm gap
                </title>
              </rect>
            ))}
          </svg>
        )
      })}
    </div>
  )
}
