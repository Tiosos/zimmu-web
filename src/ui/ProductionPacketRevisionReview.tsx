import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { PacketRevisionReport } from './compareProductionPackets'
import {
  createRevisionReview,
  importRevisionReview,
  revisionReviewCoverage,
} from './packetRevisionReview'
import { downloadBlob } from './download'

export function ProductionPacketRevisionReview({ report }: { report: PacketRevisionReport }) {
  const [review, setReview] = useState(() => createRevisionReview(report))
  const [selected, setSelected] = useState(report.changes[0]?.reference ?? '')
  const [error, setError] = useState<string | null>(null)
  const entry = review.changes.find((item) => item.reference === selected)
  const change = report.changes.find((item) => item.reference === selected)
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
        Self-reported review only; this is not production approval. Other changed outputs and
        comparison limitations still need review.
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
          onChange={(event) => setReview({ ...review, reviewer: event.target.value })}
        />
      </label>
      <label className="block">
        Review notes
        <textarea
          className="mt-1 block w-full border bg-background p-1"
          aria-label="Review notes"
          value={review.notes}
          onChange={(event) => setReview({ ...review, notes: event.target.value })}
        />
      </label>
      {entry && change && (
        <>
          <label className="block">
            Change to review
            <select
              className="mt-1 block max-w-full border bg-background p-1"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              {report.changes.map((item) => (
                <option key={item.reference} value={item.reference}>
                  {item.change} {item.entity}: {item.label} · {item.reference}
                </option>
              ))}
            </select>
          </label>
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
                setReview({
                  ...review,
                  changes: review.changes.map((item) =>
                    item.reference === selected
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
                setReview({
                  ...review,
                  changes: review.changes.map((item) =>
                    item.reference === selected ? { ...item, note: event.target.value } : item,
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
            {coverage[group].map((target, index) => {
              const item = review[group][index]
              const update = (values: Partial<typeof item>) =>
                setReview({
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
        onClick={() =>
          downloadBlob(
            JSON.stringify({ ...review, savedAt: new Date().toISOString() }, null, 2) + '\n',
            'production-packet-revision-review.json',
            'application/json',
          )
        }
      >
        Download revision review
      </Button>
      <label className="block">
        Resume revision review
        <input
          type="file"
          accept=".json,application/json"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            setError(null)
            try {
              if (file.size > 16 * 1024 * 1024)
                throw new Error('Review records must be 16 MiB or smaller.')
              setReview(importRevisionReview(JSON.parse(await file.text()), report))
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Could not read the review record.')
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
