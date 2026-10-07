import { expect, it } from 'vitest'
import { comparisonFixture } from './__fixtures__/packetRevisionComparison'
import { revisionReviewFilename } from './revisionReviewFilename'

it('identifies the later project and ordered archives with matching JSON and HTML stems', () => {
  const report = comparisonFixture()
  report.before.projectName = 'Earlier name'
  report.after.projectName = 'Renamed Project'
  report.before.sha256 = 'A'.repeat(64)
  const stem = 'production-packet-revision-review-renamed-project-aaaaaaaaaaaa-to-bbbbbbbbbbbb'
  expect(revisionReviewFilename(report, 'json')).toBe(`${stem}.json`)
  expect(revisionReviewFilename(report, 'html')).toBe(`${stem}.html`)
  const reversed = { ...report, before: report.after, after: report.before }
  expect(revisionReviewFilename(reversed, 'json')).toBe(
    'production-packet-revision-review-earlier-name-bbbbbbbbbbbb-to-aaaaaaaaaaaa.json',
  )
})
it('normalizes international names and excludes paths, controls and formatting characters', () => {
  const report = comparisonFixture()
  report.after.projectName = '../Ｃａｆｅ\u0301/木工\\CON:\u0000\u202e.exe?'
  expect(revisionReviewFilename(report, 'json')).toBe(
    'production-packet-revision-review-café-木工-con-exe-aaaaaaaaaaaa-to-bbbbbbbbbbbb.json',
  )
  report.after.projectName = '../\u0000\u202e/<>:*?'
  report.before.sha256 = '../bad/hash'
  report.after.sha256 = null
  expect(revisionReviewFilename(report, 'html')).toBe(
    'production-packet-revision-review-project-unavailable-to-unavailable.html',
  )
})
it('bounds complete UTF-8 filenames without splitting Unicode code points', () => {
  const report = comparisonFixture()
  report.after.projectName = '𐐀'.repeat(1000)
  const filename = revisionReviewFilename(report, 'json')
  expect(filename).toBe(
    `production-packet-revision-review-${'𐐨'.repeat(40)}-aaaaaaaaaaaa-to-bbbbbbbbbbbb.json`,
  )
  expect(new TextEncoder().encode(filename).length).toBeLessThan(255)
})
