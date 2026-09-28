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
  requested: number
  generated: number
  missing: number
  angled: number
  unverified: number
  issues: string[]
  shelves: ShelfReadinessRow[]
}

// Requested quantities come from the specification, not the solver's callbacks: a shelf with
// no available pin position never reaches motion planning. Generated quantities come from the
// current scene, not from predicting what regeneration ought to emit.
function requestedRoles(section: Section): string[] {
  if (section.content.kind === 'split') return section.content.children.flatMap(requestedRoles)
  const count = section.interior?.adjustable.shelves ?? 0
  if (!Number.isInteger(count) || count < 0) return []
  return Array.from({ length: count }, (_, i) => `adj-shelf-${section.id}-${i}`)
}

export function buildShelfReadiness(scene: Scene): CabinetShelfReadiness[] {
  return scene.components
    .filter((c): c is CarcaseComponent => c.kind === 'carcase')
    .map((cabinet) => {
      const requested = requestedRoles(cabinet.params.section)
      const parts = scene.parts.filter(
        (p) => p.kind === 'board' && p.parentId === cabinet.id && p.role?.startsWith('adj-shelf-'),
      )
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
