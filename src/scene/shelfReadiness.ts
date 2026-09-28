import type { CarcaseComponent, Scene } from './types'
import type { Section } from './sectionTree'
import { adjustableShelfAccessResults, type AdjustableShelfAccessResult } from './carcaseParts'
import { roleThicknessFor, overridesOf } from './resolveThickness'
import { validateCarcaseParams } from './carcaseValidation'

export interface ShelfReadinessRow {
  role: string
  label: string
  generated: boolean
  access?: AdjustableShelfAccessResult
  status: 'straight' | 'rotated' | 'unverified' | 'unplaced' | 'unassessed'
}

export interface CabinetShelfReadiness {
  cabinet: CarcaseComponent
  requested: number | null
  generated: number
  missing: number | null
  angled: number | null
  unverified: number | null
  issues: string[]
  shelves: ShelfReadinessRow[]
}

// Requested quantities come from the specification, not the solver's callbacks: a shelf with
// no available pin position never reaches motion planning. Generated quantities come from the
// current scene, not from predicting what regeneration ought to emit.
// A report-only resource limit, not a manufacturing limit. Validate the whole cabinet before
// allocating rows or invoking the solver; the generator itself only seats available pin positions.
export const MAX_READINESS_SHELVES = 1000

function requestedRoles(root: Section): { count: number | null; roles: string[]; issue?: string } {
  const leaves: { id: string; count: number }[] = []
  let count = 0
  const visit = (section: Section): void => {
    if (section.content.kind === 'split') {
      section.content.children.forEach(visit)
      return
    }
    const n = section.interior?.adjustable.shelves ?? 0
    if (!Number.isSafeInteger(n) || n < 0 || !Number.isSafeInteger(count + n)) {
      count = NaN
      return
    }
    count += n
    leaves.push({ id: section.id, count: n })
  }
  visit(root)
  if (!Number.isSafeInteger(count)) {
    return {
      count: null,
      roles: [],
      issue:
        'Shelf quantities must be non-negative safe integers with a safely representable total. Correct the shelf quantities to assess this cabinet.',
    }
  }
  if (count > MAX_READINESS_SHELVES) {
    return {
      count,
      roles: [],
      issue: `Requested shelf quantity exceeds the report limit of ${MAX_READINESS_SHELVES} per cabinet. Assessment was skipped; check the shelf quantities. No design quantities were changed.`,
    }
  }
  return {
    count,
    roles: leaves.flatMap((leaf) =>
      Array.from({ length: leaf.count }, (_, i) => `adj-shelf-${leaf.id}-${i}`),
    ),
  }
}

export function buildShelfReadiness(scene: Scene): CabinetShelfReadiness[] {
  return scene.components
    .filter((c): c is CarcaseComponent => c.kind === 'carcase')
    .map((cabinet) => {
      const request = requestedRoles(cabinet.params.section)
      const parts = scene.parts.filter(
        (p) => p.kind === 'board' && p.parentId === cabinet.id && p.role?.startsWith('adj-shelf-'),
      )
      if (request.issue) {
        return {
          cabinet,
          requested: request.count,
          generated: parts.length,
          missing: null,
          angled: null,
          unverified: null,
          issues: [request.issue],
          shelves: [],
        }
      }
      const requested = request.roles
      let issues: string[] = []
      let access: AdjustableShelfAccessResult[] = []
      try {
        const thickness = roleThicknessFor(
          cabinet.params,
          scene.materials,
          overridesOf(scene.parts, cabinet.id),
        )
        issues = validateCarcaseParams(cabinet.params, thickness)
        if (issues.length === 0) access = adjustableShelfAccessResults(cabinet.params, thickness)
      } catch (error) {
        issues = [
          error instanceof Error ? error.message : 'Cabinet geometry could not be assessed.',
        ]
      }
      const byRole = new Map(access.map((result) => [result.role, result]))
      const shelves: ShelfReadinessRow[] = requested.map((role, i) => {
        const result = byRole.get(role)
        const part = parts.find((p) => p.role === role)
        return {
          role,
          label: part?.label ?? `Requested shelf ${i + 1}`,
          generated: part !== undefined,
          access: result,
          status: issues.length
            ? 'unassessed'
            : !result
              ? 'unplaced'
              : !result.path
                ? 'unverified'
                : result.path.kind,
        }
      })
      // Stale/duplicate boards are not evidence that the requested shelves were generated.
      if (
        parts.some((p) => !requested.includes(p.role!)) ||
        new Set(parts.map((p) => p.role)).size !== parts.length
      ) {
        issues.push(
          'Generated shelf boards include unexpected or duplicate roles; review the cabinet.',
        )
      }
      if (shelves.some((s) => s.generated && s.access?.path === null)) {
        issues.push(
          'A generated shelf has no verified route under the current design; review regeneration.',
        )
      }
      return {
        cabinet,
        requested: requested.length,
        generated: parts.length,
        missing: shelves.filter((s) => !s.generated).length,
        angled: shelves.filter((s) => s.status === 'rotated').length,
        unverified: shelves.filter((s) => s.status === 'unverified').length,
        issues,
        shelves,
      }
    })
}
