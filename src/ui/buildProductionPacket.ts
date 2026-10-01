import { strToU8, zip } from 'fflate'
import type { Scene, HardwareLibraryEntry, CarcaseComponent, MaterialDef } from '../scene/types'
import { componentsById, descendantIds } from '../scene/componentTree'
import { carcaseHardware } from '../scene/carcaseHardware'
import { createReadinessSnapshot } from '../scene/readinessSnapshot'
import { buildDrawingSheets } from '../geom/drawing'
import { buildCsv, buildDowelCsv, buildHardwareCsv } from './buildCsv'
import { effectiveMaterialsOf } from './effectiveMaterials'
import { groupHardware } from './groupHardware'
import { buildPdf } from './buildPdf'
import { buildReadinessPdf, readinessPdfFilename } from './buildReadinessPdf'

export interface ProductionPacketInput {
  scene: Scene
  projectName: string
  hardwareLibrary: Record<string, HardwareLibraryEntry>
  materialLibrary: Record<string, MaterialDef>
  capturedAt?: Date
}

export function productionPacketFilename(projectName: string): string {
  return readinessPdfFilename(projectName).replace(
    '-manufacturing-readiness.pdf',
    '-production-packet.zip',
  )
}

const digest = async (bytes: Uint8Array): Promise<string> => {
  const hash = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}

const archive = (files: Record<string, Uint8Array>): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (error, data) => (error ? reject(error) : resolve(data)))
  })

export async function buildProductionPacket(input: ProductionPacketInput): Promise<Uint8Array> {
  // This copy happens before the first await, including both pricing libraries outside the scene.
  const captured = structuredClone({
    scene: input.scene,
    projectName: input.projectName,
    hardwareLibrary: input.hardwareLibrary,
    materialLibrary: input.materialLibrary,
  })
  const capturedAt = new Date(input.capturedAt ?? new Date())
  const snapshot = createReadinessSnapshot(captured.scene, captured.projectName, capturedAt)
  const byId = componentsById(captured.scene.components)
  const cabinets = captured.scene.components
    .filter((c): c is CarcaseComponent => c.kind === 'carcase')
    .map((cabinet) => {
      const ids = new Set(
        descendantIds(cabinet.id, captured.scene.components, captured.scene.parts).partIds,
      )
      return {
        cabinet,
        parts: captured.scene.parts.filter((part) => ids.has(part.id)),
        materials: captured.scene.materials,
        byId,
      }
    })
  // Match BomModal's field-level merge: scene rates override library rates, while missing rates
  // (such as a dowel's costPerM) remain available from the library.
  const effectiveMaterials = effectiveMaterialsOf(captured.materialLibrary, captured.scene.materials)

  const withInstallation = new Set(
    snapshot.cabinets
      .filter((c) => c.shelves.some((s) => s.installationReference !== null))
      .map((c) => c.id),
  )
  const sheets = buildDrawingSheets(
    captured.scene.parts,
    captured.projectName,
    cabinets,
    capturedAt.toISOString().slice(0, 10),
    withInstallation,
    [],
    { materials: effectiveMaterials, byId },
  )
  const references = new Set(
    sheets.filter((s) => s.kind === 'installation').map((s) => `${s.cabinetId}/${s.shelfRole}`),
  )
  for (const cabinet of snapshot.cabinets)
    for (const shelf of cabinet.shelves)
      if (shelf.installationReference && !references.has(shelf.installationReference))
        throw new Error(`Installation sheet missing for ${shelf.installationReference}`)

  const files: Record<string, Uint8Array> = {
    'readiness/report.pdf': await buildReadinessPdf(snapshot),
    'drawings/shop-drawings.pdf': await buildPdf(sheets),
    'lists/boards.csv': strToU8(
      buildCsv(captured.scene.parts, effectiveMaterials, captured.scene.components),
    ),
    'lists/dowels.csv': strToU8(buildDowelCsv(captured.scene.parts, effectiveMaterials)),
    'lists/hardware.csv': strToU8(
      buildHardwareCsv(
        captured.scene.hardware,
        groupHardware(carcaseHardware(captured.scene), captured.hardwareLibrary),
      ),
    ),
  }
  const entries = await Promise.all(
    Object.entries(files).map(async ([path, bytes]) => ({
      path,
      bytes: bytes.byteLength,
      sha256: await digest(bytes),
    })),
  )
  const source = strToU8(JSON.stringify(captured))
  const manifest = {
    schemaVersion: 1,
    projectName: captured.projectName,
    capturedAt: snapshot.capturedAt,
    sourceSha256: await digest(source),
    sourceDescription:
      'SHA-256 of JSON.stringify({scene,projectName,hardwareLibrary,materialLibrary}) at export time',
    counts: {
      cabinets: snapshot.cabinets.length,
      parts: captured.scene.parts.length,
      findings: snapshot.production.findings.length,
      drawingSheets: sheets.length,
      installationSheets: references.size,
    },
    scope:
      'All cabinets and parts, including hidden items. Readiness is advisory; skipped checks remain marked unknown. Drawing PDF, lists and prices come from the same captured scene and pricing libraries.',
    note: 'Snapshot hash identifies captured source data, not a saved project revision. Drawing PDF uses DIA for the diameter symbol and [U+codepoint] for characters unsupported by its standard font. Verify physical dimensions and machining before production.',
    files: entries,
  }
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2) + '\n')
  return archive(files)
}
