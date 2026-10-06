import type { CutLabel, DrawingSheet } from './drawing'

export function referencedCutLabel(label: CutLabel): string {
  return label.operationId ? `[${label.operationId}] ${label.text}` : label.text
}

export function referencedShopNotes(sheet: Extract<DrawingSheet, { kind: 'part' }>): string[] {
  const notes =
    sheet.shape === 'board'
      ? sheet.manufacturingNotes.map((text, index) => {
          const ids = (sheet.manualNoteReferences ?? [])
            .filter((reference) => reference.noteIndex === index)
            .flatMap((reference) => reference.operationIds)
          return ids.length ? `Manual instruction [${ids.join(', ')}]: ${text}` : text
        })
      : []
  return [
    ...notes,
    ...(sheet.machiningNotes ?? []).map((note) => {
      const prefix = `[${note.operationId}] `
      return `Drilling [${note.operationId}]: ${note.text.startsWith(prefix) ? note.text.slice(prefix.length) : note.text}`
    }),
  ]
}

// A4 drawing width and existing 15 mm margins. Fit the complete ID, never shorten its identity.
export function fitReferenceLabel(centerX: number, width: number, fontSize = 2.5) {
  const ratio = width > 267 ? 267 / width : 1
  const fittedWidth = width * ratio
  return {
    centerX: Math.max(15 + fittedWidth / 2, Math.min(282 - fittedWidth / 2, centerX)),
    fontSize: fontSize * ratio,
  }
}
