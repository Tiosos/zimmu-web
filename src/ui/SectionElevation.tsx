import {
  frontGeometryOf,
  openingRect,
  sectionThickness,
  validateCarcaseParams,
} from '../scene/carcaseRoles'
import { overridesOf, roleThicknessFor } from '../scene/resolveThickness'
import { resolveSections } from '../scene/sectionTree'
import { sectionOpenings } from '../scene/sectionInterior'
import type { CarcaseParams, ComponentId, MaterialDef, Part, SectionId } from '../scene/types'

// The cabinet's front elevation, drawn from the resolved section tree: every leaf a cell you can
// click, every division a bar between them. The first interactive SVG in the codebase —
// `buildSvg.ts` and `buildSheetSvg.ts` produce SVG *strings*, and every rectangle here needs a
// click handler, so this renders React elements instead.
//
// Carcase z runs up and SVG y runs down. That flip happens in `toSvg` and nowhere else: two copies
// of it would eventually disagree, and an upside-down cabinet looks entirely plausible until one is
// asymmetric.

const PADDING = 12

// Sized off the whole elevation, never per cell, and the same divisor `CabinetProjection` uses. A
// per-cell fraction makes numbers meant to be read as one sequence disagree wildly — measured, a
// 40 mm bay beside a full-height one gave 6.7 against 87.7 — and gives a single-opening cabinet a
// numeral 16% of its own height, which reads as a watermark rather than a label.
const FONT_DIVISOR = 30

export function SectionElevation({
  params,
  materials,
  parts,
  componentId,
  selected,
  onSelect,
}: {
  params: CarcaseParams
  materials: Record<string, MaterialDef>
  // The cabinet's own boards, so a panel the user has overridden is drawn at the thickness it is
  // built at. Resolving from an empty map drew a 600 mm cabinet with a 25 mm side as a 564 mm
  // opening its boards make 557.
  parts: Part[]
  componentId: ComponentId
  selected: SectionId | null
  onSelect: (id: SectionId | null) => void
}) {
  const thicknessOf = roleThicknessFor(params, materials, overridesOf(parts, componentId))
  // A cabinet whose parameters do not build has no rectangles to draw. Empty rather than throwing,
  // matching every other consumer of the generator: the params are mid-keystroke, not wrong.
  const buildable = validateCarcaseParams(params, thicknessOf).length === 0
  if (!buildable) {
    return (
      <p className="text-[11px] text-muted-foreground">
        This cabinet’s parameters do not build, so it has no elevation to draw.
      </p>
    )
  }

  const tree = resolveSections(
    params.section,
    openingRect(params, thicknessOf),
    sectionThickness(thicknessOf),
  )

  // The same frame-opening map used by fronts, interiors and machining. The elevation must not
  // invent a fourth frame calculation just to print a dimension.
  const frontGeometry = frontGeometryOf(params, tree)
  const frameOpenings = frontGeometry.frameOpenings
  const frameLeafOpenings = frontGeometry.frameLeafOpenings
  const frameMembers = frontGeometry.frameMembers ?? []

  const W = params.width
  const H = params.height
  const font = Math.min(W, H) / FONT_DIVISOR
  // The one place carcase space becomes screen space. Carcase z is measured up from the floor and
  // SVG y down from the top, so the height is subtracted rather than scaled.
  const toSvg = (x: number, z0: number, z1: number) => ({
    x: x + PADDING,
    y: H - z1 + PADDING,
    height: z1 - z0,
  })

  const elevationOpenings = sectionOpenings(params.section, tree)
  const displayOf = (o: (typeof elevationOpenings)[number]) => {
    const { x, y, height } = toSvg(o.rect.x0, o.rect.z0, o.rect.z1)
    const width = o.rect.x1 - o.rect.x0
    const framed = frameOpenings?.get(o.sectionId)
    const leftLeaf = frameLeafOpenings?.get(`${o.sectionId}|0`)
    const rightLeaf = frameLeafOpenings?.get(`${o.sectionId}|1`)
    const dimension =
      leftLeaf !== undefined && rightLeaf !== undefined
        ? `${Math.round(leftLeaf.x1 - leftLeaf.x0)} × ${Math.round(leftLeaf.z1 - leftLeaf.z0)} / ${Math.round(rightLeaf.x1 - rightLeaf.x0)} × ${Math.round(rightLeaf.z1 - rightLeaf.z0)}`
        : framed === undefined
          ? null
          : `${Math.round(framed.x1 - framed.x0)} × ${Math.round(framed.z1 - framed.z0)}`
    return { x, y, height, width, framed, dimension }
  }

  return (
    <svg
      viewBox={`0 0 ${W + PADDING * 2} ${H + PADDING * 2}`}
      role="img"
      aria-label="Cabinet elevation"
      className="w-full h-full max-h-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* The carcase itself, and the way back to "nothing selected". */}
      <rect
        data-testid="section-elevation-background"
        x={PADDING}
        y={PADDING}
        width={W}
        height={H}
        className="fill-muted stroke-border"
        strokeWidth={2}
        onClick={() => onSelect(null)}
      />

      {elevationOpenings.map((o) => {
        const { x, y, height, width } = displayOf(o)
        const isSelected = o.sectionId === selected
        return (
          <rect
            key={o.sectionId}
            data-testid={`section-cell-${o.sectionId}`}
            data-selected={isSelected}
            x={x}
            y={y}
            width={width}
            height={height}
            className={
              isSelected
                ? 'fill-primary/25 stroke-primary cursor-pointer'
                : 'fill-background stroke-border cursor-pointer hover:fill-accent'
            }
            strokeWidth={isSelected ? 3 : 1}
            onClick={() => onSelect(o.sectionId)}
          />
        )
      })}

      {/* Frame members are above opening fills but below labels. They never steal the opening click. */}
      {frameMembers.map((member) => {
        const { x, y, height } = toSvg(member.rect.x0, member.rect.z0, member.rect.z1)
        return (
          <rect
            key={member.role}
            data-testid={`frame-member-${member.role}`}
            x={x}
            y={y}
            width={member.rect.x1 - member.rect.x0}
            height={height}
            className="fill-muted-foreground/35 pointer-events-none"
          />
        )
      })}

      {tree.divisions.map((d) => {
        const { x, y, height } = toSvg(d.rect.x0, d.rect.z0, d.rect.z1)
        return (
          <rect
            key={`${d.parentId}-${d.index}`}
            data-testid={`section-division-${d.parentId}-${d.index}`}
            x={x}
            y={y}
            width={d.rect.x1 - d.rect.x0}
            height={height}
            className="fill-muted-foreground/60"
          />
        )
      })}

      {elevationOpenings.map((o, i) => {
        const { x, y, height, width, framed, dimension } = displayOf(o)
        return (
          <g key={`label-${o.sectionId}`} className="pointer-events-none">
            {/* SceneTree numbers this same opening array, so editor and tree agree by construction. */}
            <text
              data-kind="section-number"
              x={x + width / 2}
              y={y + height / 2 - (framed === undefined ? 0 : font * 0.6)}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-muted-foreground"
              fontSize={font}
            >
              {i + 1}
            </text>
            {dimension !== null && (
              <text
                data-testid={`section-opening-dimension-${o.sectionId}`}
                x={x + width / 2}
                y={y + height / 2 + font * 0.8}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-muted-foreground"
                fontSize={font * 0.7}
              >
                {dimension}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
