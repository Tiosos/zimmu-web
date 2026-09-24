import { useEffect, useMemo, useRef, useState } from 'react'
import type { CarcaseComponent, ComponentId, Scene, Vec3 } from '../scene/types'
import { worldBoundsOf } from '../scene/carcaseWorldBounds'
import { runsOf } from '../scene/runs'
import type { CornerWarning } from '../scene/blindCorner'
import { Button } from '@/components/ui/button'

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

interface Drag {
  id: ComponentId
  // Where the pointer went down, in client pixels.
  fromX: number
  fromY: number
  // The cabinet's position when the drag began. Captured here rather than looked up on drop, so
  // the delta is measured against one fixed origin however the scene re-renders mid-drag.
  start: Vec3
  // How far it has moved since, in millimetres.
  dx: number
  dy: number
}

interface Frame {
  xMin: number
  yMax: number
  width: number
  height: number
}

// Pointer deltas arrive in client pixels and everything else here is millimetres. With
// `preserveAspectRatio="xMidYMid meet"` the SVG picks the SMALLER of the two axis scales so the
// whole viewBox fits, so millimetres-per-pixel is the LARGER of the two ratios. Using the x ratio
// alone would drag at the wrong rate whenever the pane is the tall one.
function mmPerPixel(svg: SVGSVGElement | null, frame: Frame): number {
  const rect = svg?.getBoundingClientRect()
  if (rect === undefined || rect.width === 0 || rect.height === 0) return 0
  return Math.max(frame.width / rect.width, frame.height / rect.height)
}

export function PlanView({
  scene,
  selectedId,
  onSelect,
  onDrop,
  onTurn,
  warnings,
}: {
  scene: Scene
  selectedId: ComponentId | null
  onSelect: (id: ComponentId) => void
  onDrop: (id: ComponentId, position: Vec3) => void
  onTurn: (id: ComponentId) => void
  warnings: readonly CornerWarning[]
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

  // Computed above the empty-job guard, because hooks below it would not run — and the drag effect
  // needs the frame to know what a pixel is worth.
  const frame = useMemo((): Frame | null => {
    if (boxes.length === 0) return null
    const xMin = Math.min(...boxes.map(({ b }) => b.x0))
    const xMax = Math.max(...boxes.map(({ b }) => b.x1))
    const yMin = Math.min(...boxes.map(({ b }) => b.y0))
    const yMax = Math.max(...boxes.map(({ b }) => b.y1))
    return {
      xMin,
      yMax,
      width: xMax - xMin + PADDING * 2,
      height: yMax - yMin + PADDING * 2,
    }
  }, [boxes])

  // The cabinets flagged, not the corners: a footprint is drawn per cabinet, and it is the one
  // returning into the corner that is too deep for what it meets.
  const warned = useMemo(() => new Set(warnings.map((w) => w.cabinetId)), [warnings])

  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)

  // The handlers close over `drag` directly, so each move resubscribes. That is deliberate: a ref
  // written during render is what the lint rule forbids, and a few listener swaps per gesture cost
  // nothing.
  //
  // Listeners go on `window`, not the rect: a fast drag outruns the pointer and leaves the element,
  // and a drag that stopped tracking halfway is worse than one that never started.
  useEffect(() => {
    if (drag === null || frame === null) return
    const move = (e: PointerEvent) => {
      const mm = mmPerPixel(svgRef.current, frame)
      setDrag({ ...drag, dx: (e.clientX - drag.fromX) * mm, dy: -(e.clientY - drag.fromY) * mm })
    }
    const up = () => {
      setDrag(null)
      // A click is a drag of zero length. Reporting one would rewrite the cabinet's anchor on every
      // selection, which is the difference between picking a cabinet and moving it.
      if (drag.dx === 0 && drag.dy === 0) return
      onDrop(drag.id, { x: drag.start.x + drag.dx, y: drag.start.y + drag.dy, z: drag.start.z })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [drag, frame, onDrop])

  if (frame === null) {
    return (
      <div className="flex-1 min-w-0 flex items-center justify-center">
        <p className="text-[11px] text-muted-foreground">
          This job has no cabinets yet, so there is no plan to draw.
        </p>
      </div>
    )
  }

  // The one place world space becomes screen space. World y is measured back from the fronts and
  // SVG y down from the top, so the far edge is subtracted rather than scaled.
  const toSvg = (x0: number, y0: number, y1: number) => ({
    x: x0 - frame.xMin + PADDING,
    y: frame.yMax - y1 + PADDING,
    height: y1 - y0,
  })

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-muted/30">
      {selectedId !== null && (
        <div className="p-1.5 flex-shrink-0">
          <Button size="sm" variant="outline" onClick={() => onTurn(selectedId)}>
            Rotate 90°
          </Button>
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${frame.width} ${frame.height}`}
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
          // The live drag offset, so the footprint follows the pointer before the scene has been
          // told anything. World y grows towards the back and screen y down, so it flips — the same
          // subtraction `toSvg` makes, written as a negation of `dy` rather than re-derived.
          const live = drag !== null && drag.id === c.id
          const ox = live ? drag.dx : 0
          const oy = live ? -drag.dy : 0
          return (
            <g key={c.id}>
              <rect
                data-testid={`plan-cabinet-${c.id}`}
                data-selected={isSelected}
                data-anchored={c.anchor !== undefined}
                data-warned={warned.has(c.id)}
                x={x + ox}
                y={y + oy}
                width={w}
                height={h}
                // A warned cabinet reads as warned whether or not it is selected: the thing that
                // will not build matters more than the thing the user is pointing at.
                className={
                  warned.has(c.id)
                    ? 'fill-destructive/25 stroke-destructive cursor-pointer'
                    : isSelected
                      ? 'fill-primary/25 stroke-primary cursor-pointer'
                      : 'fill-background stroke-border cursor-pointer hover:fill-accent'
                }
                strokeWidth={isSelected ? 8 : 3}
                onClick={() => onSelect(c.id)}
                onPointerDown={(e) =>
                  setDrag({
                    id: c.id,
                    fromX: e.clientX,
                    fromY: e.clientY,
                    start: c.position,
                    dx: 0,
                    dy: 0,
                  })
                }
              />
              {/* pointer-events-none keeps the label from swallowing the click that selects the
                  footprint it sits on — the same trap SectionElevation's cell numbers hit. */}
              <text
                x={x + ox + w / 2}
                y={y + oy + h / 2}
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
