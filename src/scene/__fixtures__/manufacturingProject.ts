import { CABINET_CATALOGUE } from '../catalogue'
import { PRESET_MATERIALS } from '../carcasePresets'
import { applyPipeline } from '../pipeline'
import type { BoardPart, CarcaseComponent, Scene, Section } from '../types'

function sectionIds(section: Section, prefix: string): Section {
  return {
    ...section,
    id: prefix,
    content:
      section.content.kind === 'split'
        ? {
            ...section.content,
            children: section.content.children.map((child, i) =>
              sectionIds(child, `${prefix}-${i}`),
            ),
          }
        : section.content,
  }
}
export function manufacturingProject(): Scene {
  const definitions = [...CABINET_CATALOGUE, CABINET_CATALOGUE[0]]
  const components: CarcaseComponent[] = definitions.map((definition, i) => {
    const params = structuredClone(definition.params)
    params.section = sectionIds(params.section, `section-${i}`)
    params.edgeMaterial = 'Tape'
    if (i === 3) params.width = 750
    return {
      kind: 'carcase',
      id: `cabinet-${i}`,
      label: i === 3 ? 'Overridden base' : definition.name,
      params,
      parentId: null,
      position: { x: i * 1000, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
      catalogue: {
        id: definition.catalogueId,
        version: definition.catalogueVersion,
        overrides: { edgeMaterial: 'Tape', ...(i === 3 ? { width: 750 } : {}) },
      },
    }
  })
  const board: BoardPart = {
    kind: 'board',
    id: 'manual-board',
    label: 'Manual panel',
    length: 560,
    width: 720,
    thickness: 18,
    grain: 'width',
    material: '18mm Ply',
    color: '#aabbcc',
    parentId: null,
    driven: false,
    visible: true,
    position: { x: 0, y: 1000, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    edgeBanding: { x0: 'Tape', y1: 'Tape' },
    cuts: [],
    operations: [
      {
        kind: 'manual-machining',
        id: 'manual-instruction',
        label: 'Synthetic jig instruction',
        hardwareKey: 'hinge-overlay',
        face: '+Z',
        at: { x: 20, y: 30, z: 18 },
        diameter: 2,
        pitch: 20,
        count: 2,
        angle: 15,
        edgeOffset: 10,
        template: 'Synthetic jig',
        instruction: 'Confirm jig setup before machining',
      },
    ],
  }
  return applyPipeline({
    components,
    parts: [
      board,
      {
        kind: 'cylinder',
        id: 'manual-round',
        label: 'Round stock',
        length: 500,
        diameter: 8,
        material: 'Oak',
        color: '#ccaa77',
        parentId: null,
        driven: false,
        visible: true,
        position: { x: 1000, y: 1000, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        rotationOrder: 'XYZ',
        cuts: [
          { kind: 'end', id: 'trim', label: 'Trim', end: '+Z', offset: 10, angle: 0, azimuth: 0 },
        ],
      },
    ],
    hardware: [],
    joints: [],
    materials: {
      ...structuredClone(PRESET_MATERIALS),
      '18mm Ply': {
        thickness: 18,
        hasGrain: true,
        sheet: { length: 2440, width: 1220 },
        costPerM2: 10,
      },
      '12mm MDF': { thickness: 12, hasGrain: false, costPerM2: 5 },
      Tape: { thickness: 2, use: 'edge', costPerM: 3 },
      Oak: { costPerM: 4 },
    },
  })
}
