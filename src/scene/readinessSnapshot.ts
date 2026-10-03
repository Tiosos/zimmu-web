import type { MaterialDef, Scene } from './types'
import { buildProductionReadiness } from './productionReadiness'
import { manufacturingParts } from './manufacturingPart'
import { manufacturingMachining } from './manufacturingMachining'
import { manufacturingChecks } from './manufacturingChecks'
import { effectiveMaterialsOf } from './effectiveMaterials'
import { buildShelfReadiness } from './shelfReadiness'

export function createReadinessSnapshot(
  scene: Scene,
  projectName: string,
  date = new Date(),
  materialLibrary: Record<string, MaterialDef> = {},
) {
  // Capture before any asynchronous PDF work: later edits cannot mix revisions in one report.
  const captured = structuredClone(scene)
  const records = manufacturingParts(
    captured.parts,
    effectiveMaterialsOf(structuredClone(materialLibrary), captured.materials),
    captured.components,
  )
  const production = buildProductionReadiness(captured)
  const shelves = buildShelfReadiness(captured)
  const owner = (kind: 'part' | 'component', id: string): string | null => {
    let component =
      kind === 'part'
        ? captured.components.find(
            (c) => c.id === captured.parts.find((p) => p.id === id)?.parentId,
          )
        : captured.components.find((c) => c.id === id)
    const seen = new Set<string>()
    while (component && !seen.has(component.id)) {
      if (component.kind === 'carcase') return component.id
      seen.add(component.id)
      component = captured.components.find((c) => c.id === component!.parentId)
    }
    return null
  }
  return {
    projectName,
    capturedAt: date.toISOString(),
    manufacturing: manufacturingChecks(records),
    machining: manufacturingMachining(records),
    production: {
      ...production,
      findings: production.findings.map((f, i) => ({
        ...f,
        reference: `F${i + 1}`,
        cabinetIds: [
          ...new Set(
            f.targets
              .map((t) => owner(t.selection.kind, t.selection.id))
              .filter((id): id is string => id !== null),
          ),
        ],
      })),
    },
    cabinets: shelves.map((entry) => ({
      id: entry.cabinet.id,
      label: entry.cabinet.label,
      requested: entry.requested,
      generated: entry.generated,
      missing: entry.missing,
      angled: entry.angled,
      unverified: entry.unverified,
      issues: entry.issues,
      shelves: entry.shelves.map((s) => ({
        role: s.role,
        label: s.label,
        generated: s.generated,
        status: s.status,
        installationReference: s.access ? `${entry.cabinet.id}/${s.role}` : null,
      })),
    })),
  }
}

export type ReadinessSnapshot = ReturnType<typeof createReadinessSnapshot>
