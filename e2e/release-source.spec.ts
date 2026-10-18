import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { readyAssessment } from '../src/scene/__fixtures__/release'
import type { Scene } from '../src/scene/types'

// A real OPFS handle remains cloneable by the app's IndexedDB handle persistence.
// Only the native picker is replaced; parsing, geometry, history and release hashing run normally.
test('a recorded shelf shows live changes, comparison selection and undo back to its release', async ({
  page,
}) => {
  const scene: Scene = {
    parts: [
      {
        kind: 'board',
        id: 'board_release-shelf',
        label: 'Release shelf',
        length: 600,
        width: 300,
        thickness: 18,
        grain: 'free',
        material: '',
        color: '#c4a882',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        rotationOrder: 'XYZ',
        cuts: [],
        visible: true,
        parentId: null,
        driven: false,
      },
    ],
    materials: {},
    hardware: [],
    joints: [],
    components: [],
  }
  const source = JSON.stringify({
    scene,
    projectName: 'Release test',
    hardwareLibrary: {},
    materialLibrary: {},
  })
  const packetSha256 = 'a'.repeat(64)
  const fileText = JSON.stringify({
    version: 28,
    name: 'Release test',
    appVersion: '0.0.0',
    units: 'mm',
    createdAt: '2026-10-15T00:00:00Z',
    updatedAt: '2026-10-15T00:00:00Z',
    camera: { position: { x: 800, y: -800, z: 800 }, target: { x: 300, y: 150, z: 0 } },
    scene,
    releases: [
      {
        id: 'release-1',
        revision: 1,
        releasedBy: 'Test designer',
        identity: 'self-declared',
        releasedAt: '2026-10-15T00:00:00Z',
        packetSha256,
        sourceSha256: createHash('sha256').update(source).digest('hex'),
        source,
        assessment: readyAssessment(packetSha256),
      },
    ],
  })
  await page.addInitScript((text) => {
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => {
        const root = await navigator.storage.getDirectory()
        const handle = await root.getFileHandle('release-test.zimmu', { create: true })
        const writer = await handle.createWritable()
        await writer.write(text)
        await writer.close()
        return [handle]
      },
    })
  }, fileText)
  page.on('dialog', (dialog) => void dialog.accept())
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board', exact: true })).toBeEnabled({
    timeout: 120_000,
  })
  await expect(page.getByText('No recorded release', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /^Open…/ }).click()
  await expect(page.getByText('Matches revision 1', { exact: false })).toBeVisible()
  await page.getByTestId('node-board_release-shelf').click()
  const length = page.getByLabel('L', { exact: true }).first()
  await expect(length).toHaveValue('600')
  await length.fill('650')
  await length.blur()
  await expect(
    page.getByText('Unreleased changes since revision 1', { exact: false }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Review releases' }).click()
  await page.getByRole('button', { name: 'Compare current design with revision 1' }).click()
  const comparison = page.getByRole('dialog', { name: 'Changes since revision 1' })
  await expect(
    comparison.getByText('Release shelf · part · modified', { exact: true }),
  ).toBeVisible()
  await comparison.getByLabel('Reviewer name', { exact: true }).fill('Workshop reviewer')
  await comparison
    .getByRole('textbox', { name: 'Overall review notes', exact: true })
    .fill('Confirm site dimensions before handover.')
  await comparison
    .getByRole('searchbox', { name: 'Search review findings', exact: true })
    .fill('RELEASE SHELF')
  await expect(comparison.getByText(/Showing 1 of/)).toBeVisible()
  await comparison.getByRole('checkbox', { name: 'Show pending only', exact: true }).check()
  await comparison.getByRole('button', { name: 'Next pending finding', exact: true }).click()
  await expect(comparison.getByRole('checkbox', { name: /^Reviewed: Release shelf/ })).toBeFocused()
  await comparison.getByRole('button', { name: 'Review pending limitations', exact: true }).click()
  await expect(
    comparison.getByRole('searchbox', { name: 'Search review findings', exact: true }),
  ).toHaveValue('')
  await expect(
    comparison
      .getByRole('region', { name: 'Review comparison limitations' })
      .getByRole('checkbox')
      .first(),
  ).toBeFocused()
  await comparison
    .getByRole('button', { name: 'Review pending source changes', exact: true })
    .click()
  await expect(
    comparison.getByRole('checkbox', { name: 'Reviewed: Part source records', exact: true }),
  ).toBeFocused()
  await comparison.getByRole('button', { name: 'Review pending changes', exact: true }).click()
  await expect(comparison.getByRole('checkbox', { name: /^Reviewed: Release shelf/ })).toBeFocused()
  await comparison.getByRole('checkbox', { name: /^Reviewed: Release shelf/ }).click()
  await expect(comparison.getByRole('checkbox', { name: /^Reviewed: Release shelf/ })).toHaveCount(
    0,
  )
  await expect(
    comparison.getByRole('checkbox', { name: 'Reviewed: Part source records', exact: true }),
  ).toBeFocused()
  await expect(comparison.getByText(/Pending changes: 0 of 1/)).toBeVisible()
  await comparison.getByRole('checkbox', { name: 'Show pending only', exact: true }).uncheck()
  await comparison
    .getByLabel('Review note: Release shelf (part:board_release-shelf)', { exact: true })
    .fill('Shelf resize checked against opening.')
  await expect(comparison.getByText(/Review progress: 1 of/)).toBeVisible()
  await expect(comparison.getByText('Review draft saved locally.', { exact: true })).toBeVisible()
  await comparison.getByRole('button', { name: 'Close comparison', exact: true }).click()
  await page.getByRole('button', { name: 'Review releases' }).click()
  await page.getByRole('button', { name: 'Compare current design with revision 1' }).click()
  await expect(comparison.getByText('Local review draft restored.', { exact: true })).toBeVisible()
  await expect(comparison.getByLabel('Reviewer name', { exact: true })).toHaveValue(
    'Workshop reviewer',
  )
  await expect(
    comparison.getByRole('textbox', { name: 'Overall review notes', exact: true }),
  ).toHaveValue('Confirm site dimensions before handover.')
  await expect(comparison.getByRole('checkbox', { name: /^Reviewed: Release shelf/ })).toBeChecked()
  await comparison.getByRole('checkbox', { name: 'Show pending only', exact: true }).check()
  await comparison
    .getByRole('searchbox', { name: 'Search review findings', exact: true })
    .fill('Shelf resize checked')
  await expect(comparison.getByText(/No findings match the current filters/)).toBeVisible()
  const jsonDownload = page.waitForEvent('download')
  await comparison.getByRole('button', { name: 'Download change report JSON' }).click()
  const jsonFile = await jsonDownload
  const jsonText = await readFile(await jsonFile.path(), 'utf8')
  await comparison.getByRole('button', { name: 'Reset review view', exact: true }).click()
  await expect(
    comparison.getByRole('searchbox', { name: 'Search review findings', exact: true }),
  ).toHaveValue('')
  await expect(
    comparison.getByRole('searchbox', { name: 'Search review findings', exact: true }),
  ).toBeFocused()
  await expect(
    comparison.getByRole('checkbox', { name: 'Show pending only', exact: true }),
  ).not.toBeChecked()
  await expect(comparison.getByRole('checkbox', { name: /^Reviewed: Release shelf/ })).toBeChecked()
  await expect(
    comparison.getByLabel('Review note: Release shelf (part:board_release-shelf)', { exact: true }),
  ).toHaveValue('Shelf resize checked against opening.')
  await expect(
    comparison.getByRole('button', { name: 'Reset review view', exact: true }),
  ).toBeDisabled()
  const report = JSON.parse(jsonText)
  expect(report.kind).toBe('release-source-change-report')
  expect(report.schemaVersion).toBe(2)
  expect(report.review.reviewer).toBe('Workshop reviewer')
  expect(report.review.formalApproval).toBe('not-recorded')
  expect(
    report.review.entries.find((entry: { category: string }) => entry.category === 'item'),
  ).toMatchObject({ reviewed: true, note: 'Shelf resize checked against opening.' })
  expect(report.before.revision).toBe(1)
  expect(report.before.sourceSha256).toBe(createHash('sha256').update(source).digest('hex'))
  expect(report.after.sourceSha256).toMatch(/^[a-f0-9]{64}$/)
  expect(report.after.sourceSha256).not.toBe(report.before.sourceSha256)
  expect(report.changes[0].fields).toContainEqual(
    expect.objectContaining({
      name: 'dimensions',
      before: expect.objectContaining({ length: 600 }),
      after: expect.objectContaining({ length: 650 }),
    }),
  )
  await comparison.getByRole('button', { name: 'Close comparison', exact: true }).click()
  await page.getByRole('button', { name: 'Review releases' }).click()
  await page.getByRole('button', { name: 'Compare current design with revision 1' }).click()
  await expect(comparison.getByLabel('Reviewer name', { exact: true })).toHaveValue(
    'Workshop reviewer',
  )
  const resume = comparison.getByLabel('Resume change review JSON', { exact: true })
  const savedFile = {
    name: 'saved-review.json',
    mimeType: 'application/json',
    buffer: Buffer.from(jsonText),
  }
  await resume.setInputFiles(savedFile)
  await expect(comparison.getByText(/Review resumed from saved-review.json/)).toBeVisible()
  await expect(comparison.getByLabel('Reviewer name', { exact: true })).toHaveValue(
    'Workshop reviewer',
  )
  await expect(comparison.getByRole('checkbox', { name: /^Reviewed: Release shelf/ })).toBeChecked()
  await expect(
    comparison.getByLabel('Review note: Release shelf (part:board_release-shelf)', { exact: true }),
  ).toHaveValue('Shelf resize checked against opening.')
  await comparison.getByLabel('Reviewer name', { exact: true }).fill('Local edit')
  const stale = structuredClone(report)
  stale.after.sourceSha256 = '0'.repeat(64)
  await resume.setInputFiles({ ...savedFile, buffer: Buffer.from(JSON.stringify(stale)) })
  await expect(comparison.getByRole('alert')).toContainText(
    'different release or source comparison',
  )
  await expect(comparison.getByLabel('Reviewer name', { exact: true })).toHaveValue('Local edit')
  await resume.setInputFiles(savedFile)
  await expect(comparison.getByText(/Review resumed from saved-review.json/)).toBeVisible()
  await expect(comparison.getByLabel('Reviewer name', { exact: true })).toHaveValue(
    'Workshop reviewer',
  )
  const resumedDownload = page.waitForEvent('download')
  await comparison.getByRole('button', { name: 'Download change report JSON' }).click()
  const resumedFile = await resumedDownload
  const resumedReport = JSON.parse(await readFile(await resumedFile.path(), 'utf8'))
  expect(resumedReport.review).toEqual(report.review)
  expect(resumedReport.before.sourceSha256).toBe(report.before.sourceSha256)
  expect(resumedReport.after.sourceSha256).toBe(report.after.sourceSha256)
  const htmlDownload = page.waitForEvent('download')
  await comparison.getByRole('button', { name: 'Download printable change report' }).click()
  const htmlFile = await htmlDownload
  const html = await readFile(await htmlFile.path(), 'utf8')
  const printable = await page.context().newPage()
  await printable.setContent(html)
  await printable.emulateMedia({ media: 'print' })
  await expect(
    printable.getByRole('heading', { name: 'Change report — Release test' }),
  ).toBeVisible()
  await expect(printable.getByText(report.after.sourceSha256, { exact: true })).toBeVisible()
  await expect(printable.getByRole('table').first()).toBeVisible()
  await expect(
    printable.getByText('Shelf resize checked against opening.', { exact: true }),
  ).toBeVisible()
  await expect(
    printable.getByText('Confirm site dimensions before handover.', { exact: true }),
  ).toBeVisible()
  await printable.close()
  await comparison.getByRole('button', { name: 'Show Release shelf', exact: true }).click()
  await expect(comparison).toHaveCount(0)
  await expect(length).toHaveValue('650')
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /^Undo / }).click()
  await expect(length).toHaveValue('600')
  await expect(page.getByText('Matches revision 1', { exact: false })).toBeVisible()
  expect(await readFile(await jsonFile.path(), 'utf8')).toBe(jsonText)
})
