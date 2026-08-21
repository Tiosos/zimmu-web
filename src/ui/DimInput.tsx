import { useState, useEffect, useRef, useId } from 'react'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { useDebouncedCallback } from './useDebouncedCallback'

// Extracted from EditPanel when CarcasePanel became a second consumer. Commits on change behind a
// 150ms debounce rather than on blur, so geometry follows the value as it is typed — which is the
// point of a parametric model. The `min` guard is what stops a half-typed value reaching the
// generator.

export function DimInput({
  label,
  value,
  onCommit,
  suffix,
  min = 1,
}: {
  label: string
  value: number
  onCommit: (v: number) => void
  suffix: string
  min?: number
}) {
  // Without an id/htmlFor pair the label is announced by nothing and queryable by nothing —
  // an accessibility defect that also made the field untestable by its visible name.
  const id = useId()
  const [localValue, setLocalValue] = useState(String(value))
  const isFocused = useRef(false)
  const debounced = useDebouncedCallback(onCommit, 150)

  useEffect(() => {
    if (!isFocused.current) setLocalValue(String(value))
  }, [value])

  return (
    <div className="flex items-center gap-1.5 mb-1">
      <Label htmlFor={id} className="w-4 shrink-0 text-right">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        step="any"
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value)
          const v = parseFloat(e.target.value)
          if (isFinite(v) && v >= min) debounced(v)
        }}
        onFocus={() => {
          isFocused.current = true
        }}
        onBlur={(e) => {
          isFocused.current = false
          const v = parseFloat(e.target.value)
          if (!isFinite(v) || v < min) {
            setLocalValue(String(min))
            onCommit(min)
          } else {
            setLocalValue(String(v))
          }
        }}
        className="flex-1 min-w-0"
      />
      <span className="text-[11px] text-muted-foreground shrink-0 w-10">{suffix}</span>
    </div>
  )
}
