import { useState, useEffect, useRef } from 'react'
import type { Component, HardwareItem, HardwareLibraryEntry, Part } from '../scene/types'
import type { HardwareRow } from './groupHardware'
import { HardwareEditPanel } from './HardwareEditPanel'
import { useDebouncedCallback } from './useDebouncedCallback'
import { Button } from '@/components/ui/button'

interface HardwareTabProps {
  hardware: HardwareItem[]
  parts: Part[]
  components: Component[]
  onUpdateHardware: (items: HardwareItem[]) => void
  derived: HardwareRow[]
  onSaveHardwareEntry: (key: string, entry: HardwareLibraryEntry) => void
}

// The catalogue key is shared across every row that needs the same part — screws and shelf pins on
// every cabinet, a hinge split across two — so the input must read the library, not its own mount-
// time snapshot, or a price typed on one row leaves every other row showing a stale number. It
// follows DimInput's split: a local echo for what's being typed, synced from the committed value
// only while unfocused, and a debounced commit so a settled edit writes once, not once per keystroke.
function UnitCostInput({
  value,
  ariaLabel,
  onCommit,
}: {
  value: number | null
  ariaLabel: string
  onCommit: (v: number) => void
}) {
  const [localValue, setLocalValue] = useState(value === null ? '' : String(value))
  const isFocused = useRef(false)
  const debounced = useDebouncedCallback(onCommit, 150)

  useEffect(() => {
    if (!isFocused.current) setLocalValue(value === null ? '' : String(value))
  }, [value])

  return (
    <input
      type="number"
      step="0.01"
      min={0}
      aria-label={ariaLabel}
      className="w-20 bg-transparent border border-border rounded px-1"
      value={localValue}
      onChange={(e) => {
        setLocalValue(e.target.value)
        const v = parseFloat(e.target.value)
        // An interim value ("-", "e", "") parses to NaN, and a real price is never negative —
        // wait for a finite, non-negative value before committing, exactly as DimInput withholds
        // a commit below its own `min`. Committing NaN would persist into the library and turn
        // every total downstream into the literal text "$NaN".
        if (isFinite(v) && v >= 0) debounced(v)
      }}
      onFocus={() => {
        isFocused.current = true
      }}
      onBlur={() => {
        isFocused.current = false
        // A blank or invalid field is not a $0.00 price — that reads as "free", which the '—'
        // fallback exists specifically to avoid. Leaving without a valid edit reverts the display
        // to the last committed price rather than silently writing a zero.
        setLocalValue(value === null ? '' : String(value))
      }}
    />
  )
}

// Supplier and part number beside the price, on the same library entry. Text has no invalid
// interim state the way a half-typed number does, so this commits whatever is in the field — but it
// keeps the same focused/unfocused echo, because these rows share a catalogue key and a value typed
// on one must reach the others.
function TextEntryInput({
  value,
  ariaLabel,
  placeholder,
  onCommit,
}: {
  value: string
  ariaLabel: string
  placeholder: string
  onCommit: (v: string) => void
}) {
  const [localValue, setLocalValue] = useState(value)
  const isFocused = useRef(false)
  const debounced = useDebouncedCallback(onCommit, 150)

  useEffect(() => {
    if (!isFocused.current) setLocalValue(value)
  }, [value])

  return (
    <input
      type="text"
      aria-label={ariaLabel}
      placeholder={placeholder}
      className="w-24 bg-transparent border border-border rounded px-1"
      value={localValue}
      onChange={(e) => {
        setLocalValue(e.target.value)
        debounced(e.target.value)
      }}
      onFocus={() => {
        isFocused.current = true
      }}
      onBlur={() => {
        isFocused.current = false
      }}
    />
  )
}

function makeBlankItem(): HardwareItem {
  return {
    id: crypto.randomUUID(),
    name: '',
    qty: 1,
    unit: 'pcs',
    supplier: '',
    partNumber: '',
    unitCost: 0,
    notes: '',
    linkedPartIds: [],
    linkedComponentIds: [],
  }
}

