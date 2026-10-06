import type { DrawingSheet } from '../geom/drawing'
import type { MachiningSchedule } from '../scene/machiningSchedule'

export interface DrawingOperationLocation {
  page: number
  view: string | null
  annotation: 'cut-label' | 'note-label' | 'manual-instruction' | 'drilling-callout'
  index: number
}

// Index the built part sheets, not a predicted sort order or the scene's source cuts. Multiple
// projections are valid; duplicate part sheets or schedule identities must remain ambiguous.
export function buildDrawingIndex(sheets: DrawingSheet[], schedule: MachiningSchedule) {
  const parts = sheets.flatMap((sheet, index) =>
    sheet.kind === 'part'
      ? [{ partId: sheet.partId, label: sheet.partLabel, page: index + 1 }]
      : [],
  )
  const facts = new Map<string, DrawingOperationLocation[]>()
  const identity = (partId: string, operationId: string) => JSON.stringify([partId, operationId])
  const add = (partId: string, operationId: string, location: DrawingOperationLocation) => {
    const key = identity(partId, operationId)
    const own = facts.get(key) ?? []
    own.push(location)
    facts.set(key, own)
  }
  sheets.forEach((sheet, pageIndex) => {
    if (sheet.kind !== 'part') return
    const base = { page: pageIndex + 1 }
    sheet.views.forEach((view) => {
      view.cutLabels.forEach((label, index) => {
        if (label.operationId && (!('cuts' in view) || index < view.cuts.length))
          add(sheet.partId, label.operationId, {
            ...base,
            view: view.label,
            annotation: 'cut-label',
            index,
          })
      })
      view.noteLabels.forEach((label, index) => {
        if (label.operationId)
          add(sheet.partId, label.operationId, {
            ...base,
            view: view.label,
            annotation: 'note-label',
            index,
          })
      })
    })
    sheet.machiningNotes?.forEach((note, index) =>
      add(sheet.partId, note.operationId, {
        ...base,
        view: null,
        annotation: 'drilling-callout',
        index,
      }),
    )
    if (sheet.shape === 'board')
      sheet.manualNoteReferences?.forEach((reference) => {
        if (sheet.manufacturingNotes[reference.noteIndex] === undefined) return
        reference.operationIds.forEach((id) =>
          add(sheet.partId, id, {
            ...base,
            view: null,
            annotation: 'manual-instruction',
            index: reference.noteIndex,
          }),
        )
      })
  })
  const countsById = new Map<string, number>()
  schedule.entries.forEach((entry) => {
    const key = identity(entry.part.id, entry.operation.id)
    countsById.set(key, (countsById.get(key) ?? 0) + 1)
  })
  const entries = schedule.entries.map((entry, index) => {
    const locations = structuredClone(facts.get(identity(entry.part.id, entry.operation.id)) ?? [])
    const partPages = parts.filter((part) => part.partId === entry.part.id).map((part) => part.page)
    const duplicateAnnotations = locations.some((location, i) =>
      locations
        .slice(0, i)
        .some(
          (previous) =>
            previous.page === location.page &&
            previous.view === location.view &&
            previous.annotation === location.annotation,
        ),
    )
    const status =
      countsById.get(identity(entry.part.id, entry.operation.id))! > 1 ||
      partPages.length > 1 ||
      duplicateAnnotations
        ? ('ambiguous' as const)
        : locations.length
          ? ('referenced' as const)
          : ('missing-from-drawings' as const)
    return {
      partId: entry.part.id,
      partLabel: entry.part.label,
      operationId: entry.operation.id,
      operationLabel: entry.operation.label,
      category: entry.category,
      sourceComponentId: entry.sourceComponentId,
      sourceJointId: entry.sourceJointId,
      provenance: structuredClone(entry.part.provenance),
      status,
      schedule: {
        jsonPath: 'machining/schedule.json',
        entryIndex: index,
        csvPath: 'lists/machining.csv',
        csvRecord: index + 2,
      },
      drawing: { path: 'drawings/shop-drawings.pdf', partPages, locations },
    }
  })
  return {
    schemaVersion: 1 as const,
    scope:
      'All built part sheets and captured schedule entries, including hidden items. PDF pages are one-based; JSON entry indexes are zero-based; CSV records are one-based including the header, not physical lines. Multiple view annotations may refer to one operation. References locate printed definitions, not verified machining geometry or production approval.',
    parts,
    entries,
    counts: {
      partSheets: parts.length,
      operations: entries.length,
      referenced: entries.filter((e) => e.status === 'referenced').length,
      missing: entries.filter((e) => e.status === 'missing-from-drawings').length,
      ambiguous: entries.filter((e) => e.status === 'ambiguous').length,
    },
  }
}
export type DrawingIndex = ReturnType<typeof buildDrawingIndex>

export function buildDrawingIndexCsv(index: DrawingIndex): string {
  const cell = (value: string | number | null) => {
    const text = value === null ? '' : String(value)
    return /[,"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const rows = index.entries.map((entry) => [
    entry.partId,
    entry.partLabel,
    entry.operationId,
    entry.operationLabel,
    entry.category,
    entry.status,
    entry.sourceComponentId,
    entry.sourceJointId,
    entry.schedule.csvPath,
    entry.schedule.csvRecord,
    entry.schedule.jsonPath,
    entry.schedule.entryIndex,
    entry.drawing.path,
    [...new Set(entry.drawing.locations.map((l) => l.page))].join('; '),
    JSON.stringify(entry.drawing.locations),
  ])
  return (
    [
      [
        'Part ID',
        'Part',
        'Operation ID',
        'Operation',
        'Category',
        'Reference status',
        'Source component ID',
        'Source joint ID',
        'Schedule CSV',
        'CSV record (including header)',
        'Schedule JSON',
        'JSON entry index (zero-based)',
        'Drawing PDF',
        'PDF pages',
        'Annotations',
      ],
      ...rows,
    ]
      .map((row) => row.map(cell).join(','))
      .join('\r\n') + '\r\n'
  )
}
