import { useRef, useCallback, useLayoutEffect, useEffect } from 'react'

export function useDebouncedCallback<T extends unknown[]>(
  callback: (...args: T) => void,
  delay: number,
): (...args: T) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbackRef = useRef(callback)
  useLayoutEffect(() => {
    callbackRef.current = callback
  })
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  return useCallback(
    (...args: T) => {
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        callbackRef.current(...args)
      }, delay)
    },
    [delay],
  )
}
