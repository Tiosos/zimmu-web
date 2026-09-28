import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildShelfInstallationSheets, installationPoseIndices } from './shelfInstallation'
import { buildDrawingSheets, type CabinetSheetInput } from './drawing'
import { cabinet, partsOfCarcase } from './__fixtures__/cabinetSheet'
import { PRESET_MATERIALS, DEFAULT_FRAME } from '../scene/carcasePresets'
import { adjustableShelfAccessResults } from '../scene/carcaseParts'
import { roleThicknessFor } from '../scene/resolveThickness'
import { buildSvg } from '../ui/buildSvg'
import { buildDxf } from '../ui/buildDxf'
import { buildPdf } from '../ui/buildPdf'
import { sheetFilename } from '../ui/sheetFilename'
import type { CarcaseParams } from '../scene/types'

export function installationInput(params: CarcaseParams = cabinet.params): CabinetSheetInput {
  const c = { ...cabinet, params }
  return {
    cabinet: c,
    parts: partsOfCarcase(params),
    materials: PRESET_MATERIALS,
    byId: new Map([[c.id, c]]),
  }
}

describe('shelf installation sheets', () => {
  it('honours shelf thickness overrides and keeps the guidance cabinet-local after placement changes', () => {
    const input = installationInput()
    const shelf = input.parts.find((p) => p.role?.startsWith('adj-shelf-'))!
    if (shelf.kind !== 'board') throw new Error('expected shelf')
    shelf.overrides = { thickness: 25 }
    const [sheet] = buildShelfInstallationSheets(input, '2026-09-28')
    expect(sheet.texts.some((t) => t.text.includes('thickness 25.0 mm'))).toBe(true)
    input.cabinet.position = { x: 350, y: 600, z: 50 }
    input.cabinet.rotation = { x: 0, y: 0, z: 90 }
    expect(buildShelfInstallationSheets(input, '2026-09-28')[0].lines).toEqual(sheet.lines)
  })

  it('uses exact witnessed poses, ordered start to installed, without changing manufactured parts', () => {
    const input = installationInput()
    const before = JSON.stringify(input.parts)
    const result = adjustableShelfAccessResults(
      input.cabinet.params,
      roleThicknessFor(input.cabinet.params, input.materials, new Map()),
    )[0]
    const [sheet] = buildShelfInstallationSheets(input, '2026-09-28')
    expect(sheet.status).toBe('straight')
    expect(sheet.poseIndices).toEqual(installationPoseIndices(result))
    expect(sheet.poseIndices[0]).toBe(0)
    expect(sheet.poseIndices.at(-1)).toBe(result.path!.poses.length - 1)
    expect(sheet.poseIndices).toHaveLength(3)
    expect(sheet.texts.some((t) => t.text.includes('full motion in the 3D'))).toBe(true)
    expect(JSON.stringify(input.parts)).toBe(before)
  })

  it('shows an interior rotation snapshot for a shelf behind a pair stile', () => {
    const params: CarcaseParams = {
      ...cabinet.params,
      frame: { ...DEFAULT_FRAME, pairStile: true },
      section: { ...cabinet.params.section, front: { kind: 'door', leaves: 2, hinge: 'left' } },
    }
    const [sheet] = buildShelfInstallationSheets(installationInput(params), '2026-09-28')
    expect(sheet.status).toBe('rotated')
    expect(sheet.poseIndices).toHaveLength(4)
    expect(sheet.texts.some((t) => t.text.includes('Reorient inside'))).toBe(true)
  })

  it('includes a warning sheet even when the requested shelf is declined and absent from the parts', () => {
    const params = {
      ...cabinet.params,
      height: 300,
      frame: { ...DEFAULT_FRAME, pairStile: true },
      section: {
        ...cabinet.params.section,
        front: { kind: 'door' as const, leaves: 2 as const, hinge: 'left' as const },
      },
    }
    const input = installationInput(params)
    const [sheet] = buildShelfInstallationSheets(input, '2026-09-28')
    expect(sheet.status).toBe('unverified')
    expect(sheet.poseIndices).toEqual([])
    expect(input.parts.some((p) => p.role === sheet.shelfRole)).toBe(false)
    expect(sheet.texts.some((t) => t.text.includes('DO NOT MANUFACTURE'))).toBe(true)
    expect(sheet.texts.some((t) => t.text.includes('Installed position'))).toBe(false)
  })

  it('uses one page-coordinate model in SVG, DXF and existing PDF export, with all content inside A4', async () => {
    const [sheet] = buildShelfInstallationSheets(installationInput(), '2026-09-28')
    for (const line of sheet.lines)
      for (const point of [line.a, line.b]) {
        expect(point.x).toBeGreaterThanOrEqual(15)
        expect(point.x).toBeLessThanOrEqual(282)
        expect(point.y).toBeGreaterThanOrEqual(50)
        expect(point.y).toBeLessThan(171)
      }
    const svg = buildSvg(sheet),
      dxf = buildDxf(sheet)
    for (const text of sheet.texts) {
      expect(svg).toContain(text.text)
      expect(dxf).toContain(text.text)
      expect(text.y).toBeLessThanOrEqual(195)
      expect(text.size).toBeGreaterThanOrEqual(2)
    }
    const line = sheet.lines[0]
    expect(svg).toContain(`x1="${line.a.x.toFixed(3)}"`)
    expect(dxf).toContain(`20\n${(210 - line.a.y).toFixed(3)}`)
    expect((await PDFDocument.load(await buildPdf([sheet]))).getPageCount()).toBe(1)
  })

  it('refreshes after dimension changes, escapes labels and gives cabinets distinct export names', () => {
    const first = installationInput()
    first.cabinet.label = 'Kitchen <A&B>'
    const [a] = buildShelfInstallationSheets(first, '2026-09-28')
    const changed = installationInput({ ...cabinet.params, depth: 610 })
    changed.cabinet.id = 'cmp_2'
    changed.cabinet.label = first.cabinet.label
    const [b] = buildShelfInstallationSheets(changed, '2026-09-28')
    expect(a.lines).not.toEqual(b.lines)
    expect(buildSvg(a)).toContain('Kitchen &lt;A&amp;B&gt;')
    expect(sheetFilename(a, 'Job', 'svg')).not.toBe(sheetFilename(b, 'Job', 'svg'))
    const deck = buildDrawingSheets(first.parts, 'Job', [first])
    expect(deck.filter((s) => s.kind === 'installation')).toHaveLength(1)
    expect(deck.filter((s) => s.kind === 'part')).toHaveLength(first.parts.length)
  })
})
