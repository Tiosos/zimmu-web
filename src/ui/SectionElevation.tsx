import { openingRect, validateCarcaseParams } from '../scene/carcaseRoles'
import { roleThicknessFor } from '../scene/resolveThickness'
import { resolveSections } from '../scene/sectionTree'
import { sectionOpenings } from '../scene/sectionInterior'
import type { CarcaseParams, MaterialDef, SectionId } from '../scene/types'

// The cabinet's front elevation, drawn from the resolved section tree: every leaf a cell you can
// click, every division a bar between them. The first interactive SVG in the codebase —
// `buildSvg.ts` and `buildSheetSvg.ts` produce SVG *strings*, and every rectangle here needs a
// click handler, so this renders React elements instead.
//
// Carcase z runs up and SVG y runs down. That flip happens in `toSvg` and nowhere else: two copies
// of it would eventually disagree, and an upside-down cabinet looks entirely plausible until one is
// asymmetric.

const PADDING = 12

export function SectionElevation({
  params,
  materials,
  selected,
  onSelect,
}: {
  params: CarcaseParams
  materials: Record<string, MaterialDef>
  selected: SectionId | null
  onSelect: (id: SectionId | null) => void
}) {
  const thicknessOf = roleThicknessFor(params, materials, new Map())
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
    (parentId, index) => thicknessOf(`division-${parentId}-${index}`),
  )

  const W = params.width
  const H = params.height
  // The one place carcase space becomes screen space. Carcase z is measured up from the floor and
  // SVG y down from the top, so the height is subtracted rather than scaled.
  const toSvg = (x: number, z0: number, z1: number) => ({
    x: x + PADDING,
    y: H - z1 + PADDING,
    height: z1 - z0,
  })

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

      {sectionOpenings(params.section, tree).map((o) => {
        const { x, y, height } = toSvg(o.rect.x0, o.rect.z0, o.rect.z1)
        const isSelected = o.sectionId === selected
        return (
          <rect
            key={o.sectionId}
            data-testid={`section-cell-${o.sectionId}`}
            data-selected={isSelected}
            x={x}
            y={y}
            width={o.rect.x1 - o.rect.x0}
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
    </svg>
  )
}
