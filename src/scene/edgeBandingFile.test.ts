import { describe, expect, it } from 'vitest'
import { FILE_FORMAT_VERSION, parseFile } from './useFile'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import type { BoardPart, CarcaseParams, ComponentId, Scene } from './types'

const board = (edgeBanding?: BoardPart['edgeBanding']): BoardPart => ({
  kind: 'board',
  id: 'p1',
  label: 'Shelf',
  length: 600,
  width: 300,
  thickness: 18,
  grain: 'free',
  material: '',
  color: '#888',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
  parentId: null,
  driven: false,
  ...(edgeBanding ? { edgeBanding } : {}),
})

const scene = (part: BoardPart): Scene => ({
  parts: [part],
  materials: { ...PRESET_MATERIALS, 'ABS 1mm': { thickness: 1, use: 'edge' } },
  hardware: [],
  joints: [],
  components: [],
})

const envelopeFor = (s: Scene) => ({
  version: FILE_FORMAT_VERSION,
  name: 'Edge',
  appVersion: '0',
  units: 'mm',
  createdAt: '2026-09-30',
  updatedAt: '2026-09-30',
  camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
  scene: s,
  project: {
    id: 'project',
    areas: [
      {
        id: 'area',
        name: 'Area',
        rooms: [
          {
            id: 'room',
            name: 'Room',
            items: [{ id: 'item', name: 'Item', rootComponentIds: [], rootPartIds: ['p1'] }],
          },
        ],
      },
    ],
  },
})

const fileText = (s: Scene): string => JSON.stringify(envelopeFor(s))

describe('edge banding in the file', () => {
  it('reads a v24 edge-banded file without changing its edge data', () => {
    const source = envelopeFor(scene(board({ y0: 'ABS 1mm' })))
    const loaded = parseFile(JSON.stringify({ ...source, version: 24 }))
    const part = loaded.scene.parts[0]
    expect(part.kind === 'board' && part.edgeBanding).toEqual({ y0: 'ABS 1mm' })
  })

  it('round-trips explicit edges, an explicit none, and an edge material', () => {
    const loaded = parseFile(fileText(scene(board({ y0: 'ABS 1mm', x1: null }))))
    const part = loaded.scene.parts[0]
    expect(part.kind === 'board' && part.edgeBanding).toEqual({ y0: 'ABS 1mm', x1: null })
    expect(loaded.scene.materials['ABS 1mm']).toEqual({ thickness: 1, use: 'edge' })
  })

  it('rejects an unknown edge key', () => {
    const bad = board({ top: 'ABS 1mm' } as unknown as BoardPart['edgeBanding'])
    expect(() => parseFile(fileText(scene(bad)))).toThrow(/edge/)
  })

  it('rejects an edge naming a missing material or a panel material', () => {
    expect(() => parseFile(fileText(scene(board({ y0: 'Nope' }))))).toThrow(/edge-band material/)
    const panel = Object.keys(PRESET_MATERIALS)[0]
    expect(() => parseFile(fileText(scene(board({ y0: panel }))))).toThrow(/edge-band material/)
  })

  it('rejects a material use other than edge', () => {
    const s = scene(board())
    s.materials['ABS 1mm'] = { thickness: 1, use: 'trim' } as never
    expect(() => parseFile(fileText(s))).toThrow(/edge/)
  })
})

describe('a carcase edge material in the file', () => {
  const withEdge = (edgeMaterial: unknown): string => {
    const s: Scene = {
      ...scene(board()),
      parts: [],
      components: [
        {
          kind: 'carcase',
          id: 'cmp_1' as ComponentId,
          label: 'Base',
          parentId: null,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          rotationOrder: 'XYZ',
          visible: true,
          params: { ...CARCASE_PRESETS[0].params, edgeMaterial } as CarcaseParams,
        },
      ],
    }
    const env = envelopeFor(s)
    const item = env.project.areas[0].rooms[0].items[0] as { rootComponentIds: string[]; rootPartIds: string[] }
    item.rootComponentIds = ['cmp_1']
    item.rootPartIds = []
    return JSON.stringify(env)
  }
  const edgeOf = (text: string): string | undefined => {
    const c = parseFile(text).scene.components[0]
    return c.kind === 'carcase' ? c.params.edgeMaterial : 'not a carcase'
  }

  it('round-trips an edge material', () => {
    expect(edgeOf(withEdge('ABS 1mm'))).toBe('ABS 1mm')
  })

  it.each([['an empty name', ''], ['a name the project lacks', 'Ghost']])('accepts %s', (_l, name) => {
    expect(edgeOf(withEdge(name))).toBe(name)
  })

  it.each([['a number', 5], ['an object', { name: 'ABS 1mm' }]])('rejects %s', (_l, value) => {
    expect(() => parseFile(withEdge(value))).toThrow(/edgeMaterial/)
  })
})
