import { useEffect, useLayoutEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import type { ProductionRelease } from '../scene/releases'
import { captureProductionSource, type ProductionPacketInput } from './buildProductionPacket'
import { compareReleaseSource } from './compareReleaseSource'
import {
  buildReleaseChangeReport,
  changeReviewCoverage,
  changeReviewMatchesSource,
  createChangeReview,
  MAX_CHANGE_REVIEWER_LENGTH,
  MAX_CHANGE_REVIEW_NOTE_LENGTH,
  type ChangeReviewDraft,
  releaseChangeReportFilename,
  releaseChangeReportJson,
  releaseChangeReportHtml,
} from './releaseChangeReport'
import { useLocalChangeReview } from './useLocalChangeReview'
import { downloadBlob } from './download'
import { resumeChangeReview, MAX_CHANGE_REVIEW_BYTES } from './resumeChangeReview'

function hasReviewEdits(review: ChangeReviewDraft) {
  return (
    review.reviewer !== '' ||
    review.notes !== '' ||
    review.entries.some((entry) => entry.reviewed || entry.note !== '')
  )
}
function ReviewFinding({
  entry,
  label,
  disabled,
  onChange,
}: {
  entry: ChangeReviewDraft['entries'][number]
  label: string
  disabled: boolean
  onChange: (patch: { reviewed?: boolean; note?: string }) => void
}) {
  return (
    <div className="my-2 space-y-2 text-sm">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          disabled={disabled}
          checked={entry.reviewed}
          onChange={(event) => onChange({ reviewed: event.target.checked })}
        />
        Reviewed: {label}
      </label>
      <label className="block">
        Review note
        <textarea
          className="mt-1 block w-full rounded border border-border bg-background p-2"
          aria-label={`Review note: ${label}`}
          disabled={disabled}
          maxLength={MAX_CHANGE_REVIEW_NOTE_LENGTH}
          rows={2}
          value={entry.note}
          onChange={(event) => onChange({ note: event.target.value })}
        />
      </label>
    </div>
  )
}

export function ReleaseSourceComparison({
  release,
  input,
  onClose,
  onInspect,
}: {
  release: ProductionRelease
  input: ProductionPacketInput
  onClose: () => void
  onInspect: (partId: string) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useId()
  const alive = useRef(false)
  const operationPending = useRef(false)
  const [activity, setActivity] = useState<'export' | 'resume' | null>(null)
  const operationBusy = activity !== null
  const contextVersion = useRef(0)
  const editVersion = useRef(0)
  const [resumeError, setResumeError] = useState('')
  const [resumeNotice, setResumeNotice] = useState<{
    review: ChangeReviewDraft
    message: string
  } | null>(null)
  const [exportError, setExportError] = useState('')
  const savedReview = useRef<ChangeReviewDraft | null>(null)
  const [reviewState, setReviewState] = useState<ChangeReviewDraft | null>(null)
  const { scene, projectName, hardwareLibrary, materialLibrary } = input
  const result = useMemo(() => {
    try {
      const source = captureProductionSource({
        scene,
        projectName,
        hardwareLibrary,
        materialLibrary,
      })
      return {
        source,
        report: compareReleaseSource(release.source, source),
        error: null,
      }
    } catch (error) {
      return {
        source: null,
        report: null,
        error: error instanceof Error ? error.message : 'The source could not be compared.',
      }
    }
  }, [release, scene, projectName, hardwareLibrary, materialLibrary])
  useLayoutEffect(() => {
    contextVersion.current += 1
  }, [
    release.id,
    release.revision,
    release.packetSha256,
    release.sourceSha256,
    release.source,
    result.source,
  ])
  const blankReview = useMemo(
    () =>
      result.source && result.report
        ? createChangeReview(release, result.source, result.report)
        : null,
    [release, result],
  )
  const matches = (draft: ChangeReviewDraft) =>
    result.source !== null && changeReviewMatchesSource(draft, release, result.source)
  const review = reviewState && matches(reviewState) ? reviewState : blankReview
  const autosave = useLocalChangeReview(
    release,
    result.source,
    reviewState && matches(reviewState) ? reviewState : null,
    (draft) => {
      editVersion.current += 1
      setReviewState(draft)
    },
  )
  const busy = operationBusy || autosave.loading
  const coverage = result.report ? changeReviewCoverage(result.report) : []
  const coverageByReference = new Map(coverage.map((entry) => [entry.reference, entry]))
  const entriesByReference = new Map(review?.entries.map((entry) => [entry.reference, entry]) ?? [])
  const updateReview = (updater: (draft: ChangeReviewDraft) => ChangeReviewDraft) => {
    if (!blankReview) return
    editVersion.current += 1
    setResumeNotice(null)
    setReviewState((previous) => updater(previous && matches(previous) ? previous : blankReview))
  }
  const finding = (reference: string) => {
    const entry = entriesByReference.get(reference),
      info = coverageByReference.get(reference)
    return (
      entry &&
      info && (
        <ReviewFinding
          entry={entry}
          label={info.label}
          disabled={busy}
          onChange={(patch) =>
            updateReview((draft) => ({
              ...draft,
              entries: draft.entries.map((item) =>
                item.reference === reference ? { ...item, ...patch } : item,
              ),
            }))
          }
        />
      )
    )
  }
  const canLeave = () =>
    !review ||
    !hasReviewEdits(review) ||
    savedReview.current === review ||
    window.confirm(
      'Discard review edits since your last report download? Download a report first to keep them.',
    )
  const leave = async (action: () => void) => {
    if (!review || !hasReviewEdits(review) || savedReview.current === review || autosave.saved) {
      action()
      return
    }
    if (autosave.error) {
      if (canLeave()) action()
      return
    }
    const version = editVersion.current
    const context = contextVersion.current
    const kept = await autosave.flush()
    if (!alive.current || version !== editVersion.current || context !== contextVersion.current)
      return
    if (kept || canLeave()) action()
  }
  const close = () => {
    void leave(onClose)
  }
  useEffect(() => {
    alive.current = true
    const node = dialog.current!
    node.showModal()
    return () => {
      alive.current = false
      node.close()
    }
  }, [])
  const exportReport = async (format: 'html' | 'json') => {
    if (!result.source || !result.report || !review || operationPending.current) return
    operationPending.current = true
    setActivity('export')
    setExportError('')
    try {
      const report = await buildReleaseChangeReport(
        release,
        result.source,
        new Date(),
        review,
        result.report,
      )
      if (alive.current) {
        downloadBlob(
          format === 'html' ? releaseChangeReportHtml(report) : releaseChangeReportJson(report),
          releaseChangeReportFilename(report, format),
          format === 'html' ? 'text/html;charset=utf-8' : 'application/json',
        )
        savedReview.current = review
      }
    } catch (error) {
      if (alive.current)
        setExportError(
          error instanceof Error ? error.message : 'The report could not be downloaded.',
        )
    } finally {
      operationPending.current = false
      if (alive.current) setActivity(null)
    }
  }
  const resume = async (file: File) => {
    if (!result.source || !result.report || !review || operationPending.current) return
    const source = result.source
    const baseline = { ...release }
    const originalContext = contextVersion.current
    const originalEdit = editVersion.current
    operationPending.current = true
    setActivity('resume')
    setResumeError('')
    setResumeNotice(null)
    try {
      if (file.size > MAX_CHANGE_REVIEW_BYTES)
        throw new Error('Change review JSON exceeds the 64 MiB limit.')
      const restored = await resumeChangeReview(await file.text(), baseline, source)
      if (!alive.current) return
      if (originalContext !== contextVersion.current || originalEdit !== editVersion.current)
        throw new Error('The comparison or review changed while loading. Choose the JSON again.')
      if (!canLeave()) {
        setResumeNotice({
          review: restored,
          message: 'Resume cancelled. Your current review was kept.',
        })
        return
      }
      editVersion.current += 1
      setReviewState(restored)
      savedReview.current = restored
      setResumeNotice({
        review: restored,
        message: `Review resumed from ${file.name}. Further edits need a new download.`,
      })
    } catch (error) {
      if (alive.current)
        setResumeError(error instanceof Error ? error.message : 'The review could not be read.')
    } finally {
      operationPending.current = false
      if (alive.current) setActivity(null)
    }
  }
  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={heading}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      className="fixed inset-0 m-auto max-h-[85vh] w-[min(1000px,94vw)] overflow-auto rounded-lg border border-border bg-background p-6 text-foreground shadow-xl backdrop:bg-black/50"
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 id={heading} className="text-lg font-semibold">
          Changes since revision {release.revision}
        </h2>
        <Button variant="outline" onClick={close}>
          Close comparison
        </Button>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Recorded source compared with the current design. Manufacturing changes include dimensions,
        stock, placement, machining and purchasing requirements. Labels, presentation and prices
        appear as metadata. This comparison does not approve production.
      </p>
      {resumeError && <p role="alert">Review could not be resumed: {resumeError}</p>}
      {resumeNotice && matches(resumeNotice.review) && <p role="status">{resumeNotice.message}</p>}
      {exportError && <p role="alert">Report export failed: {exportError}</p>}
      {result.error && <p role="alert">Comparison unavailable: {result.error}</p>}
      {result.report && (
        <>
          {reviewState && !matches(reviewState) && hasReviewEdits(reviewState) && (
            <p role="status">
              This comparison differs from your review. Its notes and check-offs are not applied.
            </p>
          )}
          {review && (
            <section
              aria-label="Change report review"
              className="my-4 space-y-3 rounded border border-border p-3 text-sm"
            >
              <h3 className="font-semibold">Change report review</h3>
              <p role="status">
                Review progress: {review.entries.filter((entry) => entry.reviewed).length} of{' '}
                {review.entries.length} findings reviewed.
              </p>
              <p role="status">
                {autosave.loading
                  ? 'Checking for a local review draft…'
                  : autosave.error
                    ? 'Local autosave unavailable. Download JSON to keep your edits.'
                    : autosave.saved
                      ? 'Review draft saved locally.'
                      : reviewState
                        ? 'Saving review draft…'
                        : 'Local autosave ready.'}
              </p>
              {autosave.restored && <p>Local review draft restored.</p>}
              {autosave.error && (
                <p role="alert">
                  {autosave.error}{' '}
                  <button type="button" onClick={autosave.retry}>
                    Retry local autosave
                  </button>
                </p>
              )}
              <label className="block">
                Reviewer name
                <input
                  className="mt-1 block w-full rounded border border-border bg-background p-2"
                  value={review.reviewer}
                  disabled={busy}
                  maxLength={MAX_CHANGE_REVIEWER_LENGTH}
                  onChange={(event) =>
                    updateReview((draft) => ({ ...draft, reviewer: event.target.value }))
                  }
                />
              </label>
              <label className="block">
                Overall review notes
                <textarea
                  className="mt-1 block w-full rounded border border-border bg-background p-2"
                  rows={3}
                  value={review.notes}
                  disabled={busy}
                  maxLength={MAX_CHANGE_REVIEW_NOTE_LENGTH}
                  onChange={(event) =>
                    updateReview((draft) => ({ ...draft, notes: event.target.value }))
                  }
                />
              </label>
              <p>
                Names and check-offs are self-declared review records. They do not grant production
                approval. Drafts autosave in this browser for up to ten recent comparisons. Download
                JSON for a portable backup.
              </p>
            </section>
          )}
          <label className="my-3 block text-sm font-medium">
            Resume change review JSON (version 2, up to 64 MiB)
            <input
              type="file"
              accept=".json,application/json"
              aria-label="Resume change review JSON"
              className="mt-2 block"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void resume(file)
              }}
            />
          </label>
          <div className="my-3 flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => void exportReport('html')}>
              Download printable change report
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void exportReport('json')}>
              Download change report JSON
            </Button>
          </div>
          {busy && (
            <p role="status">
              {activity === 'resume'
                ? 'Reading and checking saved change review…'
                : 'Preparing captured change report…'}
            </p>
          )}
          <p className="mb-3 text-sm text-muted-foreground">
            Downloads capture the comparison when requested and include both source hashes. Later
            edits do not update downloaded reports.
          </p>
          <p role="status">
            {result.report.changes.length} changed items ·{' '}
            {result.report.changes.filter((c) => c.change === 'added').length} added ·{' '}
            {result.report.changes.filter((c) => c.change === 'removed').length} removed ·{' '}
            {result.report.changes.filter((c) => c.change === 'modified').length} modified
          </p>
          {result.report.changes.length === 0 && result.report.otherSourceChanges.length === 0 && (
            <p>No differences in compared source fields.</p>
          )}
          {(['manufacturing', 'metadata'] as const).map((category) => (
            <section key={category} aria-label={`${category} changes`} className="my-4">
              <h3 className="font-semibold">
                {category === 'manufacturing' ? 'Manufacturing changes' : 'Metadata changes'}
              </h3>
              <ul className="space-y-3">
                {result
                  .report!.changes.filter((change) => change.classification === category)
                  .map((change) => (
                    <li key={change.key} className="rounded border border-border p-3 text-sm">
                      <p className="font-medium">
                        {change.label} · {change.entity} · {change.change}
                      </p>
                      <p className="break-all text-xs text-muted-foreground">{change.id}</p>
                      {finding(`item:${change.key}`)}
                      <details>
                        <summary>Changed fields ({change.fields.length})</summary>
                        <ul>
                          {change.fields.map((field) => (
                            <li key={field.name} className="my-2">
                              <p>
                                {field.name} · {field.classification}
                              </p>
                              <pre className="whitespace-pre-wrap break-all text-xs">
                                {JSON.stringify(field.before, null, 2)} →{' '}
                                {JSON.stringify(field.after, null, 2)}
                              </pre>
                            </li>
                          ))}
                        </ul>
                      </details>
                      {change.change === 'removed' && (
                        <p>Removed from the current design; no current part to select.</p>
                      )}
                      {change.partIds.map((id) => {
                        const part = scene.parts.find((part) => part.id === id)
                        return (
                          part && (
                            <Button
                              key={id}
                              variant="outline"
                              className="mr-2 mt-2"
                              onClick={() => {
                                void leave(() => onInspect(id))
                              }}
                            >
                              Show {part.label}
                              {part.visible ? '' : ' (hidden)'}
                            </Button>
                          )
                        )
                      })}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
          {result.report.otherSourceChanges.length > 0 && (
            <section aria-label="Other source changes">
              <h3 className="font-semibold">Other source changes</h3>
              <p className="text-sm">
                These source sections also differ. Review them alongside the item changes.
              </p>
              <ul>
                {result.report.otherSourceChanges.map((label) => (
                  <li key={label}>
                    {label}
                    {finding(`source:${JSON.stringify(label)}`)}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-label="Review comparison limitations" className="my-4 text-sm">
            <h3 className="font-semibold">Comparison limitations</h3>
            <ul>
              {coverage
                .filter((entry) => entry.category === 'limitation')
                .map((entry) => (
                  <li key={entry.reference}>{finding(entry.reference)}</li>
                ))}
            </ul>
          </section>
          <p className="mt-4 text-sm text-muted-foreground">
            This view compares saved source records using current manufacturing rules. It does not
            compare the original exported ZIP, drawing layout, machine compatibility or hardware
            suitability. Changes to labels within machining definitions are conservatively treated
            as manufacturing changes. Use packet comparison to review actual exported outputs.
          </p>
        </>
      )}
    </dialog>,
    document.body,
  )
}
