import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import type { AdjustableShelfAccessResult } from '../scene/carcaseParts'
import { insertionPoseAt } from '../render/shelfInsertionPreview'
import { ShelfInsertionCanvas } from './ShelfInsertionCanvas'

function Playback({ result }: { result: AdjustableShelfAccessResult }) {
  const [progress, setProgress] = useState(0)
  const [playing, setPlaying] = useState(false)
  const last = Math.max(0, (result.path?.poses.length ?? 1) - 1)
  const finished = progress >= last
  useEffect(() => {
    if (!playing || finished) return
    const timer = window.setInterval(() => setProgress((p) => Math.min(last, p + last / 150)), 40)
    return () => window.clearInterval(timer)
  }, [playing, finished, last])
  const seek = (position: number) => {
    setPlaying(false)
    setProgress(Math.max(0, Math.min(last, position)))
  }
  const pose = insertionPoseAt(result, progress)
  return (
    <>
      <p role="status" className="font-medium text-sm">
        {result.path === null
          ? 'No verified route found'
          : result.path.kind === 'straight'
            ? 'Straight insertion'
            : 'Angled insertion'}
      </p>
      {result.path ? (
        <p className="text-xs text-muted-foreground">
          Entry opening {result.apertures.findIndex((a) => a.id === result.path?.apertureId) + 1} of{' '}
          {result.apertures.length}, outlined in green
        </p>
      ) : (
        <p className="text-sm text-amber-300">
          This requested shelf will not be manufactured. The red shelf shows its intended installed
          position; no installation motion is available.
        </p>
      )}
      <ShelfInsertionCanvas result={result} progress={progress} />
      {result.path && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                if (finished) setProgress(0)
                setPlaying(finished || !playing)
              }}
            >
              {playing && !finished ? 'Pause' : finished ? 'Replay' : 'Play'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={progress === 0}
              onClick={() => seek(Math.ceil(progress) - 1)}
            >
              Previous step
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={finished}
              onClick={() => seek(Math.floor(progress) + 1)}
            >
              Next step
            </Button>
            <Button size="sm" variant="outline" onClick={() => seek(0)}>
              Restart
            </Button>
          </div>
          <label className="flex gap-3 items-center text-xs">
            Insertion progress
            <input
              aria-label="Insertion progress"
              className="flex-1"
              type="range"
              min={0}
              max={last}
              step="any"
              value={progress}
              onChange={(e) => seek(Number(e.target.value))}
            />
            <span>{Math.round(last === 0 ? 100 : (progress / last) * 100)}%</span>
          </label>
          <p className="text-xs text-muted-foreground">
            Tilt X {pose.rotation.x.toFixed(1)}° · Tilt Y {pose.rotation.y.toFixed(1)}° · Turn Z{' '}
            {pose.rotation.z.toFixed(1)}°
          </p>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Drag to orbit · Scroll to zoom. Grey: fixed structure. Cyan: moving shelf. Doors/fronts are
        assumed open or removed. Hardware and other removable shelves are excluded.
      </p>
      <p className="text-xs text-muted-foreground">
        No verified route means the search found none; another physical maneuver may still be
        possible.
      </p>
    </>
  )
}

function PreviewDialog({
  results,
  label,
  onClose,
}: {
  results: AdjustableShelfAccessResult[]
  label: string
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [role, setRole] = useState(results[0].role)
  const result = results.find((r) => r.role === role) ?? results[0]
  useEffect(() => {
    const node = dialog.current!
    node.showModal()
    return () => node.close()
  }, [])
  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={onClose}
      onKeyDown={(e) => e.stopPropagation()}
      className="m-auto w-[min(900px,95vw)] max-h-[95vh] overflow-auto rounded-lg border border-border bg-background text-foreground p-5 backdrop:bg-black/70"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 id={titleId} className="font-semibold">
          Shelf insertion — {label}
        </h2>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close preview
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        <label className="text-sm">
          Requested shelf
          <select
            aria-label="Requested shelf"
            className="ml-3 bg-background border border-border rounded p-1"
            value={result.role}
            onChange={(e) => setRole(e.target.value)}
          >
            {results.map((r, i) => (
              <option key={r.role} value={r.role}>
                Shelf {i + 1}
                {r.path === null ? ' — no verified route' : ''}
              </option>
            ))}
          </select>
        </label>
        {/* Geometry/selection changes discard playback state and its timer before another frame. */}
        <Playback key={JSON.stringify(result)} result={result} />
      </div>
    </dialog>,
    document.body,
  )
}

export function ShelfInsertionPreview({
  results,
  label,
}: {
  results: AdjustableShelfAccessResult[]
  label: string
}) {
  const [open, setOpen] = useState(false)
  if (results.length === 0) return null
  return (
    <>
      <Button size="sm" variant="outline" className="my-2 text-xs" onClick={() => setOpen(true)}>
        Preview shelf insertion
      </Button>
      {open && <PreviewDialog results={results} label={label} onClose={() => setOpen(false)} />}
    </>
  )
}
