import type { FrontGeometry } from './frontCells'
import { frontGeometryOf, openingRect, sectionThickness, usableInteriorRect } from './carcaseLayout'
import type { RoleThickness } from './resolveThickness'
import { sectionInteriors } from './sectionInterior'
import { resolveSections, type Rect, type SectionId } from './sectionTree'
import type { CarcaseParams } from './types'

export interface InteriorAccessAperture {
  id: string
  rect: Rect
}

export interface InteriorAccessIssue {
  kind: 'adjustable-shelf-access'
  sectionId: SectionId
  role: string
  shelfWidth: number
  shelfThickness: number
  apertures: InteriorAccessAperture[]
}

// Kept here with the access rule rather than copied from the part generator: access has to judge
// the manufactured shelf, whose side clearance is part of its size, not the raw section opening.
export const ADJUSTABLE_SHELF_SIDE_CLEARANCE = 2

export function accessAperturesForSection(
  sectionId: SectionId,
  sectionRect: Rect,
  fronts: FrontGeometry,
): InteriorAccessAperture[] {
  const framed = [...(fronts.frameAccessOpenings?.values() ?? [])]
    .filter((opening) => opening.sectionId === sectionId)
    .map((opening) => ({ id: opening.id, rect: opening.rect }))
  // Frameless, or a face frame that safely declined: the structural opening itself is the path.
  return framed.length > 0 ? framed : [{ id: sectionId, rect: sectionRect }]
}

// Stage 1 intentionally models only straight insertion normal to the cabinet face. A future
// rotation/diagonal solver can add strategies without weakening this deterministic baseline.
export function shelfPassesAperture(
  shelfWidth: number,
  shelfThickness: number,
  aperture: Rect,
): boolean {
  return (
    aperture.x1 - aperture.x0 >= shelfWidth &&
    aperture.z1 - aperture.z0 >= shelfThickness
  )
}

export function shelfHasAccess(
  sectionId: SectionId,
  sectionRect: Rect,
  fronts: FrontGeometry,
  shelfWidth: number,
  shelfThickness: number,
): boolean {
  return accessAperturesForSection(sectionId, sectionRect, fronts).some((aperture) =>
    shelfPassesAperture(shelfWidth, shelfThickness, aperture.rect),
  )
}

export function adjustableShelfAccessIssues(
  p: CarcaseParams,
  thicknessOf: RoleThickness,
): InteriorAccessIssue[] {
  const tree = resolveSections(
    p.section,
    openingRect(p, thicknessOf),
    sectionThickness(thicknessOf),
  )
  const fronts = frontGeometryOf(p, tree)
  const issues: InteriorAccessIssue[] = []

  for (const { sectionId, rect, spec } of sectionInteriors(p.section, tree)) {
    if (spec.adjustable.shelves < 1) continue
    const installed = usableInteriorRect(rect, fronts.frameOpenings?.get(sectionId))
    const shelfWidth =
      installed.x1 - installed.x0 - 2 * ADJUSTABLE_SHELF_SIDE_CLEARANCE
    for (let i = 0; i < spec.adjustable.shelves; i++) {
      const role = `adj-shelf-${sectionId}-${i}`
      const shelfThickness = thicknessOf(role)
      if (!shelfHasAccess(sectionId, rect, fronts, shelfWidth, shelfThickness)) {
        issues.push({
          kind: 'adjustable-shelf-access',
          sectionId,
          role,
          shelfWidth,
          shelfThickness,
          apertures: accessAperturesForSection(sectionId, rect, fronts),
        })
      }
    }
  }
  return issues
}
