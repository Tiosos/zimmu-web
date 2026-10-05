import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFArray, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { createReadinessSnapshot } from '../scene/readinessSnapshot'
import { cabinet } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import { regenerateComponents } from '../scene/regenerateComponents'
import { buildReadinessPdf, readinessPdfFilename } from './buildReadinessPdf'
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
  it('prints captured drilling cut and source ownership alongside the stable part target', async () => {
    const scene = sceneOf()
    const part = scene.parts.find((p) => p.kind === 'board')!
    if (part.kind !== 'board') throw new Error('Expected board')
    part.cuts = [
      {
        kind: 'hole-array',
        id: 'drill-pdf',
        label: 'Pins',
        face: '+Z',
        axis: 'U',
        start: { x: 1, y: 30, z: part.thickness },
        pitch: 0,
        count: 1,
        diameter: 5,
        depth: part.thickness,
        sourceComponentId: 'source-pdf',
      },
    ]
    const snapshot = createReadinessSnapshot(scene, 'Drilling', date)
    const pending = buildReadinessPdf(snapshot)
    snapshot.manufacturing.findings.find((f) => f.operation)!.operation!.id = 'later-id'
    const { text } = await contents(await pending)
    expect(text).toContain('drilling-bounds')
    expect(text).toContain('cut: Pins [drill-pdf]')
    expect(text).toContain('source component: source-pdf')
    expect(text).toContain(part.id)
    expect(text).not.toContain('later-id')
    expect(text).toContain('Drilling intersections with other cuts')
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
