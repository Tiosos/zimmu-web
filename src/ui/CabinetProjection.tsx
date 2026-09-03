import {
  buildAssemblyViews,
  CHAR_EM,
  RING_EM,
  TEXT_GAP_EM,
  TICK_EM,
  type AssemblyDim,
  type AssemblyView,
} from '../geom/assembly'
import { validateCarcaseParams } from '../scene/carcaseRoles'
import { overridesOf, roleThicknessFor } from '../scene/resolveThickness'
import type {
  CarcaseComponent,
  Component,
  ComponentId,
  MaterialDef,
  Part,
  PartId,
} from '../scene/types'

// One orthographic view of a cabinet, drawn from the projector's unscaled millimetres and fitted to
// whatever size the pane happens to be. The sheet builder reads the same data and scales it
// differently — which is why the projector emits neither a scale nor a page offset.
//
// Unlike SectionElevation this draws text, so label size is a fraction of the view's own extent and
// strokes are non-scaling: a 3 mm label on a 720 mm cabinet would otherwise render at under two
// pixels once the viewBox is fitted to the pane.

// The annotation ring is measured in **ems**, never in millimetres, and `font` is a fixed fraction
// of the view's SMALLER extent. Both halves matter. A ring sized in absolute millimetres against a
// font that scaled with the cabinet is what clipped a Tall 600's "2100" by 71 mm — the label grew
// and the margin holding it did not. And sizing the font off the LARGER extent made a label on a
// 600 x 2100 cabinet 47 mm tall against a 600 mm width, which crowds the view it annotates.
//
// Stated in ems throughout, the whole apparatus is scale-invariant: the cabinet occupies the same
// fraction of the pane whatever its size, which is the property the tests pin.
const FONT_DIVISOR = 30

