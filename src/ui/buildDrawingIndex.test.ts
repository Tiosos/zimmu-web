import { describe, expect, it } from 'vitest'
import { buildDrawingSheets } from '../geom/drawing'
import { machiningProject } from '../scene/__fixtures__/machiningProject'
import { manufacturingParts } from '../scene/manufacturingPart'
import { buildMachiningSchedule } from '../scene/machiningSchedule'
import { buildDrawingIndex, buildDrawingIndexCsv } from './buildDrawingIndex'

const fixture = () => {
  const scene = machiningProject()
  return {
    scene,
    sheets: buildDrawingSheets(scene.parts, 'Test'),
    schedule: buildMachiningSchedule(
      manufacturingParts(scene.parts, scene.materials, scene.components),
    ),
  }
}
describe('packet drawing reference index', () => {
  it('locates all kinds by built page and logical schedule record, including hidden parts', () => {
    const { sheets, schedule } = fixture()
    const index = buildDrawingIndex(sheets, schedule)
    expect(index.counts).toEqual({
      partSheets: 2,
      operations: 8,
      referenced: 8,
      missing: 0,
      ambiguous: 0,
    })
    index.entries.forEach((entry, i) => {
      expect(entry.schedule).toMatchObject({ entryIndex: i, csvRecord: i + 2 })
      expect(
        entry.drawing.locations.every((location) => {
          const sheet = sheets[location.page - 1]
          return sheet.kind === 'part' && sheet.partId === entry.partId
        }),
      ).toBe(true)
    })
    expect(index.entries.find((e) => e.operationId === 'row')).toMatchObject({
      category: 'geometric-drilling',
      sourceJointId: 'screw-owner',
    })
    expect(
      index.entries.find((e) => e.category === 'manual-instruction')?.drawing.locations[0]
        .annotation,
    ).toBe('manual-instruction')
  })
  it('keeps grouped manual operations separately traceable to the same printed note', () => {
    const { scene } = fixture()
    const board = scene.parts[0]
    if (board.kind !== 'board') throw new Error('Expected board')
    board.operations!.push({
      ...structuredClone(board.operations![0]),
      id: 'second-manual',
      at: { x: 200, y: 0, z: 0 },
    })
    const sheets = buildDrawingSheets(scene.parts, 'Test')
    const schedule = buildMachiningSchedule(
      manufacturingParts(scene.parts, scene.materials, scene.components),
    )
    const manual = buildDrawingIndex(sheets, schedule).entries.filter(
      (e) => e.category === 'manual-instruction',
    )
    expect(manual).toHaveLength(2)
    expect(manual[0].operationId).not.toBe(manual[1].operationId)
    expect(manual[0].drawing.locations).toEqual(manual[1].drawing.locations)
    expect(manual[0].schedule.csvRecord).not.toBe(manual[1].schedule.csvRecord)
  })
  it('reports missing facts and duplicate identities without inventing annotations', () => {
    const { sheets, schedule } = fixture()
    const board = sheets.find((s) => s.kind === 'part' && s.shape === 'board')!
    if (board.kind !== 'part') throw new Error('Expected part')
    board.machiningNotes = []
    expect(
      buildDrawingIndex(sheets, schedule).entries.find((e) => e.operationId === 'row'),
    ).toMatchObject({ status: 'missing-from-drawings', drawing: { locations: [] } })
    schedule.entries.push(structuredClone(schedule.entries[0]))
    expect(buildDrawingIndex(sheets, schedule).entries[0].status).toBe('ambiguous')
    sheets.push(structuredClone(board))
    expect(
      buildDrawingIndex(sheets, schedule)
        .entries.filter((e) => e.partId === board.partId)
        .every((e) => e.status === 'ambiguous'),
    ).toBe(true)
  })
  it('does not merge equal operation IDs from different parts, and escapes CSV cells', () => {
    const { scene } = fixture()
    const twin = structuredClone(scene.parts[0])
    twin.id = 'twin'
    twin.label = 'Panel, "B"\ncontinued'
    scene.parts.push(twin)
    const schedule = buildMachiningSchedule(
      manufacturingParts(scene.parts, scene.materials, scene.components),
    )
    const index = buildDrawingIndex(buildDrawingSheets(scene.parts, 'Test'), schedule)
    const rows = index.entries.filter((e) => e.operationId === 'row')
    expect(rows).toHaveLength(2)
    expect(rows.every((e) => e.status === 'referenced')).toBe(true)
    expect(rows[0].drawing.locations[0].page).not.toBe(rows[1].drawing.locations[0].page)
    expect(buildDrawingIndexCsv(index)).toContain('"Panel, ""B""\ncontinued"')
    schedule.entries[0].part.label = 'Later'
    expect(index.entries[0].partLabel).not.toBe('Later')
  })
})
