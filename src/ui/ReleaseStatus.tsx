import { useEffect, useState } from 'react'
import {
  isReadable,
  sha256Hex,
  type ProductionRelease,
  type ReleaseEntry,
  type ReleaseIntegrity,
} from '../scene/releases'
import { captureProductionSource, type ProductionPacketInput } from './buildProductionPacket'

export function ReleaseStatus({
  input,
  releases,
  integrity,
  onReview,
}: {
  input: ProductionPacketInput
  releases: readonly ReleaseEntry[]
  integrity: readonly ReleaseIntegrity[] | null
  onReview?: () => void
}) {
  const { scene, projectName, hardwareLibrary, materialLibrary } = input
  const latest = releases
    .filter(isReadable)
    .reduce<
      ProductionRelease | undefined
    >((best, entry) => (!best || entry.revision > best.revision ? entry : best), undefined)
  const verified = latest && integrity?.[releases.indexOf(latest)] === 'ok'
  const [comparison, setComparison] = useState<{
    scene: typeof scene
    projectName: string
    hardwareLibrary: typeof hardwareLibrary
    materialLibrary: typeof materialLibrary
    latest: typeof latest
    status: 'matches' | 'changed' | 'error'
  } | null>(null)

  useEffect(() => {
    if (!verified || !latest || !isReadable(latest)) return
    let active = true
    const baseline = latest
    const compare = async () => {
      let status: 'matches' | 'changed' | 'error'
      try {
        const source = captureProductionSource({
          scene,
          projectName,
          hardwareLibrary,
          materialLibrary,
        })
        status = (await sha256Hex(source)) === baseline.sourceSha256 ? 'matches' : 'changed'
      } catch {
        status = 'error'
      }
      if (active)
        setComparison({
          scene,
          projectName,
          hardwareLibrary,
          materialLibrary,
          latest: baseline,
          status,
        })
    }
    void compare()
    return () => {
      active = false
    }
  }, [scene, projectName, hardwareLibrary, materialLibrary, latest, verified])

  const current =
    comparison?.scene === scene &&
    comparison.projectName === projectName &&
    comparison.hardwareLibrary === hardwareLibrary &&
    comparison.materialLibrary === materialLibrary &&
    comparison.latest === latest
      ? comparison.status
      : null
  let text = 'No recorded release'
  if (releases.length > 0) {
    if (!latest || releases.some((entry) => !isReadable(entry))) {
      text = 'Release comparison unavailable: unreadable release record'
    } else if (!integrity) {
      text = 'Checking release integrity…'
    } else if (!verified) {
      text = 'Release comparison unavailable: latest release integrity failed'
    } else if (current === 'error') {
      text = 'Release comparison unavailable: source could not be checked'
    } else if (!current) {
      text = 'Checking changes since release…'
    } else {
      text =
        current === 'matches'
          ? `Matches revision ${latest.revision}`
          : `Unreleased changes since revision ${latest.revision}`
    }
  }
  return (
    <div
      role="status"
      className="shrink-0 border-b border-border px-3 py-1 text-xs text-muted-foreground"
    >
      {text}
      {releases.length > 0 && onReview && (
        <button className="ml-3 underline" onClick={onReview}>
          Review releases
        </button>
      )}
    </div>
  )
}
