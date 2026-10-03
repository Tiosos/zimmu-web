import { describe, expect, it } from 'vitest'
import { unzipSync, strFromU8, strToU8 } from 'fflate'
import { PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { cabinet } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import { regenerateComponents } from '../scene/regenerateComponents'
import type { CarcaseComponent, Scene } from '../scene/types'
import { buildCsv, buildDowelCsv } from './buildCsv'
import { effectiveMaterialsOf } from '../scene/effectiveMaterials'
import { createReadinessSnapshot } from '../scene/readinessSnapshot'
import { reconcileScene } from './outputReconciliation'
import { buildProductionPacket, productionPacketFilename } from './buildProductionPacket'

const sceneOf = (): Scene =>
  regenerateComponents({
    components: [{ ...cabinet, visible: false }],
    parts: [],
    joints: [],
    hardware: [],
    materials: PRESET_MATERIALS,
  })
const capturedAt = new Date('2026-09-29T01:00:00Z')
const hash = async (bytes: Uint8Array) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')

describe('production handoff packet', () => {
  it('captures physical library stock and advisory findings from the same revision', async () => {
    const scene = structuredClone(sceneOf())
    const part = scene.parts[0]
    const definition = scene.materials[part.material]
    const name = 'Library stock'
    part.material = name
    const materialLibrary = { [name]: { ...definition, thickness: 90 } }
    const expected = createReadinessSnapshot(
      scene,
      'Captured',
      capturedAt,
      materialLibrary,
    ).manufacturing
    expect(expected.findings.some((f) => f.code === 'thickness-mismatch')).toBe(true)
    const pending = buildProductionPacket({
      scene,
      projectName: 'Captured',
      capturedAt,
      hardwareLibrary: {},
      materialLibrary,
    })
    materialLibrary[name].thickness = 18
    scene.parts.length = 0
    const files = unzipSync(await pending)
    expect(JSON.parse(strFromU8(files['readiness/manufacturing.json']))).toEqual(expected)
    const manifest = JSON.parse(strFromU8(files['manifest.json']))
    expect(manifest.counts.manufacturingFindings).toBe(expected.findings.length)
  })

  it('contains a matching manifest, full drawing deck, installation reference and all lists', async () => {
    const scene = sceneOf()
    const before = JSON.stringify(scene)
    const zip = unzipSync(
      await buildProductionPacket({
        scene,
        projectName: 'Workshop A',
        hardwareLibrary: {},
        materialLibrary: {},
        capturedAt,
      }),
    )
    expect(JSON.stringify(scene)).toBe(before)
    expect(Object.keys(zip).sort()).toEqual([
      'drawings/shop-drawings.pdf',
      'lists/boards.csv',
      'lists/dowels.csv',
      'lists/hardware.csv',
      'manifest.json',
      'readiness/manufacturing.json',
      'readiness/reconciliation.json',
      'readiness/report.pdf',
    ])
    const manifest = JSON.parse(strFromU8(zip['manifest.json']))
    const manufacturing = JSON.parse(strFromU8(zip['readiness/manufacturing.json']))
    expect(manufacturing).toEqual(
      createReadinessSnapshot(scene, 'Workshop A', capturedAt).manufacturing,
    )
    expect(manifest.counts.manufacturingFindings).toBe(manufacturing.findings.length)
    expect(manifest.manufacturing.checkedParts).toBe(scene.parts.length)
    expect(manifest.projectName).toBe('Workshop A')
    expect(manifest.capturedAt).toBe('2026-09-29T01:00:00.000Z')
    expect(manifest.sourceSha256).toBe(
      await hash(
        strToU8(
          JSON.stringify({
            scene,
            projectName: 'Workshop A',
            hardwareLibrary: {},
            materialLibrary: {},
          }),
        ),
      ),
    )
    expect(manifest.counts).toMatchObject({ cabinets: 1, installationSheets: 1 })
    expect(manifest.counts.drawingSheets).toBe(
      (await PDFDocument.load(zip['drawings/shop-drawings.pdf'])).getPageCount(),
    )
    expect((await PDFDocument.load(zip['readiness/report.pdf'])).getPageCount()).toBeGreaterThan(0)
    expect(strFromU8(zip['lists/boards.csv'])).toContain('Bottom')
    expect(strFromU8(zip['lists/hardware.csv'])).toContain('Qty')
    for (const entry of manifest.files) {
      expect(zip[entry.path].byteLength).toBe(entry.bytes)
      expect(await hash(zip[entry.path])).toBe(entry.sha256)
    }
  })

  it('freezes scene and prices before async work and reports skipped installation sheets', async () => {
    const scene = sceneOf()
    const library = { 'shelf-pin': { unitCost: 0.25, supplier: 'Original', partNumber: 'P1' } }
    const materialName = scene.parts.find((p) => p.material)?.material
    expect(materialName).toBeTruthy()
    const materialLibrary = { [materialName!]: { costPerM2: 25 } }
    const target = scene.components.find((c): c is CarcaseComponent => c.kind === 'carcase')!
    target.params = {
      ...cabinet.params,
      section: {
        ...cabinet.params.section,
        interior: {
          ...cabinet.params.section.interior!,
          adjustable: { ...cabinet.params.section.interior!.adjustable, shelves: 1001 },
        },
      },
    }
    const expectedBoards = buildCsv(
      scene.parts,
      { ...scene.materials, [materialName!]: { ...scene.materials[materialName!], costPerM2: 25 } },
      scene.components,
    )
    const pending = buildProductionPacket({
      scene,
      projectName: 'Original',
      hardwareLibrary: library,
      materialLibrary,
      capturedAt,
    })
    scene.parts.length = 0
    library['shelf-pin'].supplier = 'Changed'
    materialLibrary[materialName!].costPerM2 = 999
    const zip = unzipSync(await pending)
    const manifest = JSON.parse(strFromU8(zip['manifest.json']))
    expect(manifest.projectName).toBe('Original')
    expect(manifest.counts.parts).toBeGreaterThan(0)
    expect(manifest.counts.installationSheets).toBe(0)
    expect(strFromU8(zip['lists/boards.csv'])).toContain('Bottom')
    expect(strFromU8(zip['lists/boards.csv'])).toBe(expectedBoards)
    expect(strFromU8(zip['lists/boards.csv'])).not.toContain('999')
    expect(strFromU8(zip['lists/hardware.csv'])).not.toContain('Changed')
  })

  it('keeps unusual project names safe and produces a drawing PDF with Unicode labels', async () => {
    const scene = sceneOf()
    scene.components[0].label = '木棉 Cabinet'
    scene.parts.push({
      kind: 'cylinder',
      id: 'dowel_1',
      label: '木棉 Dowel',
      diameter: 8,
      length: 40,
      material: '',
      color: '#888',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      cuts: [],
      visible: false,
      parentId: null,
      driven: false,
    })
    const zip = unzipSync(
      await buildProductionPacket({
        scene,
        projectName: '木棉/Workshop',
        hardwareLibrary: {},
        materialLibrary: {},
        capturedAt,
      }),
    )
    expect(
      (await PDFDocument.load(zip['drawings/shop-drawings.pdf'])).getPageCount(),
    ).toBeGreaterThan(0)
    expect(strFromU8(zip['lists/dowels.csv'])).toContain('木棉 Dowel')
    expect(productionPacketFilename('../A:B/Workshop')).not.toMatch(/[/:]/)
  })

  it('prints the edge line on part sheets of a banded cabinet', async () => {
    const banded = sceneOf()
    const scene: Scene = regenerateComponents({
      ...banded,
      materials: { ...PRESET_MATERIALS, 'ABS 1mm': { thickness: 1, use: 'edge' } },
      components: banded.components.map((c) =>
        c.kind === 'carcase' ? { ...c, params: { ...c.params, edgeMaterial: 'ABS 1mm' } } : c,
      ),
    })
    const zip = unzipSync(
      await buildProductionPacket({
        scene,
        projectName: 'Workshop A',
        hardwareLibrary: {},
        materialLibrary: {},
        capturedAt,
      }),
    )
    const doc = await PDFDocument.load(zip['drawings/shop-drawings.pdf'])
    const hexOf = (text: string) =>
      [...text].map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    let found = false
    for (let i = 0; i < doc.getPageCount(); i++) {
      const contents = doc.getPage(i).node.get(PDFName.of('Contents'))
      if (!(contents instanceof PDFArray)) continue
      const stream = doc.context.lookup(contents.get(0))
      if (!(stream instanceof PDFRawStream)) continue
      const content = await new Response(
        new Blob([new Uint8Array(stream.contents)])
          .stream()
          .pipeThrough(new DecompressionStream('deflate')),
      ).text()
      if (content.toLowerCase().includes(hexOf('Edge 1'))) found = true
    }
    expect(found).toBe(true)
  })
})

describe('reconciliation in the packet', () => {
  const packetOf = async (scene: Scene) =>
    unzipSync(
      await buildProductionPacket({
        scene,
        projectName: 'Workshop A',
        hardwareLibrary: {},
        materialLibrary: {},
        capturedAt,
      }),
    )

  it('records the result in the manifest and writes it as a hashed file', async () => {
    const files = await packetOf(sceneOf())
    const manifest = JSON.parse(strFromU8(files['manifest.json']))
    expect(manifest.reconciliation).toMatchObject({ status: 'passed' })
    expect(manifest.reconciliation.compared).toBeGreaterThan(0)
    expect(manifest.reconciliation.unassessed.length).toBeGreaterThan(0)
    expect(manifest.files.map((f: { path: string }) => f.path)).toContain(
      'readiness/reconciliation.json',
    )
    const raw = strFromU8(files['readiness/reconciliation.json'])
    expect(raw.endsWith('}\n')).toBe(true)
    expect(raw).toContain('\n  "status"')
    expect(JSON.parse(raw).status).toBe(manifest.reconciliation.status)
    expect(manifest.scope).toContain('advisory and does not block any export')
  })

  it('records in the manifest whether the written findings were capped', async () => {
    const clean = JSON.parse(strFromU8((await packetOf(sceneOf()))['manifest.json']))
    expect(clean.reconciliation.truncated).toBe(false)

    const base = sceneOf()
    const twins = Array.from({ length: 101 }, (_, i) => ({ ...base.parts[0], id: `twin${i}` }))
    const capped = await packetOf({ ...base, parts: [...base.parts, ...twins, ...twins] })
    const manifest = JSON.parse(strFromU8(capped['manifest.json']))
    const written = JSON.parse(strFromU8(capped['readiness/reconciliation.json']))
    expect(written.truncated).toBe(true)
    expect(manifest.reconciliation.truncated).toBe(true)
  })

  it('writes the same CSV text the part-based serialisers produce', async () => {
    const scene = sceneOf()
    const files = await packetOf(scene)
    const merged = effectiveMaterialsOf({}, scene.materials)
    expect(strFromU8(files['lists/boards.csv'])).toBe(
      buildCsv(scene.parts, merged, scene.components),
    )
    expect(strFromU8(files['lists/dowels.csv'])).toBe(buildDowelCsv(scene.parts, merged))
  })

  it('still builds every export when the check fails', async () => {
    const base = sceneOf()
    const dup: Scene = { ...base, parts: [...base.parts, structuredClone(base.parts[0])] }
    const files = await packetOf(dup)
    expect(JSON.parse(strFromU8(files['manifest.json'])).reconciliation.status).toBe('failed')
    for (const path of [
      'readiness/report.pdf',
      'drawings/shop-drawings.pdf',
      'lists/boards.csv',
      'lists/dowels.csv',
      'lists/hardware.csv',
    ])
      expect(files[path].byteLength).toBeGreaterThan(0)
  })

  it('reconciles the rows it wrote, including a banded cabinet whose edges only its own rows carry', async () => {
    const base = sceneOf()
    const materials = { ...PRESET_MATERIALS, 'ABS 1mm': { thickness: 1, use: 'edge' as const } }
    const scene: Scene = regenerateComponents({
      ...base,
      materials,
      components: base.components.map((c) =>
        c.kind === 'carcase' ? { ...c, params: { ...c.params, edgeMaterial: 'ABS 1mm' } } : c,
      ),
    })
    const files = await packetOf(scene)
    expect(JSON.parse(strFromU8(files['readiness/reconciliation.json']))).toMatchObject({
      status: 'passed',
    })
    expect(strFromU8(files['lists/boards.csv'])).toContain('ABS 1mm')
  })

  it('gives the packet and the panel helper the same verdict for one scene', async () => {
    const scene = sceneOf()
    const files = await packetOf(scene)
    const packet = JSON.parse(strFromU8(files['readiness/reconciliation.json']))
    const panel = reconcileScene(scene, {})
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
    expect(shape(packet)).toEqual(shape(panel))
  })
})
