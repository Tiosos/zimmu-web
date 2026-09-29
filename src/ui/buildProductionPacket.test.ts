import { describe, expect, it } from 'vitest'
import { unzipSync, strFromU8, strToU8 } from 'fflate'
import { PDFDocument } from 'pdf-lib'
import { cabinet } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import { regenerateComponents } from '../scene/regenerateComponents'
import type { CarcaseComponent, Scene } from '../scene/types'
import { buildCsv } from './buildCsv'
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
      'readiness/report.pdf',
    ])
    const manifest = JSON.parse(strFromU8(zip['manifest.json']))
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
})
