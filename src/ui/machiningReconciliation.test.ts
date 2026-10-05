import { describe, expect, it } from 'vitest'
import { machiningProject } from '../scene/__fixtures__/machiningProject'
import { manufacturingParts } from '../scene/manufacturingPart'
import { buildMachiningSchedule } from '../scene/machiningSchedule'
import { buildDrawingSheets } from '../geom/drawing'
import { reconcileMachiningScene, reconcileMachining } from './machiningReconciliation'

const fixture = () => {
  const scene = machiningProject()
  return {
    sheets: buildDrawingSheets(scene.parts, 'Test'),
    schedule: buildMachiningSchedule(
      manufacturingParts(scene.parts, scene.materials, scene.components),
    ),
  }
}
const boardOf = (sheets: ReturnType<typeof buildDrawingSheets>) => {
  const board = sheets.find((s) => s.kind === 'part' && s.shape === 'board')!
  if (board.kind !== 'part' || board.shape !== 'board') throw new Error('Expected board')
  return board
}
describe('machining / drawing reconciliation', () => {
  it('compares drilling and printed manual instructions, preserving through holes and scope limits', () => {
    const { sheets, schedule } = fixture()
    const result = reconcileMachining(sheets, schedule)
    expect(result).toMatchObject({ status: 'passed', compared: 8, findings: [] })
    expect(result.unassessed).toContain(
      'Geometric cut fields other than printed dimensions and angles',
    )
  })
  it('finds altered actual geometry and links both outputs with stable operation provenance', () => {
    const { sheets, schedule } = fixture()
    boardOf(sheets).views[0].circles[0].r += 1
    const result = reconcileMachining(sheets, schedule)
    expect(result.findings[0]).toMatchObject({
      kind: 'mismatch',
      operationId: 'row',
      field: 'projected hole 0',
      sourceJointId: 'screw-owner',
    })
    expect(result.findings[0].schedule.location).toContain('lists/machining.csv, row')
    expect(result.findings[0].drawing.location).toContain('PDF page')
    expect(
      reconcileMachining(sheets, { ...schedule, entries: [...schedule.entries].reverse() })
        .findings[0].reference,
    ).toBe(result.findings[0].reference)
  })
  it('detects missing rows, callouts, duplicate identities, changed depths and manual text', () => {
    const { sheets, schedule } = fixture()
    const board = boardOf(sheets)
    board.manufacturingNotes[0] = 'Wrong jig'
    board.machiningNotes![0].text = 'Wrong depth'
    let result = reconcileMachining(sheets, schedule)
    expect(result.findings.filter((f) => f.field === 'printed callout')).toHaveLength(2)
    const missing = {
      ...schedule,
      entries: schedule.entries.filter((e) => e.operation.id !== 'row'),
    }
    expect(
      reconcileMachining(sheets, missing).findings.some(
        (f) => f.kind === 'missing-from-schedule' && f.operationId === 'row',
      ),
    ).toBe(true)
    board.machiningNotes = []
    result = reconcileMachining(sheets, schedule)
    expect(
      result.findings.some((f) => f.kind === 'missing-from-drawings' && f.operationId === 'row'),
    ).toBe(true)
    const { sheets: clean, schedule: original } = fixture()
    original.entries.push(original.entries.find((e) => e.operation.id === 'row')!)
    expect(reconcileMachining(clean, original).findings.some((f) => f.kind === 'duplicate')).toBe(
      true,
    )
  })
  it('detects projected count, placement and through-mode changes', () => {
    for (const mutate of [
      (board: ReturnType<typeof boardOf>) => board.views[0].circles.pop(),
      (board: ReturnType<typeof boardOf>) => {
        board.views[0].circles[0].cx += 1
      },
      (board: ReturnType<typeof boardOf>) => {
        board.views[0].circles[0].dashed = true
      },
    ]) {
      const { sheets, schedule } = fixture()
      mutate(boardOf(sheets))
      expect(reconcileMachining(sheets, schedule).status).toBe('failed')
    }
  })
  it('reports absent part sheets and altered non-drilling dimensions', () => {
    const { sheets, schedule } = fixture()
    const board = boardOf(sheets)
    board.views[0].cutLabels[0].text = 'Wrong size'
    expect(
      reconcileMachining(sheets, schedule).findings.some(
        (f) => f.operationId === 'rebate' && f.kind === 'mismatch',
      ),
    ).toBe(true)
    const withoutBoard = sheets.filter((s) => s !== board)
    const missing = reconcileMachining(withoutBoard, schedule).findings.find(
      (f) => f.operationId === 'row',
    )!
    expect(missing.kind).toBe('missing-from-drawings')
    expect(missing.drawing.location).toContain('part manual-board absent')
  })
  it('compares nominal stock dimensions independently of projected scale', () => {
    const { sheets, schedule } = fixture()
    boardOf(sheets).board.thickness += 1
    expect(
      reconcileMachining(sheets, schedule).findings.some((f) => f.field === 'stock dimensions'),
    ).toBe(true)
  })
  it('keeps unsafe drawing generation unassessed', () => {
    const scene = machiningProject()
    const board = scene.parts[0]
    const holes = board.cuts.find((c) => c.kind === 'hole-array')!
    if (holes.kind !== 'hole-array') throw new Error('Expected holes')
    holes.count = 10001
    expect(reconcileMachiningScene(scene)).toMatchObject({ status: 'unassessed', compared: 0 })
  })
  it('uses checked-set locations without claiming exported PDF page numbers', () => {
    const { sheets, schedule } = fixture()
    boardOf(sheets).views[0].circles.pop()
    const finding = reconcileMachining(sheets, schedule, 'checked-set').findings[0]
    expect(finding.drawing.location).toContain('checked drawing set')
    expect(finding.drawing.location).not.toContain('PDF page')
  })
})
