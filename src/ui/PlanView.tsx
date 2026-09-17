import { useMemo } from 'react'
import type { CarcaseComponent, ComponentId, Scene, Vec3 } from '../scene/types'
import { worldBoundsOf } from '../scene/carcaseWorldBounds'
import { runsOf } from '../scene/runs'

// The whole job seen from above. The second interactive SVG in the codebase, and it follows the
// first (`SectionElevation`) deliberately: React elements rather than an SVG string, because every
// footprint needs a pointer handler.
//
// World y runs from the cabinet fronts backwards and SVG y runs down, so a plan seen from above
// subtracts. That happens in `toSvg` and nowhere else — the same rule, and the same reason, as
// SectionElevation's z flip.

// In millimetres, like everything else in the viewBox. Wide enough that a run's dashed outline and
// a dragged cabinet both stay inside the frame.
const PADDING = 200

const RUN_INSET = 20

export function PlanView({
  scene,
  selectedId,
  onSelect,
}: {
  scene: Scene
  selectedId: ComponentId | null
  onSelect: (id: ComponentId) => void
  onDrop: (id: ComponentId, position: Vec3) => void
}) {
  const boxes = useMemo(
    () =>
      scene.components
        .filter((c): c is CarcaseComponent => c.kind === 'carcase')
        .map((c) => ({ c, b: worldBoundsOf(c, scene.materials) })),
    [scene.components, scene.materials],
  )

  const runs = useMemo(
    () => runsOf(scene.components, scene.materials),
    [scene.components, scene.materials],
  )

  if (boxes.length === 0) {
    return (
      <div className="flex-1 min-w-0 flex items-center justify-center">
        <p className="text-[11px] text-muted-foreground">
          This job has no cabinets yet, so there is no plan to draw.
        </p>
      </div>
    )
  }

  const xMin = Math.min(...boxes.map(({ b }) => b.x0))
  const xMax = Math.max(...boxes.map(({ b }) => b.x1))
  const yMin = Math.min(...boxes.map(({ b }) => b.y0))
  const yMax = Math.max(...boxes.map(({ b }) => b.y1))

  // The one place world space becomes screen space. World y is measured back from the fronts and
  // SVG y down from the top, so the far edge is subtracted rather than scaled.
  const toSvg = (x0: number, y0: number, y1: number) => ({
    x: x0 - xMin + PADDING,
    y: yMax - y1 + PADDING,
    height: y1 - y0,
  })

  const width = xMax - xMin + PADDING * 2
  const height = yMax - yMin + PADDING * 2

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-muted/30">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Plan view"
        className="w-full h-full max-h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {runs.map((run, i) => {
          const mine = boxes.filter(({ c }) => run.members.includes(c.id))
          if (mine.length === 0) return null
          const rx0 = Math.min(...mine.map(({ b }) => b.x0))
          const rx1 = Math.max(...mine.map(({ b }) => b.x1))
          const ry0 = Math.min(...mine.map(({ b }) => b.y0))
          const ry1 = Math.max(...mine.map(({ b }) => b.y1))
          const { x, y, height: h } = toSvg(rx0, ry0, ry1)
          return (
            <rect
              key={run.members.join('-')}
              data-testid={`plan-run-${i}`}
              x={x - RUN_INSET}
              y={y - RUN_INSET}
              width={rx1 - rx0 + RUN_INSET * 2}
              height={h + RUN_INSET * 2}
              className="fill-none stroke-muted-foreground/40"
              strokeWidth={4}
              strokeDasharray="16 12"
            />
          )
        })}

        {boxes.map(({ c, b }) => {
          const { x, y, height: h } = toSvg(b.x0, b.y0, b.y1)
          const w = b.x1 - b.x0
          const isSelected = c.id === selectedId
          return (
            <g key={c.id}>
              <rect
                data-testid={`plan-cabinet-${c.id}`}
                data-selected={isSelected}
                data-anchored={c.anchor !== undefined}
                x={x}
                y={y}
                width={w}
                height={h}
                className={
                  isSelected
                    ? 'fill-primary/25 stroke-primary cursor-pointer'
                    : 'fill-background stroke-border cursor-pointer hover:fill-accent'
                }
                strokeWidth={isSelected ? 8 : 3}
                onClick={() => onSelect(c.id)}
              />
              {/* pointer-events-none keeps the label from swallowing the click that selects the
                  footprint it sits on — the same trap SectionElevation's cell numbers hit. */}
              <text
                x={x + w / 2}
                y={y + h / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-muted-foreground pointer-events-none"
                fontSize={Math.min(w, h) / 5}
              >
                {c.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
