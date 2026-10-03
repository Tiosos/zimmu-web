import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFArray, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { createReadinessSnapshot } from '../scene/readinessSnapshot'
import { cabinet } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import { regenerateComponents } from '../scene/regenerateComponents'
import { buildReadinessPdf, readinessPdfFilename } from './buildReadinessPdf'
import { manufacturingProject } from '../scene/__fixtures__/manufacturingProject'
import type { Scene } from '../scene/types'

const sceneOf = (): Scene =>
  regenerateComponents({
    components: [cabinet],
    parts: [],
    joints: [],
    hardware: [],
    materials: PRESET_MATERIALS,
  })
const date = new Date('2026-09-29T00:00:00Z')
async function contents(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  const operators = doc
    .getPages()
    .map((page) => {
      const refs = page.node.lookup(PDFName.of('Contents'), PDFArray)
      return Array.from({ length: refs.size() }, (_, i) => {
        const stream = refs.lookup(i, PDFRawStream)
        return new TextDecoder().decode(decodePDFRawStream(stream).decode())
      }).join('\n')
    })
    .join('\n')
  const text = [...operators.matchAll(/<([0-9A-F]+)> Tj/g)]
    .map((m) =>
      m[1]
        .match(/../g)!
        .map((n) => String.fromCharCode(parseInt(n, 16)))
        .join(''),
    )
    .join('\n')
  return { doc, text }
}

describe('readiness PDF', () => {
  it('captures full manual setup text and parameters without turning instructions into geometry', async () => {
    const scene = manufacturingProject()
    const snapshot = createReadinessSnapshot(scene, 'Manual setup', date)
    const pending = buildReadinessPdf(snapshot)
    const f = snapshot.machining.findings.find((f) => f.instruction?.id === 'manual-instruction')!
    f.instruction!.instruction = 'Later text'
    const { text } = await contents(await pending)
    expect(text).toContain('manual-instruction')
    expect(text).toContain('Confirm jig setup before machining')
    expect(text).toContain('Synthetic jig')
    expect(text).toContain('Manual setup: face +Z; at (20, 30, 18) mm')
    expect(text).toContain('hinge-overlay')
    expect(text).not.toContain('Later text')
  })

  it('exports every drilling finding and captures operation IDs and manual text before awaiting', async () => {
    const snapshot = createReadinessSnapshot(sceneOf(), 'Drilling', date)
    snapshot.machining.findings = Array.from({ length: 205 }, (_, i) => ({
      reference: `D${i + 1}`,
      code: 'drilling-bounds',
      message: 'Hole footprint crosses board',
      part: { id: `drill-part-${i}`, label: 'Panel', cabinetId: 'cab' },
      operation: {
        id: `drill-op-${i}`,
        label: 'Hole row',
        kind: 'hole-array',
        sourceJointId: 'joint-source',
      },
    }))
    const pending = buildReadinessPdf(snapshot)
    snapshot.machining.findings = []
    const { doc, text } = await contents(await pending)
    expect(doc.getPageCount()).toBeGreaterThan(5)
    expect(text).toContain('D205 | drilling-bounds')
    expect(text).toContain('drill-op-204')
    expect(text).toContain('Source joint: joint-source')
    expect(text).toContain('Machine operation compatibility')
  })

  it('exports all manufacturing findings and captures their targets before awaiting', async () => {
    const snapshot = createReadinessSnapshot(sceneOf(), 'Manufacturing', date)
    snapshot.manufacturing.findings = Array.from({ length: 205 }, (_, i) => ({
      reference: `M${i + 1}`,
      code: 'stock-unresolved',
      message: `Unresolved stock ${i}`,
      targets: [
        { id: `manufacturing-part-${i}`, label: 'Panel', cabinetId: 'owner', parentId: 'nested' },
      ],
    }))
    const pending = buildReadinessPdf(snapshot)
    snapshot.manufacturing.findings.length = 0
    const { doc, text } = await contents(await pending)
    expect(doc.getPageCount()).toBeGreaterThan(5)
    expect(text).toContain('M205 | stock-unresolved')
    expect(text).toContain('manufacturing-part-204')
    expect(text).toContain('Machine operation compatibility')
    expect(text).toContain('cabinet: owner')
  })

  it('captures one scene and retains IDs, unknown checks and separate installation references', async () => {
    const scene = sceneOf()
    const before = JSON.stringify(scene)
    const snapshot = createReadinessSnapshot(scene, 'Workshop A', date)
    expect(JSON.stringify(scene)).toBe(before)
    scene.parts.length = 0
    expect(snapshot.cabinets[0].generated).toBe(1)
    const { doc, text } = await contents(await buildReadinessPdf(snapshot))
    expect(doc.getTitle()).toContain('Workshop A')
    expect(text).toContain('Cabinet ID: cmp_1')
    expect(text).toContain('Installation sheet reference: cmp_1/adj-shelf-')
    expect(text).toContain('ADVISORY REPORT')
    expect(text).toContain('2026-09-29T00:00:00.000Z')
    expect(text).toContain('Page 1 of')
  })

  it('exports every returned finding with long labels across pages and snapshots before awaiting', async () => {
    const snapshot = createReadinessSnapshot(sceneOf(), 'Original', date)
    snapshot.production.findings = Array.from({ length: 205 }, (_, i) => ({
      reference: `F${i + 1}`,
      kind: 'unassessed',
      message: `Check ${i + 1}: ` + 'Long description '.repeat(30),
      cabinetIds: [],
      targets: [{ label: 'LongLabel'.repeat(30), selection: { kind: 'part', id: `p${i}` } }],
    }))
    const pending = buildReadinessPdf(snapshot)
    snapshot.projectName = 'Later edit'
    snapshot.production.findings = []
    const { doc, text } = await contents(await pending)
    expect(doc.getTitle()).toContain('Original')
    expect(doc.getPageCount()).toBeGreaterThan(10)
    expect(text).toContain('F205 | NOT ASSESSED')
    expect(text).toContain('(continued)')
    expect(text).toContain('p204')
    doc.getPages().forEach((p) => {
      expect(p.getWidth()).toBeCloseTo(595.28)
      expect(p.getHeight()).toBeCloseTo(841.89)
    })
  })

  it('preserves unsupported characters explicitly and handles empty reports and safe filenames', async () => {
    const scene = sceneOf()
    scene.components = []
    scene.parts = []
    scene.joints = []
    const { text } = await contents(
      await buildReadinessPdf(createReadinessSnapshot(scene, '木棉 🪵', date)),
    )
    expect(text).toContain('[U+6728]')
    expect(text).toContain('Text encoding note')
    expect(text).toContain('No cabinets to assess')
    expect(readinessPdfFilename('../A:B/Workshop')).not.toMatch(/[/:]/)
  })

  it('retains unknown totals and associates findings to their cabinet', async () => {
    const scene = sceneOf()
    scene.parts = scene.parts.filter((p) => p.role !== 'bottom')
    const snapshot = createReadinessSnapshot(scene, 'Missing parts', date)
    expect(
      snapshot.production.findings.find((f) => f.message.includes('(bottom)'))?.cabinetIds,
    ).toEqual([cabinet.id])
    snapshot.cabinets[0].missing = null
    snapshot.cabinets[0].issues = ['Assessment skipped for this test']
    const { text } = await contents(await buildReadinessPdf(snapshot))
    expect(text).toContain('unknown missing')
    expect(text).toContain('Assessment skipped for this test')
    expect(text).toContain('Missing generated part: Bottom')
  })
})
