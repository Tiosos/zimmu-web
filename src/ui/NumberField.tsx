import { useState, useEffect, useRef } from 'react'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

/**
 * Controlled numeric input that buffers keystrokes locally and only calls
 * onCommit on blur (when the value is finite). Supports negatives, partial
 * decimals, and mid-edit states without collapsing them to 0.
 */
export function NumberField({
  id,
  label,
  value,
  onCommit,
  disabled = false,
}: {
  id: string
  label: string
  value: number
  onCommit: (v: number) => void
  disabled?: boolean
}) {
  const [local, setLocal] = useState(String(value))
  const isFocused = useRef(false)

  useEffect(() => {
    if (!isFocused.current) setLocal(String(value))
  }, [value])

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        step="any"
        value={local}
        disabled={disabled}
        onChange={(e) => setLocal(e.target.value)}
        onFocus={() => {
          isFocused.current = true
        }}
        onBlur={() => {
          isFocused.current = false
          const v = parseFloat(local)
          if (Number.isFinite(v)) {
            onCommit(v)
          } else {
            setLocal(String(value))
          }
        }}
      />
    </div>
  )
}
