import { beforeEach, describe, expect, it, vi } from 'vitest'
import { unzipSync } from 'fflate'
import { cabinet } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import { regenerateComponents } from '../scene/regenerateComponents'
import type { MaterialDef, Scene } from '../scene/types'
import type { GroupedRow } from './buildCsv'

const built = vi.hoisted(() => ({ rows: [] as GroupedRow[][] }))

vi.mock('./buildCsv', async (importOriginal) => {
  const original = await importOriginal<typeof import('./buildCsv')>()
  return {
    ...original,
    groupParts: (...args: Parameters<typeof original.groupParts>) => {
      const rows = original.groupParts(...args)
      built.rows.push(rows)
      return rows
    },
    groupPartsFromRecords: (...args: Parameters<typeof original.groupPartsFromRecords>) => {
      const rows = original.groupPartsFromRecords(...args)
      built.rows.push(rows)
      return rows
    },
  }
})

import { buildProductionPacket } from './buildProductionPacket'
import { reconcileScene } from './outputReconciliation'

// `use` comes from the scene alone, so the project marks the band as edge stock and only the library
// knows its thickness.
const library: Record<string, MaterialDef> = { 'ABS 1mm': { thickness: 1 } }
const base: Scene = regenerateComponents({
  components: [{ ...cabinet, visible: false }],
  parts: [],
  joints: [],
  hardware: [],
  materials: { ...PRESET_MATERIALS, 'ABS 1mm': { use: 'edge' } },
})
const scene: Scene = regenerateComponents({
  ...base,
  components: base.components.map((c) =>
    c.kind === 'carcase' ? { ...c, params: { ...c.params, edgeMaterial: 'ABS 1mm' } } : c,
  ),
})

const facts = (rows: GroupedRow[]) =>
  Object.fromEntries(
    rows.map((r) => [r.labels, [r.edgeCode, r.length, r.width, r.problem ?? '']]),
  ) as Record<string, (string | number)[]>

describe('a banded cabinet whose band thickness lives only in the material library', () => {
  beforeEach(() => {
    built.rows.length = 0
  })

  it('is banded in the panel check exactly as the packet bands it', async () => {
    expect(scene.materials['ABS 1mm']?.thickness).toBeUndefined()
    await buildProductionPacket({
      scene,
      projectName: 'Workshop A',
      hardwareLibrary: {},
      materialLibrary: library,
      capturedAt: new Date('2026-09-29T01:00:00Z'),
    })
    const packet = facts(built.rows.at(-1)!)
    expect(packet.Bottom[0]).not.toBe('')

    reconcileScene(scene, library)
    expect(facts(built.rows.at(-1)!)).toEqual(packet)
  })

  it('changes what the panel check builds when it is given no library', () => {
    reconcileScene(scene, library)
    const withLibrary = facts(built.rows.at(-1)!)
    reconcileScene(scene, {})
    expect(facts(built.rows.at(-1)!)).not.toEqual(withLibrary)
  })

  it('has the same verdict through the packet as through the panel when the check fails', async () => {
    const dup: Scene = { ...scene, parts: [...scene.parts, structuredClone(scene.parts[0])] }
    const files = unzipSync(
      await buildProductionPacket({
        scene: dup,
        projectName: 'Workshop A',
        hardwareLibrary: {},
        materialLibrary: library,
        capturedAt: new Date('2026-09-29T01:00:00Z'),
      }),
    )
    const packet = JSON.parse(new TextDecoder().decode(files['readiness/reconciliation.json']))
    const panel = reconcileScene(dup, library)
    const shape = (r: {
      status: string
      compared: number
      totalFindings: number
      findings: { kind: string; field?: string; partId: string }[]
    }) => ({
      status: r.status,
      compared: r.compared,
      totalFindings: r.totalFindings,
      findings: r.findings.map((f) => [f.kind, f.field, f.partId]),
    })
    expect(panel.status).toBe('failed')
    expect(shape(packet)).toEqual(shape(panel))
  })
})
