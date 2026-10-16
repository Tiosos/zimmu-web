import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeReviewBaseline, ChangeReviewDraft } from './releaseChangeReport'
import {
  localChangeReviewContext,
  packLocalChangeReview,
  restoreLocalChangeReview,
  type LocalChangeReviewContext,
} from './localChangeReview'
import { readLocalChangeReview, writeLocalChangeReview } from './localChangeReviewStore'
import type { SourceComparison } from './compareReleaseSource'

export function useLocalChangeReview(
  baseline: ChangeReviewBaseline,
  source: string | null,
  draft: ChangeReviewDraft | null,
  restore: (draft: ChangeReviewDraft) => void,
  comparison?: SourceComparison | null,
) {
  const { id, revision, packetSha256, sourceSha256, source: beforeSource } = baseline
  const scope = useMemo(
    () => JSON.stringify([id, revision, packetSha256, sourceSha256, beforeSource, source]),
    [id, revision, packetSha256, sourceSha256, beforeSource, source],
  )
  const latest = useRef({ baseline, source, draft, restore, comparison, scope })
  latest.current = { baseline, source, draft, restore, comparison, scope }
  const [state, setState] = useState<{
    scope: string
    context?: LocalChangeReviewContext
    saved?: ChangeReviewDraft
    error?: string
    restored?: boolean
  }>({ scope: '' })
  const [retry, setRetry] = useState(0)
  const saved = useRef<ChangeReviewDraft | null>(null)
  useEffect(() => {
    let active = true
    const captured = latest.current
    if (!captured.source) return
    void (async () => {
      let context: LocalChangeReviewContext | undefined
      try {
        context = await localChangeReviewContext(
          captured.baseline,
          captured.source!,
          captured.comparison ?? undefined,
        )
        const record = await readLocalChangeReview(context.key)
        if (!active || latest.current.scope !== captured.scope) return
        let restored = false
        if (record && latest.current.draft === captured.draft && !captured.draft) {
          const result = restoreLocalChangeReview(record, context)
          saved.current = result.draft
          latest.current.restore(result.draft)
          restored = true
        }
        setState({ scope, context, saved: saved.current ?? undefined, restored })
      } catch (error) {
        if (active)
          setState({
            scope,
            context,
            error: error instanceof Error ? error.message : 'Browser storage unavailable.',
          })
      }
    })()
    return () => {
      active = false
    }
  }, [scope, retry])
  const context = state.scope === scope ? state.context : undefined
  const unsaved = useRef({ draft, context })
  unsaved.current = { draft, context }
  // The dialog can be unmounted without its leave guard (the release disappears from the file).
  // A draft whose autosave failed would otherwise exist only in memory.
  useEffect(() => {
    const live = unsaved
    return () => {
      const { draft, context } = live.current
      if (!context || !draft || saved.current === draft) return
      void (async () => writeLocalChangeReview(packLocalChangeReview(draft, context)))().catch(
        () => {},
      )
    }
  }, [])
  useEffect(() => {
    if (!context || !draft || saved.current === draft) return
    let active = true
    void (async () => {
      try {
        await writeLocalChangeReview(packLocalChangeReview(draft, context))
        if (active) {
          saved.current = draft
          setState((previous) => ({ ...previous, saved: draft, error: undefined }))
        }
      } catch (error) {
        if (active)
          setState((previous) => ({
            ...previous,
            error: error instanceof Error ? error.message : 'Browser storage unavailable.',
          }))
      }
    })()
    return () => {
      active = false
    }
  }, [context, draft, retry])
  return {
    loading: state.scope !== scope,
    saved: !!draft && state.scope === scope && state.saved === draft,
    error: state.scope === scope ? state.error : undefined,
    restored: state.scope === scope && state.restored,
    retry: () => setRetry((value) => value + 1),
    flush: async () => {
      if (!draft) return true
      if (!context) return false
      try {
        await writeLocalChangeReview(packLocalChangeReview(draft, context))
        return true
      } catch {
        return false
      }
    },
  }
}
