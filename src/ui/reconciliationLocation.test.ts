import { describe, expect, it, vi } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { cabinet } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import { regenerateComponents } from '../scene/regenerateComponents'
import type { Scene } from '../scene/types'

vi.mock('./buildCsv', async (importOriginal) => {
  const original = await importOriginal<typeof import('./buildCsv')>()
  return {
    ...original,
    groupParts: (...args: Parameters<typeof original.groupParts>) => {
      const rows = original.groupParts(...args)
      if (rows[0]) rows[0] = { ...rows[0], material: 'Elsewhere' }
      return rows
    },
    groupPartsFromRecords: (...args: Parameters<typeof original.groupPartsFromRecords>) => {
      const rows = original.groupPartsFromRecords(...args)
      if (rows[0]) rows[0] = { ...rows[0], material: 'Elsewhere' }
      return rows
    },
  }
})

import { buildProductionPacket } from './buildProductionPacket'
import { reconcileScene } from './outputReconciliation'

const scene: Scene = regenerateComponents({
  components: [{ ...cabinet, visible: false }],
  parts: [],
  joints: [],
  hardware: [],
  materials: PRESET_MATERIALS,
})

const sources = (findings: { left?: { source: string }; right?: { source: string } }[]) =>
  findings.flatMap((f) => [f.left?.source, f.right?.source]).filter((s) => s !== undefined)

describe('where a finding says to look', () => {
  it('names a sheet of the checked drawing set in the panel, never a PDF page', () => {
    const r = reconcileScene(scene, {})
    const drawn = sources(r.findings).filter((s) => s.startsWith('drawings'))
    expect(r.findings.length).toBeGreaterThan(0)
    expect(drawn.length).toBeGreaterThan(0)
    for (const s of drawn) {
      expect(s).toMatch(/^drawings, sheet \d+ of the checked drawing set$/)
      expect(s).not.toContain('PDF page')
    }
  })

  it('names the PDF page in the packet', async () => {
    const files = unzipSync(
      await buildProductionPacket({
        scene,
        projectName: 'Workshop A',
        hardwareLibrary: {},
        materialLibrary: {},
        capturedAt: new Date('2026-09-29T01:00:00Z'),
      }),
    )
    const r = JSON.parse(strFromU8(files['readiness/reconciliation.json']))
    const drawn = sources(r.findings).filter((s: string) => s.startsWith('drawings'))
    expect(drawn.length).toBeGreaterThan(0)
    for (const s of drawn) expect(s).toMatch(/^drawings, PDF page \d+$/)
  })
})
