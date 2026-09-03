import type { DrawingSheet } from '../geom/drawing'

// Lifted out of DrawingViewer so the cabinet editor's own export buttons name their files the same
// way. An assembly sheet has no partLabel, so it is named after its cabinet — and says so, because
// a cabinet's assembly sheet and a part sharing its label would otherwise collide.
export function sheetFilename(sheet: DrawingSheet, projectName: string, ext: string): string {
  const base =
    sheet.kind === 'cover'
      ? `${projectName}-cover`
      : sheet.kind === 'assembly'
        ? `${projectName}-${sheet.cabinetLabel}-assembly`
        : `${projectName}-${sheet.partLabel}`
  return base.toLowerCase().replace(/\s+/g, '-') + '.' + ext
}
