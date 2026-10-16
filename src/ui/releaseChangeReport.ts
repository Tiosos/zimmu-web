import { sha256Hex, type ProductionRelease } from '../scene/releases'
import { compareReleaseSource, type SourceComparison } from './compareReleaseSource'

export const CHANGE_REPORT_LIMITATIONS = [
  'Compares frozen source records using the current application manufacturing rules; it does not compare or verify the original exported ZIP or drawing layout.',
  'Source hashes identify the exact scene, project name, material library and hardware library captured. They do not authenticate authorship or grant production approval.',
  'The recorded releasing name is self-declared and unverified. The recorded packet hash is a reference, not a new verification of that packet.',
  'Machine compatibility, hardware suitability and production readiness are not assessed by this report.',
  'Labels within machining definitions are conservatively classified as manufacturing changes. Other source sections may overlap item changes or contain fields outside the item projections.',
  'The report is a snapshot captured when download is requested. Later design edits do not update it. Compare actual exported packets before production handover.',
  'Review names, check-offs and notes are local, self-declared records. They do not authenticate a reviewer or record production approval.',
] as const

export type ChangeReviewBaseline = Omit<ProductionRelease, 'assessment'>

export const MAX_CHANGE_REVIEWER_LENGTH = 100
export const MAX_CHANGE_REVIEW_NOTE_LENGTH = 5000

export function changeReviewCoverage(comparison: SourceComparison) {
  return [
    ...comparison.changes.map((change) => ({
      reference: `item:${change.key}`,
      label: `${change.label} (${change.entity}:${change.id})`,
      category: 'item' as const,
    })),
    ...comparison.otherSourceChanges.map((label) => ({
      reference: `source:${JSON.stringify(label)}`,
      label,
      category: 'source' as const,
    })),
    ...CHANGE_REPORT_LIMITATIONS.map((label) => ({
      reference: `limit:${JSON.stringify(label)}`,
      label,
      category: 'limitation' as const,
    })),
  ]
}
export interface ChangeReviewDraft {
  releaseId: string
  revision: number
  packetSha256: string
  beforeSource: string
  afterSource: string
  reviewer: string
  notes: string
  entries: { reference: string; reviewed: boolean; note: string }[]
}
export function createChangeReview(
  release: ChangeReviewBaseline,
  afterSource: string,
  comparison: SourceComparison,
): ChangeReviewDraft {
  return {
    releaseId: release.id,
    revision: release.revision,
    packetSha256: release.packetSha256,
    beforeSource: release.source,
    afterSource,
    reviewer: '',
    notes: '',
    entries: changeReviewCoverage(comparison).map(({ reference }) => ({
      reference,
      reviewed: false,
      note: '',
    })),
  }
}
export function changeReviewMatchesSource(
  draft: ChangeReviewDraft,
  release: ChangeReviewBaseline,
  afterSource: string,
): boolean {
  return (
    draft.releaseId === release.id &&
    draft.revision === release.revision &&
    draft.packetSha256 === release.packetSha256 &&
    draft.beforeSource === release.source &&
    draft.afterSource === afterSource
  )
}
export function captureChangeReview(
  release: ChangeReviewBaseline,
  afterSource: string,
  comparison: SourceComparison,
  draft?: ChangeReviewDraft,
) {
  const captured = structuredClone(draft ?? createChangeReview(release, afterSource, comparison))
  if (!changeReviewMatchesSource(captured, release, afterSource))
    throw new Error('Review belongs to a different source comparison. Start a new review.')
  const coverage = changeReviewCoverage(comparison)
  const expected = new Set(coverage.map((entry) => entry.reference))
  const seen = new Set<string>()
  if (
    typeof captured.reviewer !== 'string' ||
    captured.reviewer.length > MAX_CHANGE_REVIEWER_LENGTH ||
    typeof captured.notes !== 'string' ||
    captured.notes.length > MAX_CHANGE_REVIEW_NOTE_LENGTH ||
    !Array.isArray(captured.entries) ||
    captured.entries.length !== coverage.length
  )
    throw new Error('Invalid change review fields or coverage.')
  for (const entry of captured.entries) {
    if (
      !entry ||
      !expected.has(entry.reference) ||
      seen.has(entry.reference) ||
      typeof entry.reviewed !== 'boolean' ||
      typeof entry.note !== 'string' ||
      entry.note.length > MAX_CHANGE_REVIEW_NOTE_LENGTH
    )
      throw new Error('Invalid or duplicate change review entry.')
    seen.add(entry.reference)
  }
  const byReference = new Map(captured.entries.map((entry) => [entry.reference, entry]))
  const entries = coverage.map((entry) => ({
    ...entry,
    reviewed: byReference.get(entry.reference)!.reviewed,
    note: byReference.get(entry.reference)!.note,
  }))
  const reviewed = entries.filter((entry) => entry.reviewed).length
  return {
    reviewer: captured.reviewer.trim(),
    notes: captured.notes,
    identity: 'self-declared' as const,
    formalApproval: 'not-recorded' as const,
    entries,
    progress: { reviewed, pending: entries.length - reviewed, total: entries.length },
  }
}

