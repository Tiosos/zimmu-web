import { useEffect, useState } from 'react'
import {
  forgetSourceReviewViews,
  readSourceReviewView,
  saveSourceReviewView,
  type SourceReviewView,
} from './sourceReviewViewPreferences'

function initial(key: string | null) {
  const loaded = readSourceReviewView(key)
  return { key, view: loaded.view, readFailed: loaded.failed, dirty: false }
}
export function useSourceReviewView(key: string | null) {
  const [state, setState] = useState(() => initial(key))
  const [retry, setRetry] = useState(0)
  const [paused, setPaused] = useState(false)
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [result, setResult] = useState<{ state: typeof state; ok: boolean } | null>(null)
  // A comparison can change without unmounting its dialog. Derive its view before commit so
  // the outgoing comparison's filters can never be written under the incoming hash pair.
  if (state.key !== key) setState(initial(key))
  useEffect(() => {
    if (paused || !state.key || (state.readFailed && !state.dirty)) return
    const ok = saveSourceReviewView(state.key, state.view)
    let active = true
    queueMicrotask(() => {
      if (active) setResult({ state, ok })
    })
    return () => {
      active = false
    }
  }, [state, retry, paused])
  const update = (patch: Partial<SourceReviewView>) =>
    setState((previous) => ({
      ...previous,
      view: { ...previous.view, ...patch },
      dirty: true,
      readFailed: false,
    }))
  return {
    search: state.view.search,
    pendingOnly: state.view.pendingOnly,
    pendingFirst: state.view.pendingFirst,
    partFilter: state.view.partFilter,
    partSearch: state.view.partSearch,
    pendingPartsFirst: state.view.pendingPartsFirst,
    setSearch: (search: string) => update({ search }),
    setPendingOnly: (pendingOnly: boolean) => update({ pendingOnly }),
    setPendingFirst: (pendingFirst: boolean) => update({ pendingFirst }),
    setPartFilter: (partFilter: string | null) => update({ partFilter }),
    setPartSearch: (partSearch: string) => update({ partSearch }),
    setPendingPartsFirst: (pendingPartsFirst: boolean) => update({ pendingPartsFirst }),
    failed: !paused && (state.readFailed || (result?.state === state && !result.ok)),
    paused,
    message,
    actionError,
    forget: () => {
      if (!forgetSourceReviewViews()) {
        setActionError('Could not clear remembered source review views. Try again.')
        return
      }
      setPaused(true)
      setResult(null)
      setActionError('')
      setMessage('Remembered source review views cleared. Saving is paused for this open review.')
    },
    resume: () => {
      if (!state.key || !saveSourceReviewView(state.key, state.view)) {
        setActionError('Could not resume saving source review views. Saving remains paused.')
        return
      }
      setState((previous) => ({ ...previous, readFailed: false, dirty: true }))
      setPaused(false)
      setActionError('')
      setMessage('Saving source review views resumed.')
    },
    ready: !!key,
    retry: () => {
      if (state.readFailed && !state.dirty) setState(initial(key))
      setRetry((value) => value + 1)
    },
  }
}
