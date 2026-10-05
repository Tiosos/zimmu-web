import { describe, expect, it } from 'vitest'
import { buildMachiningCsv } from './buildMachiningCsv'
import { buildMachiningSchedule } from '../scene/machiningSchedule'
import { manufacturingParts } from '../scene/manufacturingPart'
import { machiningProject } from '../scene/__fixtures__/machiningProject'
import type { BoardPart } from '../scene/types'

describe('machining schedule CSV', () => {
  it('retains identities, separate manual instructions and complete escaped definitions', () => {
    const scene = machiningProject()
    const p = scene.parts[0] as BoardPart
    p.label = 'Panel, "A"'
    p.operations![0].instruction = 'Use "jig", check setup\nSecond line'
    const schedule = buildMachiningSchedule(
      manufacturingParts(scene.parts, scene.materials, scene.components),
    )
    const csv = buildMachiningCsv(schedule)
    expect(csv).toContain('Diameter (mm),Depth (mm),Count,Pitch (mm),Depth mode')
    expect(csv).toContain('manual-board,"Panel, ""A"""')
    expect(csv).toContain(
      'geometric-drilling,row,Clearance row,hole-array,,screw-owner,5,18,3,32,through',
    )
    expect(csv).toContain(
      'manual-instruction,manual-instruction,Synthetic jig instruction,manual-machining,jig-owner,,2,,2,20,unassessed',
    )
    expect(csv).toContain('"Use ""jig"", check setup\nSecond line"')
    expect(csv).toContain('""start"":{""x"":40,""y"":32,""z"":18}')
  })
  it('keeps unresolved numeric data explicit and writes a header for an empty schedule', () => {
    const scene = machiningProject()
    const p = scene.parts[0] as BoardPart
    p.operations![0].angle = NaN
    const schedule = buildMachiningSchedule(
      manufacturingParts(scene.parts, scene.materials, scene.components),
    )
    expect(buildMachiningCsv(schedule)).toContain('""angle"":""NaN""')
    const csv = buildMachiningCsv(buildMachiningSchedule([]))
    expect(csv.trim().split('\n')).toHaveLength(1)
    expect(csv).toContain('Part ID,Part,Material')
  })
})