export interface ReleaseChangeReport extends SourceComparison {
  schemaVersion: 2
  kind: 'release-source-change-report'
  generatedAt: string
  appVersion: string
  before: {
    releaseId: string
    revision: number
    projectName: string
    sourceSha256: string
    packetSha256: string
    releasedAt: string
    releasedBy: string
    identity: 'self-declared'
  }
  after: { projectName: string; sourceSha256: string }
  counts: Record<'added' | 'removed' | 'modified' | 'manufacturing' | 'metadata', number>
  limitations: string[]
  review: ReturnType<typeof captureChangeReview>
}

export async function buildReleaseChangeReport(
  release: ChangeReviewBaseline,
  currentSource: string,
  generatedAt = new Date(),
  reviewDraft?: ChangeReviewDraft,
): Promise<ReleaseChangeReport> {
  // Capture metadata and compute the comparison before awaiting hashes. Nothing in the result
  // retains references to the live scene, libraries or mutable release record.
  const source = release.source
  const before = {
    releaseId: release.id,
    revision: release.revision,
    projectName: '',
    sourceSha256: release.sourceSha256,
    packetSha256: release.packetSha256,
    releasedAt: release.releasedAt,
    releasedBy: release.releasedBy,
    identity: release.identity,
  }
  const capturedAt = generatedAt.toISOString()
  const comparison = compareReleaseSource(source, currentSource)
  const review = captureChangeReview(release, currentSource, comparison, reviewDraft)
  before.projectName = (JSON.parse(source) as { projectName: string }).projectName
  const projectName = (JSON.parse(currentSource) as { projectName: string }).projectName
  const [beforeHash, afterHash] = await Promise.all([sha256Hex(source), sha256Hex(currentSource)])
  if (beforeHash !== before.sourceSha256)
    throw new Error('The recorded release source no longer matches its hash.')
  const counts = { added: 0, removed: 0, modified: 0, manufacturing: 0, metadata: 0 }
  for (const change of comparison.changes) {
    counts[change.change]++
    counts[change.classification]++
  }
  return {
    schemaVersion: 2,
    kind: 'release-source-change-report',
    generatedAt: capturedAt,
    appVersion: import.meta.env.VITE_APP_VERSION ?? '0.0.0',
    before,
    after: { projectName, sourceSha256: afterHash },
    counts,
    ...comparison,
    limitations: [...CHANGE_REPORT_LIMITATIONS],
    review,
  }
}

export function releaseChangeReportFilename(report: ReleaseChangeReport, format: 'html' | 'json') {
  const name =
    Array.from(
      report.after.projectName
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, ''),
    )
      .slice(0, 40)
      .join('')
      .replace(/-+$/g, '') || 'project'
  return `change-report-${name}-r${report.before.revision}-${report.before.sourceSha256.slice(0, 12)}-to-${report.after.sourceSha256.slice(0, 12)}.${format}`
}

export function releaseChangeReportJson(report: ReleaseChangeReport): string {
  return JSON.stringify(report, null, 2) + '\n'
}
const escape = (value: unknown): string =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )

