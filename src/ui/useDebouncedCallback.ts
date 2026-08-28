import { useRef, useCallback, useLayoutEffect, useEffect } from 'react'

export function useDebouncedCallback<T extends unknown[]>(
  callback: (...args: T) => void,
  delay: number,
): (...args: T) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingArgs = useRef<T | null>(null)
  const callbackRef = useRef(callback)
  useLayoutEffect(() => {
    callbackRef.current = callback
  })
  // Flush on unmount rather than drop. Unmounting here means the user navigated away — selecting a
  // part in the tree swaps CarcasePanel for EditPanel — and a value they typed is not ours to
  // discard because they clicked elsewhere before the timer fired. Dropping it lost a cabinet
  // dimension edit whenever the next click landed inside the debounce window.
  useEffect(
    () => () => {
      if (timer.current === null) return
      clearTimeout(timer.current)
      if (pendingArgs.current !== null) callbackRef.current(...pendingArgs.current)
    },
    [],
  )

  return useCallback(
    (...args: T) => {
      if (timer.current !== null) clearTimeout(timer.current)
      pendingArgs.current = args
      timer.current = setTimeout(() => {
        timer.current = null
        pendingArgs.current = null
        callbackRef.current(...args)
      }, delay)
    },
    [delay],
  )
}
