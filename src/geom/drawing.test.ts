import { describe, it, expect } from 'vitest'
import { buildDrawingSheets } from './drawing'
import type { Part } from '../scene/types'

function makeBoard(overrides: Partial<Part> = {}): Part {
  return {
    kind: 'board',
    id: 'p1',
    label: 'Shelf',
    length: 800,
    width: 300,
    thickness: 18,
    material: 'Plywood',
    color: '#d4a373',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    ...overrides,
  }
}

describe('buildDrawingSheets', () => {
  it('returns 2 sheets for a single board (cover + 1 part)', () => {
    const sheets = buildDrawingSheets([makeBoard()], 'My Project')
    expect(sheets).toHaveLength(2)
    expect(sheets[0].kind).toBe('cover')
    expect(sheets[1].kind).toBe('part')
  })

  it('part sheet has Face/Edge/End views with board rects matching L×W, L×T, W×T', () => {
    const sheets = buildDrawingSheets([makeBoard({ length: 400, width: 200, thickness: 18 })], 'P')
    const sheet = sheets[1]
    if (sheet.kind !== 'part') throw new Error('expected part')
    // scale 1:5 → factor 0.2
    const s = 0.2
    const [face, edge, end] = sheet.views
    expect(face.label).toBe('Face')
    expect(face.boardRect.w).toBeCloseTo(400 * s, 3)
    expect(face.boardRect.h).toBeCloseTo(200 * s, 3)
    expect(edge.label).toBe('Edge')
    expect(edge.boardRect.w).toBeCloseTo(400 * s, 3)
    expect(edge.boardRect.h).toBeCloseTo(18 * s, 3)
    expect(end.label).toBe('End')
    expect(end.boardRect.w).toBeCloseTo(200 * s, 3)
    expect(end.boardRect.h).toBeCloseTo(18 * s, 3)
  })

  it('cut on +Z face appears only in Face view', () => {
    const cut = {
      id: 'c1',
      label: 'Dado',
      face: '+Z' as const,
      position: { x: 100, y: 150, z: 18 },
      size: { x: 20, y: 300, z: 6 },
    }
    const sheets = buildDrawingSheets([makeBoard({ cuts: [cut] })], 'P')
    const sheet = sheets[1]
    if (sheet.kind !== 'part') throw new Error('expected part')
    const [face, edge, end] = sheet.views
    expect(face.cuts).toHaveLength(1)
    expect(edge.cuts).toHaveLength(0)
    expect(end.cuts).toHaveLength(0)
  })

  it('cut on +Y face appears only in Edge view', () => {
    const cut = {
      id: 'c1',
      label: 'Groove',
      face: '+Y' as const,
      position: { x: 400, y: 300, z: 9 },
      size: { x: 20, y: 10, z: 6 },
    }
    const sheets = buildDrawingSheets([makeBoard({ cuts: [cut] })], 'P')
    const sheet = sheets[1]
    if (sheet.kind !== 'part') throw new Error('expected part')
    const [face, edge, end] = sheet.views
    expect(face.cuts).toHaveLength(0)
    expect(edge.cuts).toHaveLength(1)
    expect(end.cuts).toHaveLength(0)
  })

  it('cut on +X face appears only in End view', () => {
    const cut = {
      id: 'c1',
      label: 'Tenon',
      face: '+X' as const,
      position: { x: 800, y: 150, z: 9 },
      size: { x: 10, y: 20, z: 6 },
    }
    const sheets = buildDrawingSheets([makeBoard({ cuts: [cut] })], 'P')
    const sheet = sheets[1]
    if (sheet.kind !== 'part') throw new Error('expected part')
    const [face, edge, end] = sheet.views
    expect(face.cuts).toHaveLength(0)
    expect(edge.cuts).toHaveLength(0)
    expect(end.cuts).toHaveLength(1)
  })

  it('selects scale 1:5 for a 400×200×18 board', () => {
    // raw = min((247-15)/(400+200), (135-15)/(200+18)) = min(0.387, 0.550) = 0.387 → 0.2
    const sheets = buildDrawingSheets([makeBoard({ length: 400, width: 200, thickness: 18 })], 'P')
    const sheet = sheets[1]
    if (sheet.kind !== 'part') throw new Error('expected part')
    expect(sheet.scaleLabel).toBe('1:5')
  })

  it('selects scale 1:10 for a 1200×600×20 board', () => {
    // raw = min((247-15)/1800, (135-15)/620) = min(0.129, 0.194) = 0.129 → 0.1
    const sheets = buildDrawingSheets([makeBoard({ length: 1200, width: 600, thickness: 20 })], 'P')
    const sheet = sheets[1]
    if (sheet.kind !== 'part') throw new Error('expected part')
    expect(sheet.scaleLabel).toBe('1:10')
  })

  it('cover sheet has correct rows for all parts', () => {
    const parts = [
      makeBoard({
        id: 'p1',
        label: 'Top',
        material: 'Oak',
        length: 800,
        width: 400,
        thickness: 18,
        cuts: [],
      }),
      makeBoard({
        id: 'p2',
        label: 'Side',
        material: 'Plywood',
        length: 600,
        width: 300,
        thickness: 12,
        cuts: [],
      }),
    ]
    const sheets = buildDrawingSheets(parts, 'Cabinet')
    const cover = sheets[0]
    if (cover.kind !== 'cover') throw new Error('expected cover')
    expect(cover.projectName).toBe('Cabinet')
    expect(cover.rows).toHaveLength(2)
    expect(cover.rows[0]).toMatchObject({ label: 'Top', material: 'Oak', length: 800 })
    expect(cover.rows[1]).toMatchObject({ label: 'Side', material: 'Plywood', length: 600 })
  })

  it('sheet count = 1 + part count', () => {
    const parts = [makeBoard({ id: 'p1' }), makeBoard({ id: 'p2' }), makeBoard({ id: 'p3' })]
    const sheets = buildDrawingSheets(parts, 'P')
    expect(sheets).toHaveLength(4)
  })
})
