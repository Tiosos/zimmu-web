import { useEffect, useMemo, useRef, useState } from 'react'
import type { CarcaseComponent, ComponentId, Scene, Vec3 } from '../scene/types'
import { worldBoundsOf } from '../scene/carcaseWorldBounds'
import { runsOf } from '../scene/runs'
import type { CornerWarning } from '../scene/blindCorner'
import type { RoomGeometry } from '../scene/projectStructure'
import { roomPoint, wallLength } from '../scene/roomGeometry'
import { doorSwingEnvelope } from '../scene/roomAssessment'
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
  room,
  cabinetIds,
}: {
  scene: Scene
  selectedId: ComponentId | null
  onSelect: (id: ComponentId) => void
  onDrop: (id: ComponentId, position: Vec3) => void
  onTurn: (id: ComponentId) => void
  warnings: readonly CornerWarning[]
  room?: RoomGeometry
  cabinetIds?: ReadonlySet<string>
}) {
  const boxes = useMemo(
    () =>
      scene.components
        .filter((c): c is CarcaseComponent => c.kind === 'carcase' && (!cabinetIds || cabinetIds.has(c.id)))
        .map((c) => ({ c, b: worldBoundsOf(c, scene.materials) })),
    [scene.components, scene.materials, cabinetIds],
  )

  const runs = useMemo(
    () => runsOf(scene.components.filter((c) => !cabinetIds || cabinetIds.has(c.id)), scene.materials),
    [scene.components, scene.materials, cabinetIds],
  )

  // Computed above the empty-job guard, because hooks below it would not run — and the drag effect
  // needs the frame to know what a pixel is worth.
  const frame = useMemo((): Frame | null => {
    const points = [
      ...(room?.walls.flatMap((wall) => [roomPoint(wall.start, room), roomPoint(wall.end, room)]) ?? []),
      ...(room?.obstacles.flatMap((o) => [
        o.position,
        { x: o.position.x + o.width, y: o.position.y },
        { x: o.position.x + o.width, y: o.position.y + o.depth },
        { x: o.position.x, y: o.position.y + o.depth },
      ].map((point) => roomPoint(point, room))) ?? []),
      ...(room?.siteLevels?.map((level) => roomPoint(level.at, room)) ?? []),
      ...(room?.openings.flatMap((opening) => doorSwingEnvelope(room, opening) ?? []) ?? []),
    ]
    if (boxes.length === 0 && points.length === 0) return null
    const xMin = Math.min(...boxes.map(({ b }) => b.x0), ...points.map((p) => p.x))
    const xMax = Math.max(...boxes.map(({ b }) => b.x1), ...points.map((p) => p.x))
    const yMin = Math.min(...boxes.map(({ b }) => b.y0), ...points.map((p) => p.y))
    const yMax = Math.max(...boxes.map(({ b }) => b.y1), ...points.map((p) => p.y))
    return {
      xMin,
      yMax,
      width: xMax - xMin + PADDING * 2,
      height: yMax - yMin + PADDING * 2,
    }
  }, [boxes, room])

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
          This room has no cabinets or walls yet, so there is no plan to draw.
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
        {room?.walls.map((wall) => {
          const start = roomPoint(wall.start, room)
          const end = roomPoint(wall.end, room)
          return <g key={wall.id}>
            <line data-testid={`plan-wall-${wall.id}`} x1={toSvg(start.x, start.y, start.y).x}
              y1={toSvg(start.x, start.y, start.y).y} x2={toSvg(end.x, end.y, end.y).x}
              y2={toSvg(end.x, end.y, end.y).y} className="stroke-foreground" strokeWidth={12} />
            {room.openings.filter((o) => o.wallId === wall.id).map((opening) => {
              const length = wallLength(wall)
              if (length === 0) return null
              const from = roomPoint({ x: wall.start.x + (wall.end.x - wall.start.x) * opening.offset / length,
                y: wall.start.y + (wall.end.y - wall.start.y) * opening.offset / length }, room)
              const to = roomPoint({ x: wall.start.x + (wall.end.x - wall.start.x) * (opening.offset + opening.width) / length,
                y: wall.start.y + (wall.end.y - wall.start.y) * (opening.offset + opening.width) / length }, room)
              return <line key={opening.id} data-testid={`plan-opening-${opening.id}`}
                x1={toSvg(from.x, from.y, from.y).x} y1={toSvg(from.x, from.y, from.y).y}
                x2={toSvg(to.x, to.y, to.y).x} y2={toSvg(to.x, to.y, to.y).y}
                className="stroke-background" strokeWidth={16} />
            })}
          </g>
        })}
        {room?.obstacles.map((obstacle) => {
          const corners = [
            obstacle.position,
            { x: obstacle.position.x + obstacle.width, y: obstacle.position.y },
            { x: obstacle.position.x + obstacle.width, y: obstacle.position.y + obstacle.depth },
            { x: obstacle.position.x, y: obstacle.position.y + obstacle.depth },
          ].map((point) => roomPoint(point, room))
          return <polygon key={obstacle.id} data-testid={`plan-obstacle-${obstacle.id}`}
            points={corners.map((point) => `${toSvg(point.x, point.y, point.y).x},${toSvg(point.x, point.y, point.y).y}`).join(' ')}
            className="fill-amber-500/20 stroke-amber-600" strokeWidth={3} />
        })}
        {room?.siteLevels?.map((level) => {
          const point = roomPoint(level.at, room)
          const x = toSvg(point.x, point.y, point.y).x
          const y = toSvg(point.x, point.y, point.y).y
          return <g key={level.id} data-testid={`plan-level-${level.id}`}>
            <circle cx={x} cy={y} r={25} className="fill-primary" />
            <text x={x + 35} y={y - 15} className="fill-foreground" fontSize={40}>
              {level.name}: {level.elevation.value} ±{level.elevation.uncertainty} mm
            </text>
          </g>
        })}
        {room?.openings.map((opening) => {
          const swing = doorSwingEnvelope(room, opening)
          return swing && <polygon key={`swing-${opening.id}`} data-testid={`plan-door-swing-${opening.id}`}
            points={swing.map((point) => `${toSvg(point.x, point.y, point.y).x},${toSvg(point.x, point.y, point.y).y}`).join(' ')}
            className="fill-amber-500/10 stroke-amber-600" strokeWidth={3} strokeDasharray="12 8" />
        })}
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