export function releaseChangeReportHtml(report: ReleaseChangeReport): string {
  const reviews = new Map(report.review.entries.map((entry) => [entry.reference, entry]))
  const reviewHtml = (reference: string) => {
    const entry = reviews.get(reference)
    return `<p>Review: ${entry?.reviewed ? 'Reviewed' : 'Pending'}</p>${entry?.note ? `<pre>${escape(entry.note)}</pre>` : ''}`
  }
  const groups = (['manufacturing', 'metadata'] as const)
    .map((category) => {
      const items = report.changes.filter((change) => change.classification === category)
      return `<section><h2>${category === 'manufacturing' ? 'Manufacturing changes' : 'Metadata changes'} (${items.length})</h2>${items.length ? items.map((change) => `<article><h3>${escape(change.label)} — ${escape(change.entity)} · ${escape(change.change)}</h3><p>ID: <code>${escape(change.id)}</code></p>${reviewHtml(`item:${change.key}`)}<p>Current part references: ${change.partIds.length ? change.partIds.map(escape).join(', ') : 'None (removed or unlinked)'}</p><table><thead><tr><th>Field</th><th>Classification</th><th>Before</th><th>After</th></tr></thead><tbody>${change.fields.map((field) => `<tr><td>${escape(field.name)}</td><td>${escape(field.classification)}</td><td><pre>${escape(JSON.stringify(field.before, null, 2))}</pre></td><td><pre>${escape(JSON.stringify(field.after, null, 2))}</pre></td></tr>`).join('')}</tbody></table></article>`).join('') : '<p>No reported item changes in this category.</p>'}</section>`
    })
    .join('')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(report.after.projectName)} — Change report</title><style>
body{font:14px/1.5 system-ui,sans-serif;color:#17202a;max-width:1100px;margin:2rem auto;padding:0 1rem}h1,h2,h3{line-height:1.25}h2{margin-top:2rem}table{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:1.5rem}th,td{border:1px solid #ccd1d1;padding:.5rem;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f2f4f4}pre,code{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}pre{margin:0}dt{font-weight:600}dd{margin:0 0 .6rem;overflow-wrap:anywhere}.notice{border:1px solid #ccd1d1;padding:1rem} @media print{body{max-width:none;margin:0;padding:0;font-size:10pt}thead{display:table-header-group}h2,h3{break-after:avoid}tr{break-inside:avoid}a{color:inherit}}@page{size:A4 landscape;margin:14mm}
</style></head><body><h1>Change report — ${escape(report.after.projectName)}</h1><p>Recorded revision ${escape(report.before.revision)} → captured working design</p><p class="notice">Source comparison only. This report does not approve production. Open your browser's Print command to print or save as PDF.</p><dl>
<dt>Captured at (UTC)</dt><dd>${escape(report.generatedAt)}</dd><dt>Application version / report schema</dt><dd>${escape(report.appVersion)} / ${report.schemaVersion}</dd>
<dt>Baseline project / release ID</dt><dd>${escape(report.before.projectName)} / ${escape(report.before.releaseId)}</dd><dt>Baseline source SHA-256</dt><dd><code>${escape(report.before.sourceSha256)}</code></dd><dt>Current source SHA-256</dt><dd><code>${escape(report.after.sourceSha256)}</code></dd><dt>Recorded packet SHA-256 (reference only)</dt><dd><code>${escape(report.before.packetSha256)}</code></dd><dt>Recorded by / at</dt><dd>${escape(report.before.releasedBy)} (self-declared, unverified) / ${escape(report.before.releasedAt)}</dd></dl>
<p>${report.changes.length} changed items: ${report.counts.added} added · ${report.counts.removed} removed · ${report.counts.modified} modified. ${report.counts.manufacturing} manufacturing · ${report.counts.metadata} metadata.</p>
<section><h2>Review record</h2><p>Reviewer: ${report.review.reviewer ? escape(report.review.reviewer) : 'Not provided'} (self-declared, unverified)</p><p>${report.review.progress.reviewed} of ${report.review.progress.total} findings reviewed; ${report.review.progress.pending} pending. Formal production approval: not recorded.</p><h3>Overall notes</h3><pre>${escape(report.review.notes || 'None recorded.')}</pre></section>
${groups}<section><h2>Other changed source sections</h2>${report.otherSourceChanges.length ? `<ul>${report.otherSourceChanges.map((label) => `<li>${escape(label)}${reviewHtml(`source:${JSON.stringify(label)}`)}</li>`).join('')}</ul>` : '<p>None reported.</p>'}</section><section><h2>Comparison limitations</h2><ul>${report.limitations.map((limit) => `<li>${escape(limit)}${reviewHtml(`limit:${JSON.stringify(limit)}`)}</li>`).join('')}</ul></section></body></html>\n`
}
