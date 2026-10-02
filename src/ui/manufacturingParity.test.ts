import { describe, expect, it } from 'vitest'
import golden from '../scene/__fixtures__/manufacturingCsv.json'
import { manufacturingProject } from '../scene/__fixtures__/manufacturingProject'
import { manufacturingParts } from '../scene/manufacturingPart'
import {
  buildCsv,
  buildCsvFromRows,
  buildDowelCsv,
  buildDowelCsvFromRows,
  groupParts,
  groupPartsFromRecords,
  groupDowels,
  groupDowelsFromRecords,
  groupEdgeBand,
  groupEdgeBandFromRecords,
} from './buildCsv'

describe('manufacturing adapter output parity', () => {
  it('preserves the merged-main board and round-stock CSV bytes', () => {
    const scene = manufacturingProject()
    const records = manufacturingParts(scene.parts, scene.materials, scene.components)
    expect(buildCsv(scene.parts, scene.materials, scene.components)).toBe(golden.boards)
    expect(buildDowelCsv(scene.parts, scene.materials)).toBe(golden.roundStock)
    expect(
      buildCsvFromRows(
        groupPartsFromRecords(records, scene.materials),
        groupEdgeBandFromRecords(records, scene.materials),
      ),
    ).toBe(golden.boards)
    expect(buildDowelCsvFromRows(groupDowelsFromRecords(records, scene.materials))).toBe(
      golden.roundStock,
    )
  })
  it('keeps compatible grouping wrappers and can reprice unchanged records', () => {
    const scene = manufacturingProject()
    const records = manufacturingParts(scene.parts, scene.materials, scene.components)
    const signature = JSON.stringify(records)
    expect(groupPartsFromRecords(records, scene.materials)).toEqual(
      groupParts(scene.parts, scene.materials, scene.components),
    )
    expect(groupDowelsFromRecords(records, scene.materials)).toEqual(
      groupDowels(scene.parts, scene.materials),
    )
    expect(groupEdgeBandFromRecords(records, scene.materials)).toEqual(
      groupEdgeBand(scene.parts, scene.materials, scene.components),
    )
    const repriced = structuredClone(scene.materials)
    repriced['18mm Ply'].costPerM2 = 20
    repriced.Tape.costPerM = 6
    repriced.Oak.costPerM = 8
    const boards = groupPartsFromRecords(records, repriced)
    const old = groupPartsFromRecords(records, scene.materials)
    expect(boards.find((r) => r.material === '18mm Ply')!.totalCost).toBe(
      old.find((r) => r.material === '18mm Ply')!.totalCost! * 2,
    )
    expect(groupDowelsFromRecords(records, repriced)[0].totalCost).toBe(4)
    const newBands = groupEdgeBandFromRecords(records, repriced)
    const oldBands = groupEdgeBandFromRecords(records, scene.materials)
    expect(newBands).toHaveLength(1)
    expect(oldBands).toHaveLength(1)
    expect(newBands[0].cost).toBe(oldBands[0].cost! * 2)
    expect(JSON.stringify(records)).toBe(signature)
  })
})