export function CabinetProjection({
  view,
  parts,
  byId,
  cabinet,
  materials,
  selectedId,
  onSelect,
}: {
  view: 'Front' | 'Top' | 'End'
  parts: Part[]
  byId: Map<ComponentId, Component>
  cabinet: CarcaseComponent
  materials: Record<string, MaterialDef>
  selectedId: PartId | null
  onSelect: (id: PartId) => void
}) {
  const thicknessOf = roleThicknessFor(cabinet.params, materials, overridesOf(parts, cabinet.id))
  const buildable = validateCarcaseParams(cabinet.params, thicknessOf).length === 0

  // Not memoised. `parts`, `byId`, `cabinet` and `materials` are all rebuilt by App on every
  // render, so a useMemo over them would recompute every time anyway while reading as though it
  // did not. A whole-cabinet projection is a few hundred rectangles; measure before adding one.
  const views = buildable ? buildAssemblyViews(parts, byId, cabinet, materials) : null

  if (views === null) {
    return (
      <p className="text-[11px] text-muted-foreground">
        This cabinet’s parameters do not build, so it has no projection to draw.
      </p>
    )
  }

  const v: AssemblyView = views.find((x) => x.label === view)!
  const W = v.bounds.w
  const H = v.bounds.h
  const font = Math.min(W, H) / FONT_DIVISOR

  // Derived from the labels this view actually carries, never from a guess at the longest one a
  // cabinet might produce. A dimension is free to be "2100" or "1234.56"; asking the data removes
  // that whole class of overflow rather than picking a bound that holds until it does not.
  const widest = Math.max(...v.dims.map((d) => d.label.length), 1)
  const padding = font * (RING_EM[2] + TICK_EM + TEXT_GAP_EM + CHAR_EM * widest)

  // Carcase v runs up and SVG y runs down. Written once, exactly as SectionElevation does it.
  const flip = (y: number, h: number) => H - y - h

  const dimAt = (
    d: AssemblyDim,
  ): {
    x1: number
    y1: number
    x2: number
    y2: number
    tx: number
    ty: number
    anchor: 'middle' | 'start' | 'end'
  } => {
    const off = font * (RING_EM[d.ring] + TICK_EM)
    if (d.axis === 'h') {
      const y = d.side === 'below' ? H + off : -off
      const ty = d.side === 'below' ? y + font : y - font * TEXT_GAP_EM
      return {
        x1: d.start,
        y1: y,
        x2: d.end,
        y2: y,
        tx: (d.start + d.end) / 2,
        ty,
        anchor: 'middle',
      }
    }
    // A side label reads OUTWARD from its own ring. Anchoring both sides 'start' ran the left-hand
    // labels back across the drawing they annotate.
    const right = d.side === 'right'
    const x = right ? W + off : -off
    return {
      x1: x,
      y1: flip(d.start, 0),
      x2: x,
      y2: flip(d.end, 0),
      tx: right ? x + font * TEXT_GAP_EM : x - font * TEXT_GAP_EM,
      ty: (flip(d.start, 0) + flip(d.end, 0)) / 2,
      anchor: right ? 'start' : 'end',
    }
  }

  return (
    <svg
      viewBox={`${-padding} ${-padding} ${W + padding * 2} ${H + padding * 2}`}
      role="img"
      aria-label={`Cabinet ${view} view`}
      className="w-full h-full max-h-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Farthest first so the nearest part paints last and takes the click. */}
      {[...v.parts].reverse().map((part) => {
        const selected = part.partId === selectedId
        return (
          <g
            key={part.partId}
            data-testid={`projection-part-${part.partId}`}
            data-selected={selected}
            onClick={() => onSelect(part.partId)}
            className="cursor-pointer"
          >
            {part.rects.map((r, i) => (
              <rect
                key={i}
                x={r.x}
                y={flip(r.y, r.h)}
                width={r.w}
                height={r.h}
                className={selected ? 'fill-primary/25' : 'fill-transparent hover:fill-accent/40'}
              />
            ))}
            {/* A part that is not an axis-aligned box has `outline` — its real silhouette — while
                its `rects` is only the bounding rectangle it is hit-tested by. Drawing `solid` for
                one would draw a box around a tilted dowel, so the two are alternatives, never
                both. */}
            {part.outline === undefined ? (
              part.solid.map((s, i) => (
                <line
                  key={`s${i}`}
                  x1={s.x1}
                  y1={flip(s.y1, 0)}
                  x2={s.x2}
                  y2={flip(s.y2, 0)}
                  stroke={selected ? 'currentColor' : '#333'}
                  strokeWidth={selected ? 2 : 1}
                  vectorEffect="non-scaling-stroke"
                />
              ))
            ) : (
              <polygon
                points={part.outline.map((q) => `${q.x},${flip(q.y, 0)}`).join(' ')}
                fill="none"
                stroke={selected ? 'currentColor' : '#333'}
                strokeWidth={selected ? 2 : 1}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {part.hidden.map((s, i) => (
              <line
                key={`h${i}`}
                x1={s.x1}
                y1={flip(s.y1, 0)}
                x2={s.x2}
                y2={flip(s.y2, 0)}
                stroke="#999"
                strokeDasharray="4 3"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {part.cutRects.map((c, i) => (
              <rect
                key={`c${i}`}
                x={c.rect.x}
                y={flip(c.rect.y, c.rect.h)}
                width={c.rect.w}
                height={c.rect.h}
                fill="none"
                stroke="#999"
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {part.circles.map((c, i) => (
              <circle
                key={`o${i}`}
                cx={c.cx}
                cy={flip(c.cy, 0)}
                r={c.r}
                fill="none"
                stroke="#999"
                strokeDasharray="2 2"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        )
      })}

      {v.dims.map((d, i) => {
        const g = dimAt(d)
        return (
          <g key={i}>
            <line
              x1={g.x1}
              y1={g.y1}
              x2={g.x2}
              y2={g.y2}
              stroke="#666"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <text x={g.tx} y={g.ty} fontSize={font} fill="#666" textAnchor={g.anchor}>
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
