import { sha256Hex } from '../scene/releases'
import {
  buildReleaseChangeReport,
  changeReviewMatchesSource,
  MAX_CHANGE_REVIEWER_LENGTH,
  MAX_CHANGE_REVIEW_NOTE_LENGTH,
  type ChangeReviewBaseline,
  type ChangeReviewDraft,
} from './releaseChangeReport'
import type { LocalChangeReviewRecord } from './localChangeReviewStore'
import type { SourceComparison } from './compareReleaseSource'

export interface LocalChangeReviewContext {
  key: string
  fingerprint: string
  baseline: ChangeReviewBaseline
  source: string
  blank: ChangeReviewDraft
}
export async function localChangeReviewContext(
  baseline: ChangeReviewBaseline,
  source: string,
  comparison?: SourceComparison,
): Promise<LocalChangeReviewContext> {
  const captured = { ...baseline }
  const report = await buildReleaseChangeReport(captured, source, undefined, undefined, comparison)
  const key = JSON.stringify([
    captured.id,
    captured.revision,
    captured.packetSha256,
    report.before.sourceSha256,
    report.after.sourceSha256,
  ])
  const fingerprint = await sha256Hex(
    JSON.stringify({
      before: report.before,
      after: report.after,
      counts: report.counts,
      changes: report.changes,
      otherSourceChanges: report.otherSourceChanges,
      limitations: report.limitations,
    }),
  )
  return {
    key,
    fingerprint,
    baseline: captured,
    source,
    blank: {
      releaseId: captured.id,
      revision: captured.revision,
      packetSha256: captured.packetSha256,
      beforeSource: captured.source,
      afterSource: source,
      reviewer: '',
      notes: '',
      entries: report.review.entries.map(({ reference }) => ({
        reference,
        reviewed: false,
        note: '',
      })),
    },
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid saved local draft.')
  return value as Record<string, unknown>
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(keys.sort()))
    throw new Error('Invalid saved local draft fields.')
}
function validateReview(
  value: unknown,
  context: LocalChangeReviewContext,
): LocalChangeReviewRecord['review'] {
  const review = object(value)
  exactKeys(review, ['reviewer', 'notes', 'entries'])
  if (
    typeof review.reviewer !== 'string' ||
    review.reviewer.length > MAX_CHANGE_REVIEWER_LENGTH ||
    typeof review.notes !== 'string' ||
    review.notes.length > MAX_CHANGE_REVIEW_NOTE_LENGTH ||
    !Array.isArray(review.entries) ||
    review.entries.length !== context.blank.entries.length
  )
    throw new Error('Invalid saved local review text or coverage.')
  const expected = new Set(context.blank.entries.map((entry) => entry.reference))
  const seen = new Set<string>()
  const entries = review.entries.map((value) => {
    const entry = object(value)
    exactKeys(entry, ['reference', 'reviewed', 'note'])
    if (
      typeof entry.reference !== 'string' ||
      !expected.has(entry.reference) ||
      seen.has(entry.reference) ||
      typeof entry.reviewed !== 'boolean' ||
      typeof entry.note !== 'string' ||
      entry.note.length > MAX_CHANGE_REVIEW_NOTE_LENGTH
    )
      throw new Error('Invalid saved local review finding.')
    seen.add(entry.reference)
    return { reference: entry.reference, reviewed: entry.reviewed, note: entry.note }
  })
  const byRef = new Map(entries.map((entry) => [entry.reference, entry]))
  return {
    reviewer: review.reviewer,
    notes: review.notes,
    entries: context.blank.entries.map(({ reference }) => byRef.get(reference)!),
  }
}
export function packLocalChangeReview(
  draft: ChangeReviewDraft,
  context: LocalChangeReviewContext,
): LocalChangeReviewRecord {
  if (!changeReviewMatchesSource(draft, context.baseline, context.source))
    throw new Error('Local draft belongs to a different comparison.')
  return {
    schemaVersion: 1,
    key: context.key,
    fingerprint: context.fingerprint,
    updatedAt: new Date().toISOString(),
    review: validateReview(
      { reviewer: draft.reviewer, notes: draft.notes, entries: draft.entries },
      context,
    ),
  }
}
export function restoreLocalChangeReview(
  value: unknown,
  context: LocalChangeReviewContext,
): { draft: ChangeReviewDraft; updatedAt: string } {
  const saved = object(value)
  exactKeys(saved, ['schemaVersion', 'key', 'fingerprint', 'updatedAt', 'review'])
  if (
    saved.schemaVersion !== 1 ||
    saved.key !== context.key ||
    saved.fingerprint !== context.fingerprint ||
    typeof saved.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(saved.updatedAt))
  )
    throw new Error('The saved local draft does not match this comparison or its current rules.')
  return {
    draft: { ...context.blank, ...validateReview(saved.review, context) },
    updatedAt: saved.updatedAt,
  }
}
