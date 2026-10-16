import type { ProductionRelease } from '../scene/releases'
import {
  buildReleaseChangeReport,
  captureChangeReview,
  createChangeReview,
  MAX_CHANGE_REVIEWER_LENGTH,
  MAX_CHANGE_REVIEW_NOTE_LENGTH,
  type ChangeReviewDraft,
} from './releaseChangeReport'

export const MAX_CHANGE_REVIEW_BYTES = 64 * 1024 * 1024

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid change report structure.')
  return value as Record<string, unknown>
}
// Compare the JSON representation, ignoring object-key order but preserving array order.
function canonical(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((v) => (v === undefined ? 'null' : canonical(v))).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'undefined'
}
function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || value.length > limit)
    throw new Error('Invalid change review text.')
  return value
}

export async function resumeChangeReview(
  json: string,
  release: ProductionRelease,
  currentSource: string,
): Promise<ChangeReviewDraft> {
  if (
    json.length > MAX_CHANGE_REVIEW_BYTES ||
    new TextEncoder().encode(json).byteLength > MAX_CHANGE_REVIEW_BYTES
  )
    throw new Error('Change review JSON exceeds the 64 MiB limit.')
  let parsed: unknown
  try {
    parsed = JSON.parse(json, (_key, value: unknown) => {
      if (typeof value === 'number' && !Number.isFinite(value))
        throw new Error('Non-finite JSON number.')
      return value
    }) as unknown
  } catch {
    throw new Error('The file is not valid change report JSON.')
  }
  const saved = record(parsed)
  if (saved.kind !== 'release-source-change-report' || saved.schemaVersion !== 2)
    throw new Error('Resume requires a version-2 change report JSON with a review record.')
  if (
    typeof saved.generatedAt !== 'string' ||
    !Number.isFinite(Date.parse(saved.generatedAt)) ||
    typeof saved.appVersion !== 'string' ||
    saved.appVersion.length > 100
  )
    throw new Error('Invalid change report metadata.')

  // Capture the baseline before hashing; never let a later caller edit retarget this import.
  const baseline = { ...release }
  const fresh = await buildReleaseChangeReport(baseline, currentSource)
  if (canonical(Object.keys(saved).sort()) !== canonical(Object.keys(fresh).sort()))
    throw new Error('Invalid change report fields.')
  const before = record(saved.before),
    after = record(saved.after)
  if (
    before.releaseId !== fresh.before.releaseId ||
    before.revision !== fresh.before.revision ||
    before.packetSha256 !== fresh.before.packetSha256 ||
    before.sourceSha256 !== fresh.before.sourceSha256 ||
    after.sourceSha256 !== fresh.after.sourceSha256
  )
    throw new Error('This review belongs to a different release or source comparison.')
  for (const key of [
    'before',
    'after',
    'counts',
    'changes',
    'otherSourceChanges',
    'limitations',
  ] as const) {
    if (canonical(saved[key]) !== canonical(fresh[key]))
      throw new Error('The saved comparison differs from the current results. Start a new review.')
  }

  const savedReview = record(saved.review)
  const draft = createChangeReview(baseline, currentSource, fresh)
  draft.reviewer = text(savedReview.reviewer, MAX_CHANGE_REVIEWER_LENGTH)
  draft.notes = text(savedReview.notes, MAX_CHANGE_REVIEW_NOTE_LENGTH)
  if (
    !Array.isArray(savedReview.entries) ||
    savedReview.entries.length !== fresh.review.entries.length
  )
    throw new Error('The saved review does not cover every current finding.')
  const rawEntries = savedReview.entries.map(record)
  draft.entries = rawEntries.map((entry) => {
    if (typeof entry.reference !== 'string' || typeof entry.reviewed !== 'boolean')
      throw new Error('Invalid change review entry.')
    return {
      reference: entry.reference,
      reviewed: entry.reviewed,
      note: text(entry.note, MAX_CHANGE_REVIEW_NOTE_LENGTH),
    }
  })
  const checked = captureChangeReview(baseline, currentSource, fresh, draft)
  // Check labels/categories and recomputed progress too. Entry order is immaterial: references
  // identify findings, while comparison arrays above retain their exact exported order.
  const byReference = new Map(rawEntries.map((entry) => [entry.reference, entry]))
  for (const entry of checked.entries) {
    if (canonical(byReference.get(entry.reference)) !== canonical(entry))
      throw new Error('Saved review finding details do not match the current comparison.')
  }
  if (canonical({ ...savedReview, entries: checked.entries }) !== canonical(checked))
    throw new Error('Invalid review identity, approval status or progress.')
  return {
    ...draft,
    reviewer: checked.reviewer,
    entries: checked.entries.map(({ reference, reviewed, note }) => ({
      reference,
      reviewed,
      note,
    })),
  }
}