export function HardwareTab({
  hardware,
  parts,
  components,
  onUpdateHardware,
  derived,
  onSaveHardwareEntry,
}: HardwareTabProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingItem, setPendingItem] = useState<HardwareItem | null>(null)

  const editingItem =
    pendingItem ?? (selectedId ? (hardware.find((h) => h.id === selectedId) ?? null) : null)

  const handleAddItem = () => {
    const blank = makeBlankItem()
    setPendingItem(blank)
    setSelectedId(null)
  }

  const handleSave = (saved: HardwareItem) => {
    if (pendingItem) {
      onUpdateHardware([...hardware, saved])
      setPendingItem(null)
      setSelectedId(saved.id)
    } else {
      onUpdateHardware(hardware.map((h) => (h.id === saved.id ? saved : h)))
    }
  }

  const handleCancel = () => {
    setPendingItem(null)
    setSelectedId(null)
  }

  const handleDelete = (id: string) => {
    onUpdateHardware(hardware.filter((h) => h.id !== id))
    setPendingItem(null)
    setSelectedId(null)
  }

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-w-0">
        {derived.length > 0 && (
          <>
            <h3 className="text-xs font-medium text-muted-foreground mb-2">
              Generated by the cabinets
            </h3>
            <table className="w-full border-collapse mb-4">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="pb-2 pr-2 font-medium text-xs">Cabinet</th>
                  <th className="pb-2 px-2 font-medium text-xs">Item</th>
                  <th className="pb-2 px-2 font-medium text-xs">Qty</th>
                  <th className="pb-2 px-2 font-medium text-xs">Unit</th>
                  <th className="pb-2 px-2 font-medium text-xs">Supplier</th>
                  <th className="pb-2 px-2 font-medium text-xs">Part #</th>
                  <th className="pb-2 px-2 font-medium text-xs">Unit cost</th>
                  <th className="pb-2 px-2 font-medium text-xs">Total</th>
                </tr>
              </thead>
              <tbody>
                {derived.map((row) => (
                  <tr
                    key={`${row.componentId ?? ''}/${row.key}`}
                    className="border-b border-border/30"
                  >
                    <td className="py-1.5 pr-2 text-xs">{row.cabinetLabel}</td>
                    <td className="py-1.5 px-2 text-xs">{row.name}</td>
                    <td className="py-1.5 px-2 text-xs">{row.qty}</td>
                    <td className="py-1.5 px-2 text-xs">{row.unit}</td>
                    <td className="py-1.5 px-2 text-xs">
                      <TextEntryInput
                        value={row.supplier}
                        ariaLabel={`Supplier for ${row.name} (${row.cabinetLabel})`}
                        placeholder="Supplier"
                        onCommit={(v) =>
                          onSaveHardwareEntry(row.key, {
                            supplier: v,
                            partNumber: row.partNumber,
                            unitCost: row.unitCost,
                          })
                        }
                      />
                    </td>
                    <td className="py-1.5 px-2 text-xs">
                      <TextEntryInput
                        value={row.partNumber}
                        ariaLabel={`Part number for ${row.name} (${row.cabinetLabel})`}
                        placeholder="Part #"
                        onCommit={(v) =>
                          onSaveHardwareEntry(row.key, {
                            supplier: row.supplier,
                            partNumber: v,
                            unitCost: row.unitCost,
                          })
                        }
                      />
                    </td>
                    <td className="py-1.5 px-2 text-xs">
                      <UnitCostInput
                        value={row.unitCost}
                        // The catalogue key alone collides whenever two cabinets share a part.
                        // The label disambiguates it for a reader, but not always uniquely: two
                        // cabinets off the same preset carry the same label, which is why the row
                        // key above is the component id instead.
                        ariaLabel={`Unit cost for ${row.name} (${row.cabinetLabel})`}
                        onCommit={(v) =>
                          onSaveHardwareEntry(row.key, {
                            supplier: row.supplier,
                            partNumber: row.partNumber,
                            unitCost: v,
                          })
                        }
                      />
                    </td>
                    {/* Blank, never $0.00: an unpriced job must not read as a free one. */}
                    <td className="py-1.5 px-2 text-xs">
                      {row.totalCost === null ? '—' : `$${row.totalCost.toFixed(2)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-left">
              <th className="pb-2 pr-2 font-medium text-xs">Name</th>
              <th className="pb-2 px-2 font-medium text-xs">Qty</th>
              <th className="pb-2 px-2 font-medium text-xs">Unit</th>
              <th className="pb-2 px-2 font-medium text-xs">Supplier</th>
              <th className="pb-2 px-2 font-medium text-xs">Part #</th>
              <th className="pb-2 px-2 font-medium text-xs">Unit cost</th>
              <th className="pb-2 px-2 font-medium text-xs">Total</th>
              <th className="pb-2 px-2 font-medium text-xs">Notes</th>
            </tr>
          </thead>
          <tbody>
            {hardware.length === 0 && !pendingItem ? (
              <tr>
                <td colSpan={8} className="py-3 text-muted-foreground text-center text-xs">
                  No hardware items yet. Click 'Add item' to begin.
                </td>
              </tr>
            ) : (
              hardware.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => {
                    setPendingItem(null)
                    setSelectedId(item.id)
                  }}
                  className={`border-b border-border/30 cursor-pointer hover:bg-muted/30 ${selectedId === item.id ? 'bg-muted/50' : ''}`}
                >
                  <td className="py-1.5 pr-2 text-xs">{item.name || '—'}</td>
                  <td className="py-1.5 px-2 text-xs">{item.qty}</td>
                  <td className="py-1.5 px-2 text-xs">{item.unit}</td>
                  <td className="py-1.5 px-2 text-xs">{item.supplier || '—'}</td>
                  <td className="py-1.5 px-2 text-xs">{item.partNumber || '—'}</td>
                  <td className="py-1.5 px-2 text-xs">${item.unitCost.toFixed(2)}</td>
                  <td className="py-1.5 px-2 text-xs">${(item.qty * item.unitCost).toFixed(2)}</td>
                  <td className="py-1.5 px-2 text-xs">{item.notes || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={handleAddItem}>
            Add item
          </Button>
        </div>
      </div>

      {editingItem && (
        <HardwareEditPanel
          key={editingItem.id}
          item={editingItem}
          parts={parts}
          components={components}
          onSave={handleSave}
          onCancel={handleCancel}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
