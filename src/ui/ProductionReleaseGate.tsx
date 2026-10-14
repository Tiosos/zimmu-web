import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  assessProductionRelease,
  packetSourceSha256,
  type ProductionReleaseRecord,
} from './productionReleaseGate'
import {
  sha256Hex,
  type RecordRefusal,
  type RecordReleaseInput,
  type RecordReleaseResult,
} from '../scene/releases'
import { MAX_PACKET_BYTES, inspectProductionPacket } from './verifyProductionPacket'
import { downloadBlob } from './download'

export interface ReleaseRecording {
  captureSource: () => string
  onRecord: (input: RecordReleaseInput) => Promise<RecordReleaseResult>
}

type Recordable = 'match' | 'mismatch' | 'no-digest' | null

const REFUSAL_TEXT: Record<RecordRefusal, string> = {
  'not-ready': 'Only a technically ready packet can be recorded as a release.',
  'invalid-manifest-hash': 'This packet does not carry a valid source digest.',
  'invalid-packet-hash': 'The release assessment carries no valid packet digest.',
  'source-mismatch':
    'The model changed since this packet was exported. Re-export the packet, then verify it again.',
  'invalid-name': 'Enter who is releasing this (1 to 100 characters).',
  'duplicate-packet': 'This packet is already recorded as a release.',
  unchanged: 'Nothing has changed since the latest recorded release.',
  'source-too-large': 'The project is too large to record (limit 16 MiB).',
  'release-limit': 'This file already holds the maximum of 25 recorded releases.',
  stale: 'The release list changed. Try again.',
}

export function ProductionReleaseGate({
  packet,
  recording,
}: {
  packet: Uint8Array
  recording?: ReleaseRecording
}) {
  const alive = useRef(false)
  const [mode, setMode] = useState<'initial' | 'revision'>('revision')
  const [earlier, setEarlier] = useState<File | null>(null)
  const [review, setReview] = useState<File | null>(null)
  const [record, setRecord] = useState<ProductionReleaseRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recordable, setRecordable] = useState<Recordable>(null)
  const [packetSource, setPacketSource] = useState<string | null>(null)
  const [releasedBy, setReleasedBy] = useState('')
  const [recordMessage, setRecordMessage] = useState('')
  const [recorded, setRecorded] = useState(false)
  const [recordBusy, setRecordBusy] = useState(false)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const reset = () => {
    setRecord(null)
    setError('')
    setRecordable(null)
    setPacketSource(null)
    setRecordMessage('')
    setRecorded(false)
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
      let state: Recordable = null
      let digest: string | null = null
      if (recording && result.status === 'technically-ready') {
        digest = await packetSourceSha256(packet)
        state =
          digest === null
            ? 'no-digest'
            : digest === (await sha256Hex(recording.captureSource()))
              ? 'match'
              : 'mismatch'
      }
      if (alive.current) {
        setRecord(result)
        setPacketSource(digest)
        setRecordable(state)
      }
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
  const recordThisRelease = async () => {
    if (!recording || !record || packetSource === null) return
    setRecordBusy(true)
    setRecordMessage('')
    try {
      const outcome = await recording.onRecord({
        assessment: record,
        packetSourceSha256: packetSource,
        liveSource: recording.captureSource(),
        releasedBy,
      })
      if (!alive.current) return
      if (outcome.ok) {
        setRecorded(true)
        setRecordMessage(`Recorded as revision ${outcome.release.revision}.`)
      } else setRecordMessage(REFUSAL_TEXT[outcome.reason])
    } catch (error) {
      if (alive.current)
        setRecordMessage(
          error instanceof Error ? error.message : 'The release could not be recorded.',
        )
    } finally {
      if (alive.current) setRecordBusy(false)
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
            {recordable === 'mismatch' && <p role="alert">{REFUSAL_TEXT['source-mismatch']}</p>}
            {recordable === 'no-digest' && (
              <p role="alert">{REFUSAL_TEXT['invalid-manifest-hash']}</p>
            )}
            {recordable === 'match' && !recorded && (
              <div className="my-3">
                <label className="block">
                  Released by{' '}
                  <input
                    value={releasedBy}
                    maxLength={100}
                    disabled={recordBusy}
                    onChange={(event) => setReleasedBy(event.target.value)}
                  />
                </label>
                <p className="text-sm">
                  Recording stores a frozen copy of this project in the file. The name is typed, not
                  verified, and this is not formal approval.
                </p>
                <Button
                  disabled={recordBusy || releasedBy.trim() === ''}
                  onClick={() => void recordThisRelease()}
                >
                  Record release
                </Button>
              </div>
            )}
            {recordMessage && <p role="status">{recordMessage}</p>}
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
