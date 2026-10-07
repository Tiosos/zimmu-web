import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { compareProductionPackets, type PacketRevisionReport } from './compareProductionPackets'
import { MAX_PACKET_BYTES } from './verifyProductionPacket'
import { downloadBlob } from './download'
import { ProductionPacketRevisionReview } from './ProductionPacketRevisionReview'

export function ProductionPacketComparison({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null),
    alive = useRef(false)
  const edited = useRef(false)
  const canDiscard = () =>
    !edited.current ||
    window.confirm(
      'Discard edits since your last JSON download or resume? Download revision review JSON first to keep them.',
    )
  const close = () => {
    if (canDiscard()) onClose()
  }
  const heading = useId()
  const [before, setBefore] = useState<File | null>(null),
    [after, setAfter] = useState<File | null>(null)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<PacketRevisionReport | null>(null)
  useEffect(() => {
    alive.current = true
    const node = dialog.current!
    node.showModal()
    return () => {
      alive.current = false
      node.close()
    }
  }, [])
  const compare = async () => {
    if (!before || !after || busy || !canDiscard()) return
    edited.current = false
    setBusy(true)
    setReport(null)
    setError(null)
    try {
      if (before.size > MAX_PACKET_BYTES || after.size > MAX_PACKET_BYTES)
        throw new Error('Each packet must be 64 MiB or smaller.')
      const result = await compareProductionPackets(
        new Uint8Array(await before.arrayBuffer()),
        new Uint8Array(await after.arrayBuffer()),
      )
      if (alive.current) setReport(result)
    } catch (error) {
      if (alive.current)
        setError(error instanceof Error ? error.message : 'Comparison could not finish.')
    } finally {
      if (alive.current) setBusy(false)
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
          Compare production packets
        </h2>
        <Button variant="outline" onClick={close}>
          Close
        </Button>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Choose the earlier and later revisions. Both are verified locally before comparison. Your
        project is unchanged.
      </p>
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        {(
          [
            ['Earlier packet', setBefore],
            ['Later packet', setAfter],
          ] as const
        ).map(([label, setFile]) => (
          <label key={label} className="text-sm font-medium">
            {label}
            <input
              className="mt-2 block"
              type="file"
              aria-label={label}
              accept=".zip,application/zip"
              disabled={busy}
              onChange={(event) => {
                if (!canDiscard()) {
                  event.target.value = ''
                  return
                }
                edited.current = false
                setFile(event.target.files?.[0] ?? null)
                setReport(null)
                setError(null)
              }}
            />
            <span className="mt-1 block text-xs">
              Selected: {(label === 'Earlier packet' ? before : after)?.name ?? 'None'}
            </span>
          </label>
        ))}
      </div>
      <Button onClick={() => void compare()} disabled={!before || !after || busy}>
        {busy ? 'Comparing packets…' : 'Compare revisions'}
      </Button>
      <div aria-live="polite" className="mt-4">
        {error && <p role="alert">Comparison could not finish: {error}</p>}
        {report && (
          <>
            <h3 className="font-semibold">
              {report.status === 'blocked'
                ? 'Comparison blocked'
                : report.status === 'partial'
                  ? 'Partial revision comparison'
                  : 'Revision comparison complete'}
            </h3>
            <p className="text-sm">
              Earlier: {before?.name} · Later: {after?.name}
            </p>
            <p className="text-sm">
              Integrity: earlier {report.before.integrity.status} · later{' '}
              {report.after.integrity.status}
            </p>
            {report.status !== 'blocked' && (
              <p className="mt-2">
                {report.counts.added} added · {report.counts.removed} removed ·{' '}
                {report.counts.modified} modified. {report.counts.manufacturing} manufacturing
                changes · {report.counts.metadata} metadata changes.
              </p>
            )}
            {report.status === 'partial' && (
              <p className="mt-2">
                An older packet lacks a complete part inventory. Missing part fields were not
                assumed unchanged.
              </p>
            )}
            {report.status === 'blocked' && (
              <p className="mt-2">
                Both packets must pass integrity checks. No revision changes were assessed.
              </p>
            )}
            <Button
              variant="outline"
              className="my-3"
              onClick={() =>
                downloadBlob(
                  JSON.stringify(report, null, 2) + '\n',
                  'production-packet-comparison.json',
                  'application/json',
                )
              }
            >
              Download comparison report
            </Button>
            {report.status !== 'blocked' && report.before.sha256 && report.after.sha256 && (
              <ProductionPacketRevisionReview
                report={report}
                onEditedChange={(value) => {
                  edited.current = value
                }}
              />
            )}
            {report.status === 'blocked' && (
              <ul className="space-y-2">
                {(
                  [
                    ['Earlier', report.before],
                    ['Later', report.after],
                  ] as const
                ).flatMap(([label, side]) =>
                  side.integrity.findings.slice(0, 100).map((finding) => (
                    <li key={label + finding.reference} className="break-all text-sm">
                      {label}: {finding.message} · {finding.locations.join(' ↔ ')} ·{' '}
                      {finding.reference}
                    </li>
                  )),
                )}
              </ul>
            )}
            <ul className="space-y-3">
              {report.changes.slice(0, 200).map((change) => (
                <li key={change.reference} className="rounded border border-border p-3 text-sm">
                  <p className="font-medium">
                    {change.change} {change.entity}: {change.label} ({change.classification})
                  </p>
                  <p>
                    Part: {change.partId}
                    {change.operationId && ` · Operation: ${change.operationId}`}
                  </p>
                  <p>
                    Changed fields:{' '}
                    {change.fields.map((f) => f.field).join(', ') || 'Entity inventory'}
                  </p>
                  <p className="break-all">
                    Earlier: {change.before?.locations.join(' · ') ?? 'Absent'}
                  </p>
                  <p className="break-all">
                    Later: {change.after?.locations.join(' · ') ?? 'Absent'}
                  </p>
                  <p className="break-all text-xs text-muted-foreground">{change.reference}</p>
                  <details className="mt-2">
                    <summary>Definitions and provenance</summary>
                    <pre className="mt-2 overflow-auto text-xs">
                      {JSON.stringify(
                        { before: change.before, after: change.after, fields: change.fields },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
            {report.changes.length > 200 && (
              <p>Showing 200 changes. The download contains all {report.changes.length} changes.</p>
            )}
            {report.packetMetadataChanges.length > 0 && (
              <p className="mt-3 text-sm">
                Packet metadata changed: {report.packetMetadataChanges.join(', ')}
              </p>
            )}
            {report.otherChangedFiles.length > 0 && (
              <details className="mt-3 text-sm">
                <summary>
                  Other changed outputs ({report.otherChangedFiles.length}; not semantically
                  compared)
                </summary>
                <ul>
                  {report.otherChangedFiles.map((path) => (
                    <li key={path}>{path}</li>
                  ))}
                </ul>
              </details>
            )}
            <details className="mt-4 text-sm">
              <summary>Comparison scope and limitations</summary>
              <ul className="mt-2 list-inside list-disc">
                {report.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          </>
        )}
      </div>
    </dialog>,
    document.body,
  )
}
