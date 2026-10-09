import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { assessProductionRelease, type ProductionReleaseRecord } from './productionReleaseGate'
import { MAX_PACKET_BYTES, inspectProductionPacket } from './verifyProductionPacket'
import { downloadBlob } from './download'

export function ProductionReleaseGate({ packet }: { packet: Uint8Array }) {
  const alive = useRef(false)
  const [mode, setMode] = useState<'initial' | 'revision'>('revision')
  const [earlier, setEarlier] = useState<File | null>(null)
  const [review, setReview] = useState<File | null>(null)
  const [record, setRecord] = useState<ProductionReleaseRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const reset = () => {
    setRecord(null)
    setError('')
  }
  const assess = async () => {
    reset()
    setBusy(true)
    try {
      if (
        mode === 'revision' &&
        ((earlier?.size ?? 0) > MAX_PACKET_BYTES || (review?.size ?? 0) > 2 * 1024 * 1024)
      )
        throw new Error('Earlier packet or review exceeds its upload limit.')
      const result = await assessProductionRelease({
        packet,
        mode,
        earlierPacket:
          mode === 'revision' && earlier ? new Uint8Array(await earlier.arrayBuffer()) : undefined,
        reviewJson: mode === 'revision' && review ? await review.text() : undefined,
      })
      if (alive.current) setRecord(result)
    } catch (error) {
      if (alive.current)
        setError(error instanceof Error ? error.message : 'Assessment could not finish.')
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  const downloadOutput = async (location: string) => {
    setError('')
    setBusy(true)
    try {
      const earlierLocation = location.startsWith('earlier:')
      if (earlierLocation && !earlier) throw new Error('Earlier packet is unavailable.')
      const source =
        earlierLocation && earlier ? new Uint8Array(await earlier.arrayBuffer()) : packet
      const path = location.replace(/^(earlier|current):/, '').split('#')[0]
      const inspected = await inspectProductionPacket(source)
      const bytes = inspected.files?.[path]
      if (!bytes) throw new Error('This output is unavailable from a verified packet.')
      if (alive.current)
        downloadBlob(
          new Uint8Array(bytes),
          `${earlierLocation ? 'earlier' : 'current'}-${path.split('/').at(-1)}`,
          path.endsWith('.pdf') ? 'application/pdf' : 'application/json',
        )
    } catch (error) {
      if (alive.current)
        setError(error instanceof Error ? error.message : 'Output could not be read.')
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  return (
    <section aria-label="Production release gate" className="my-4 rounded border p-3">
      <h3 className="font-semibold">Production release gate</h3>
      <p>
        Assess this exact packet for technical release readiness. Formal production approval is
        recorded separately. Packet exports remain available for correcting blockers.
      </p>
      <label className="block">
        Release context{' '}
        <select
          value={mode}
          disabled={busy}
          onChange={(event) => {
            reset()
            setMode(event.target.value as 'initial' | 'revision')
          }}
        >
          <option value="revision">Revision of an earlier packet</option>
          <option value="initial">Initial release — no predecessor</option>
        </select>
      </label>
      {mode === 'revision' && (
        <>
          <label className="block">
            Earlier release packet ZIP{' '}
            <input
              type="file"
              accept=".zip"
              disabled={busy}
              onChange={(event) => {
                reset()
                setEarlier(event.target.files?.[0] ?? null)
              }}
            />
          </label>
          <label className="block">
            Saved revision review JSON{' '}
            <input
              type="file"
              accept=".json"
              disabled={busy}
              onChange={(event) => {
                reset()
                setReview(event.target.files?.[0] ?? null)
              }}
            />
          </label>
          <p>
            The review must match a fresh comparison of the earlier and current ZIPs. All changes,
            outputs and limitations require acknowledgment.
          </p>
        </>
      )}
      <Button disabled={busy} onClick={() => void assess()}>
        Assess production release
      </Button>
      <div aria-live="polite">
        {busy && <p>Assessing release…</p>}
        {error && <p role="alert">{error}</p>}
        {record && (
          <>
            <h4>
              {record.status === 'blocked'
                ? 'Release blocked'
                : record.status === 'review-required'
                  ? 'Release review required'
                  : 'Technically ready for release'}
            </h4>
            <p>Formal production approval: not recorded.</p>
            <p className="break-all">Packet SHA-256: {record.packetSha256}</p>
            <p>
              {record.findings.filter((f) => f.category === 'blocker').length} blockers ·{' '}
              {record.findings.filter((f) => f.category === 'review-required').length} require
              review
            </p>
            <Button
              variant="outline"
              onClick={() =>
                downloadBlob(
                  JSON.stringify(record, null, 2) + '\n',
                  `production-release-${record.packetSha256.slice(0, 12)}.json`,
                  'application/json',
                )
              }
            >
              Download release record
            </Button>
            <ul>
              {record.findings.slice(0, 200).map((finding) => (
                <li key={`${finding.source}:${finding.reference}`} className="my-2 border-t">
                  <p>
                    {finding.category}: {finding.message}
                  </p>
                  <p className="break-all">{finding.reference}</p>
                  <p>
                    {finding.partIds.map((id) => `Part ${id}`).join(', ')}
                    {finding.operationId && ` · Operation ${finding.operationId}`}
                  </p>
                  <p className="break-all">{finding.locations.join(' ↔ ')}</p>
                  {[...new Set(finding.locations)]
                    .filter(
                      (location) =>
                        /\.(pdf|json)(#|$)/.test(location) && location !== 'revision-review.json',
                    )
                    .map((location) => (
                      <Button
                        key={location}
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void downloadOutput(location)}
                      >
                        Download output {location}
                      </Button>
                    ))}
                </li>
              ))}
            </ul>
            {record.findings.length > 200 && (
              <p>Showing 200 findings. The release record includes every finding.</p>
            )}
            <details>
              <summary>Release assessment scope</summary>
              {record.limitations.map((limit) => (
                <p key={limit}>{limit}</p>
              ))}
            </details>
          </>
        )}
      </div>
    </section>
  )
}
