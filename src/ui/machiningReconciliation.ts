import { buildDrawingSheets, type DrawingSheet } from '../geom/drawing'
import { drillingCallout } from '../geom/drillingCallout'
import { faceAxes } from '../scene/snapMath'
import { manufacturingParts } from '../scene/manufacturingPart'
import { buildMachiningSchedule, type MachiningSchedule } from '../scene/machiningSchedule'
import { effectiveMaterialsOf } from '../scene/effectiveMaterials'
import type { MaterialDef, Scene } from '../scene/types'

export interface MachiningFinding {
  reference: string
  kind: 'missing-from-drawings' | 'missing-from-schedule' | 'duplicate' | 'mismatch'
  partId: string
  operationId: string
  field: string
  schedule: { location: string; value: unknown }
  drawing: { location: string; value: unknown }
  sourceComponentId: string | null
  sourceJointId: string | null
}

const rowCategoryIsCut = (rows: { entry: MachiningSchedule['entries'][number] }[]) =>
  !rows.length || rows[0].entry.category === 'geometric-cut'

export function reconcileMachining(
  sheets: DrawingSheet[],
  schedule: MachiningSchedule,
  locate: 'pdf-page' | 'checked-set' = 'pdf-page',
) {
  const findings: MachiningFinding[] = []
  let compared = 0
  const unassessed = new Set([
    'Geometric cut fields other than printed dimensions and angles',
    'Manual instruction geometry and fields not printed in shop notes',
    'Dowel bore projections, cut interactions and machine readiness',
    'Rendered file fidelity and callout layout',
  ])
  const rows = schedule.entries.map((entry, i) => ({ entry, row: i + 2 }))
  const parts = sheets.flatMap((sheet, i) =>
    sheet.kind === 'part' ? [{ sheet, page: i + 1 }] : [],
  )
  const key = (part: string, operation: string) => JSON.stringify([part, operation])
  const identities = new Set([
    ...rows.map(({ entry }) => key(entry.part.id, entry.operation.id)),
    ...parts.flatMap(({ sheet }) => [
      ...sheet.views.flatMap((v) =>
        [...v.cutLabels, ...v.noteLabels].flatMap((n) =>
          n.operationId ? [key(sheet.partId, n.operationId)] : [],
        ),
      ),
      ...(sheet.machiningNotes ?? []).map((n) => key(sheet.partId, n.operationId)),
      ...(sheet.manualNoteReferences ?? []).flatMap((n) =>
        n.operationIds.map((id) => key(sheet.partId, id)),
      ),
    ]),
  ])
  for (const identity of [...identities].sort()) {
    const [partId, operationId] = JSON.parse(identity) as [string, string]
    const ownRows = rows.filter(
      ({ entry }) => entry.part.id === partId && entry.operation.id === operationId,
    )
    const ownSheets = parts.filter(({ sheet }) => sheet.partId === partId)
    const refs = ownSheets.flatMap(({ sheet, page }) => [
      ...(!sheet.machiningNotes?.some((n) => n.operationId === operationId) &&
      rowCategoryIsCut(ownRows)
        ? sheet.views.flatMap((v) =>
            [...v.cutLabels, ...v.noteLabels]
              .filter((n) => n.operationId === operationId)
              .map((n) => ({ sheet, page, text: n.text, projection: v.label })),
          )
        : []),
      ...(sheet.machiningNotes ?? [])
        .filter((n) => n.operationId === operationId)
        .map((n) => ({ sheet, page, text: n.text })),
      ...(sheet.manualNoteReferences ?? []).flatMap((n) =>
        n.operationIds
          .filter((id) => id === operationId)
          .map(() => ({
            sheet,
            page,
            text: sheet.shape === 'board' ? sheet.manufacturingNotes[n.noteIndex] : undefined,
            group: n.operationIds,
          })),
      ),
    ])
    const row = ownRows[0]
    const ref = refs[0]
    const drawingLocation = refs.length
      ? refs
          .map(
            (r) =>
              `drawings/shop-drawings.pdf, ${locate === 'pdf-page' ? 'PDF page' : 'sheet of checked drawing set'} ${r.page}`,
          )
          .join('; ')
      : ownSheets.length
        ? ownSheets
            .map(
              (r) =>
                `drawings/shop-drawings.pdf, ${locate === 'pdf-page' ? 'PDF page' : 'sheet of checked drawing set'} ${r.page}; operation absent`,
            )
            .join('; ')
        : `drawings/shop-drawings.pdf, part ${partId} absent`
    const add = (
      kind: MachiningFinding['kind'],
      field: string,
      expected: unknown,
      actual: unknown,
    ) => {
      findings.push({
        reference: `MR:${JSON.stringify([partId, operationId, kind, field])}`,
        kind,
        partId,
        operationId,
        field,
        schedule: {
          location: ownRows.length
            ? ownRows
                .map(
                  (r) =>
                    `lists/machining.csv, row ${r.row}; machining/schedule.json entries[${r.row - 2}]`,
                )
                .join('; ')
            : 'lists/machining.csv / machining/schedule.json, operation absent',
          value: expected ?? null,
        },
        drawing: { location: drawingLocation, value: actual ?? null },
        sourceComponentId: row?.entry.sourceComponentId ?? null,
        sourceJointId: row?.entry.sourceJointId ?? null,
      })
    }
    if (!row) {
      add('missing-from-schedule', 'operation', null, ref?.text)
      continue
    }
    if (!ref) {
      add('missing-from-drawings', 'operation', row.entry.operation, null)
      continue
    }
    if (
      ownRows.length !== 1 ||
      (row.entry.category !== 'geometric-cut' && refs.length !== 1) ||
      ownSheets.length !== 1
    ) {
      add('duplicate', 'identity', ownRows.length, refs.length)
      continue
    }
    const entry = row.entry
    const actualDimensions = ref.sheet.shape === 'board' ? ref.sheet.board : ref.sheet.dowel
    if (JSON.stringify(entry.part.dimensions) !== JSON.stringify(actualDimensions)) {
      // Property order is not an output fact.
      const expected = Object.entries(entry.part.dimensions).sort()
      const actual = Object.entries(actualDimensions).sort()
      if (JSON.stringify(expected) !== JSON.stringify(actual))
        add('mismatch', 'stock dimensions', entry.part.dimensions, actualDimensions)
    }
    if (
      entry.category === 'geometric-cut' &&
      new Set(refs.map((r) => ('projection' in r ? r.projection : 'note'))).size !== refs.length
    ) {
      add('duplicate', 'drawing operation', 1, refs.length)
      continue
    }
    if (entry.category === 'geometric-cut') {
      compared++
      const op = entry.operation
      for (const fact of refs) {
        let expected: string
        if (op.kind === 'box' && 'projection' in fact) {
          const axes =
            fact.projection === 'Face'
              ? ({ u: 'x', v: 'y' } as const)
              : fact.projection === 'Edge'
                ? ({ u: 'x', v: 'z' } as const)
                : ({ u: 'y', v: 'z' } as const)
          expected = `${op.size[axes.u]}×${op.size[axes.v]}mm`
        } else if (op.kind === 'mitre') expected = `${op.angle}°`
        else if (op.kind === 'end') expected = op.angle > 0 ? `${op.angle}°` : `${op.offset}mm`
        else if (op.kind === 'notch') expected = `${op.width}×${op.depth} az${op.azimuth}°`
        else {
          add('mismatch', 'category', entry.category, fact.text)
          continue
        }
        if (expected !== fact.text)
          add(
            'mismatch',
            `printed dimensions ${'projection' in fact ? fact.projection : ''}`,
            expected,
            fact.text,
          )
      }
      continue
    }
    if (entry.category === 'geometric-drilling' && entry.depthMode === 'unassessed') {
      unassessed.add(`Invalid drilling definition: ${partId}/${operationId}`)
      continue
    }
    compared++
    let expected: string
    if (entry.category === 'manual-instruction') {
      const group = 'group' in ref ? ref.group : undefined
      const operations = (group ?? []).map(
        (id) =>
          rows.find((r) => r.entry.part.id === partId && r.entry.operation.id === id)?.entry
            .operation,
      )
      if (!operations.length || operations.some((op) => op?.kind !== 'manual-machining')) {
        add('mismatch', 'category', entry.category, ref.text)
        continue
      }
      const manual = operations.filter((op) => op?.kind === 'manual-machining')
      const first = manual[0]
      expected = `${first.template} — ${manual.length} position${manual.length === 1 ? '' : 's'} at ${manual.map((op) => Math.round(op.at.x * 10) / 10).join(', ')} mm: ${first.instruction}`
      if (
        manual.some((op) => op.template !== first.template || op.instruction !== first.instruction)
      )
        add('mismatch', 'manual grouping', entry.operation, ref.text)
    } else expected = drillingCallout(entry.operation)
    if (expected !== ref.text) add('mismatch', 'printed callout', expected, ref.text)
    if (entry.category !== 'geometric-drilling' || entry.operation.kind !== 'hole-array') continue
    const op = entry.operation
    if (ref.sheet.shape !== 'board') {
      add('mismatch', 'part shape', 'board', ref.sheet.shape)
      continue
    }
    const axes = faceAxes(op.face)
    const dims = ref.sheet.board
    const extents = { x: dims.length, y: dims.width, z: dims.thickness }
    const viewLabel = axes.depth === 'z' ? 'Face' : axes.depth === 'y' ? 'Edge' : 'End'
    const view = ref.sheet.views.find((v) => v.label === viewLabel)!
    const scale = view.boardRect.w / extents[axes.u]
    const circles = ref.sheet.views.flatMap((v) =>
      v.circles.filter((c) => c.operationId === operationId).map((c) => ({ ...c, view: v.label })),
    )
    if (circles.length !== op.count)
      add('mismatch', 'projected hole count', op.count, circles.length)
    for (let i = 0; i < Math.min(op.count, circles.length); i++) {
      const circle = circles.find((c) => c.holeIndex === i)
      const u = op.start[axes.u] + (op.axis === 'U' ? op.pitch * i : 0)
      const v = op.start[axes.v] + (op.axis === 'V' ? op.pitch * i : 0)
      const expectedCircle = {
        cx: u * scale,
        cy: (viewLabel === 'Face' ? v : extents[axes.v] - v) * scale,
        r: (op.diameter / 2) * scale,
        dashed: entry.depthMode === 'blind',
        view: viewLabel,
      }
      if (
        !circle ||
        circle.view !== expectedCircle.view ||
        circle.dashed !== expectedCircle.dashed ||
        !(['cx', 'cy', 'r'] as const).every(
          (field) =>
            Number.isFinite(circle[field]) &&
            Math.abs(circle[field] - expectedCircle[field]) < 1e-6,
        )
      )
        add('mismatch', `projected hole ${i}`, expectedCircle, circle)
    }
  }
  return {
    schemaVersion: 1,
    status: findings.length
      ? ('failed' as const)
      : compared
        ? ('passed' as const)
        : ('unassessed' as const),
    compared,
    totalFindings: findings.length,
    findings,
    unassessed: [...unassessed].sort(),
  }
}

export function reconcileMachiningScene(
  scene: Scene,
  materialLibrary: Record<string, MaterialDef> = {},
) {
  const materials = effectiveMaterialsOf(materialLibrary, scene.materials)
  let holes = 0
  for (const part of scene.parts)
    for (const cut of part.cuts) {
      if (cut.kind !== 'hole-array') continue
      if (!Number.isSafeInteger(cut.count) || cut.count < 0 || (holes += cut.count) > 10_000) {
        return {
          schemaVersion: 1,
          status: 'unassessed' as const,
          compared: 0,
          totalFindings: 0,
          findings: [] as MachiningFinding[],
          unassessed: [
            'Drawing reconciliation skipped: invalid hole count or more than 10,000 projected holes',
          ],
        }
      }
    }
  return reconcileMachining(
    buildDrawingSheets(scene.parts, 'Readiness'),
    buildMachiningSchedule(manufacturingParts(scene.parts, materials, scene.components)),
    'checked-set',
  )
}
