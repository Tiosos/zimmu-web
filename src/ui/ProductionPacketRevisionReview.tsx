import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { PacketRevisionReport } from './compareProductionPackets'
import {
  createRevisionReview,
  importRevisionReview,
  revisionReviewCoverage,
  type RevisionReviewRecord,
} from './packetRevisionReview'
import { downloadBlob } from './download'
import { buildRevisionReviewHtml } from './buildRevisionReviewHtml'

export function ProductionPacketRevisionReview({
  report,
  onEditedChange,
}: {
  report: PacketRevisionReport
  onEditedChange?: (edited: boolean) => void
}) {
  const [review, setReview] = useState(() => createRevisionReview(report))
  const [selected, setSelected] = useState(report.changes[0]?.reference ?? '')
  const [pendingOnly, setPendingOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const edited = useRef(false)
  const markEdited = (value: boolean) => {
    edited.current = value
    onEditedChange?.(value)
  }
  const resumeVersion = useRef(0)
  useEffect(
    () => () => {
      resumeVersion.current += 1
    },
    [],
  )
  const updateReview = (next: RevisionReviewRecord) => {
    resumeVersion.current += 1
    markEdited(true)
    setReview(next)
  }
  const progress = new Map(review.changes.map((item) => [item.reference, item]))
  const normalizeSearch = (text: string) => text.normalize('NFC').toLowerCase()
  const query = normalizeSearch(search.trim())
  const visibleChanges = report.changes.filter(
    (item) =>
      (!pendingOnly || !progress.get(item.reference)!.acknowledged) &&
      [item.label, item.partId, item.operationId ?? '', item.reference].some((text) =>
        normalizeSearch(text).includes(query),
      ),
  )
  const activeReference =
    visibleChanges.find((item) => item.reference === selected)?.reference ??
    visibleChanges[0]?.reference ??
    ''
  const activeIndex = visibleChanges.findIndex((item) => item.reference === activeReference)
  const entry = progress.get(activeReference)
  const change = visibleChanges.find((item) => item.reference === activeReference)
  const coverage = revisionReviewCoverage(report)
  const acknowledged = review.changes.filter((item) => item.acknowledged).length
  return (
    <section
      aria-label="Local revision review"
      className="my-4 space-y-3 rounded border border-border p-3 text-sm"
    >
      <h3 className="font-semibold">Local revision review</h3>
      <p>
        {acknowledged} of {review.changes.length} detected changes acknowledged.
      </p>
      <p>
        Self-reported review only; this is not production approval. Acknowledgments do not expand
        the comparison scope or resolve its limitations.
      </p>
      {report.status === 'partial' && (
        <p>Coverage is partial, even when all detected changes are acknowledged.</p>
      )}
      <p className="break-all">
        Earlier SHA-256: {report.before.sha256}
        <br />
        Later SHA-256: {report.after.sha256}
      </p>
      <label className="block">
        Reviewer (self-reported)
        <input
          className="ml-2 border bg-background p-1"
          value={review.reviewer}
          onChange={(event) => updateReview({ ...review, reviewer: event.target.value })}
        />
      </label>
      <label className="block">
        Review notes
        <textarea
          className="mt-1 block w-full border bg-background p-1"
          aria-label="Review notes"
          value={review.notes}
          onChange={(event) => updateReview({ ...review, notes: event.target.value })}
        />
      </label>
      <label className="block">
        <input
          type="checkbox"
          checked={pendingOnly}
          onChange={(event) => setPendingOnly(event.target.checked)}
        />{' '}
        Show pending items only
      </label>
      <label className="block">
        Find a change
        <input
          type="search"
          aria-label="Find a change"
          className="mt-1 block w-full border bg-background p-1"
          value={search}
          onChange={(event) => {
            setSelected(activeReference)
            setSearch(event.target.value)
          }}
        />
      </label>
      <p>
        Search by label, part ID, operation ID or stable reference. Search affects change selection
        only; downloads include every item.
      </p>
      {query && (
        <p>
          {visibleChanges.length} of {report.changes.length} changes match the current filters.
        </p>
      )}
      {query && visibleChanges.length === 0 && (
        <p>
          No changes match this search{pendingOnly ? ' and pending filter' : ''}. Clear or adjust
          the filters to continue.
        </p>
      )}
      {pendingOnly && (
        <p>
          Filtering changes only this view. Downloads include every item. Acknowledging a change
          moves to another pending change.
        </p>
      )}
      {pendingOnly && !query && visibleChanges.length === 0 && (
        <p>No pending changes. Clear the filter to edit acknowledged changes.</p>
      )}
      {entry && change && (
        <>
          <label className="block">
            Change to review
            <select
              aria-label="Change to review"
              className="mt-1 block max-w-full border bg-background p-1"
              value={activeReference}
              onChange={(event) => setSelected(event.target.value)}
            >
              {visibleChanges.map((item) => (
                <option key={item.reference} value={item.reference}>
                  {item.change} {item.entity}: {item.label} · {item.reference}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={activeIndex === 0}
              onClick={() => setSelected(visibleChanges[activeIndex - 1].reference)}
            >
              Previous change
            </Button>
            <span>
              Change {activeIndex + 1} of {visibleChanges.length} matching changes
            </span>
            <Button
              variant="outline"
              disabled={activeIndex === visibleChanges.length - 1}
              onClick={() => setSelected(visibleChanges[activeIndex + 1].reference)}
            >
              Next change
            </Button>
          </div>
          <p className="break-all">
            Earlier: {change.before?.locations.join(' · ') ?? 'Absent'}
            <br />
            Later: {change.after?.locations.join(' · ') ?? 'Absent'}
          </p>
          <details>
            <summary>Selected change details</summary>
            <pre className="overflow-auto text-xs">{JSON.stringify(change, null, 2)}</pre>
          </details>
          <label className="block">
            <input
              type="checkbox"
              checked={entry.acknowledged}
              onChange={(event) =>
                updateReview({
                  ...review,
                  changes: review.changes.map((item) =>
                    item.reference === activeReference
                      ? { ...item, acknowledged: event.target.checked }
                      : item,
                  ),
                })
              }
            />{' '}
            Acknowledge selected change
          </label>
          <label className="block">
            Change note
            <textarea
              className="mt-1 block w-full border bg-background p-1"
              aria-label="Change note"
              value={entry.note}
              onChange={(event) =>
                updateReview({
                  ...review,
                  changes: review.changes.map((item) =>
                    item.reference === activeReference
                      ? { ...item, note: event.target.value }
                      : item,
                  ),
                })
              }
            />
          </label>
        </>
      )}
      {(['outputs', 'limitations'] as const).map((group) => (
        <details key={group}>
          <summary>
            {group === 'outputs' ? 'Other changed outputs' : 'Comparison limitations'}:{' '}
            {review[group].filter((item) => item.acknowledged).length} of {review[group].length}{' '}
            acknowledged
          </summary>
          {group === 'outputs' && (
            <p>
              Inspect these paths in the earlier and later packet archives. A path may be present in
              only one revision. These outputs were not semantically compared.
            </p>
          )}
          {group === 'limitations' && (
            <p>
              Acknowledging a limitation records that you read it; it does not resolve it or expand
              comparison coverage.
            </p>
          )}
          <ul className="space-y-3">
            {pendingOnly && review[group].every((item) => item.acknowledged) && (
              <li>No pending items in this group. Clear the filter to edit acknowledged items.</li>
            )}
            {coverage[group]
              .map((target, index) => ({ target, item: review[group][index] }))
              .filter(({ item }) => !pendingOnly || !item.acknowledged)
              .map(({ target, item }) => {
                const update = (values: Partial<typeof item>) =>
                  updateReview({
                    ...review,
                    [group]: review[group].map((entry) =>
                      entry.reference === target.reference ? { ...entry, ...values } : entry,
                    ),
                  })
                const label = group === 'outputs' ? 'output' : 'limitation'
                return (
                  <li key={target.reference} className="break-all">
                    <label>
                      <input
                        type="checkbox"
                        aria-label={`Acknowledge ${label}: ${target.label}`}
                        checked={item.acknowledged}
                        onChange={(event) => update({ acknowledged: event.target.checked })}
                      />{' '}
                      {target.label}
                    </label>
                    <p className="text-xs text-muted-foreground">{target.reference}</p>
                    <label className="block">
                      {group === 'outputs' ? 'Output note' : 'Limitation note'}
                      <textarea
                        aria-label={`${group === 'outputs' ? 'Output' : 'Limitation'} note: ${target.label}`}
                        className="mt-1 block w-full border bg-background p-1"
                        value={item.note}
                        onChange={(event) => update({ note: event.target.value })}
                      />
                    </label>
                  </li>
                )
              })}
          </ul>
        </details>
      ))}
      <Button
        variant="outline"
        onClick={() => {
          downloadBlob(
            JSON.stringify({ ...review, savedAt: new Date().toISOString() }, null, 2) + '\n',
            'production-packet-revision-review.json',
            'application/json',
          )
          markEdited(false)
        }}
      >
        Download revision review
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          downloadBlob(
            buildRevisionReviewHtml({ ...review, savedAt: new Date().toISOString() }),
            'production-packet-revision-review.html',
            'text/html;charset=utf-8',
          )
        }
      >
        Download printable review
      </Button>
      <label className="block">
        Resume revision review
        <input
          type="file"
          accept=".json,application/json"
          onChange={async (event) => {
            const version = ++resumeVersion.current
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            if (
              edited.current &&
              !window.confirm(
                'Discard edits since your last JSON download or resume? Download revision review JSON first to keep them.',
              )
            )
              return
            setError(null)
            try {
              if (file.size > 16 * 1024 * 1024)
                throw new Error('Review records must be 16 MiB or smaller.')
              const text = await file.text()
              if (version !== resumeVersion.current) return
              setReview(importRevisionReview(JSON.parse(text), report))
              markEdited(false)
            } catch (cause) {
              if (version === resumeVersion.current)
                setError(
                  cause instanceof Error ? cause.message : 'Could not read the review record.',
                )
            }
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <p>
        Download to keep your review. Replacing either packet or comparing again starts a new
        review.
      </p>
    </section>
  )
}
