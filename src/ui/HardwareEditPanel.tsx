import { useState } from 'react'
import type { HardwareItem } from '../scene/types'
import { Button } from '@/components/ui/button'

interface HardwareEditPanelProps {
  item: HardwareItem
  onSave: (item: HardwareItem) => void
  onCancel: () => void
  onDelete: (id: string) => void
}

export function HardwareEditPanel({ item, onSave, onCancel, onDelete }: HardwareEditPanelProps) {
  const [draft, setDraft] = useState<HardwareItem>(item)
  const [confirming, setConfirming] = useState(false)

  const field = <K extends keyof HardwareItem>(key: K, value: HardwareItem[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }) as HardwareItem)

  return (
    <div className="flex flex-col gap-3 p-4 border-l border-border bg-card min-w-[280px] text-sm">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Name</label>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => field('name', e.target.value)}
          className="bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Item name"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Qty</label>
          <input
            type="number"
            min={1}
            value={draft.qty}
            onChange={(e) => field('qty', Math.max(1, parseInt(e.target.value) || 1))}
            className="bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Unit</label>
          <input
            type="text"
            list="hw-units"
            value={draft.unit}
            onChange={(e) => field('unit', e.target.value)}
            className="bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <datalist id="hw-units">
            <option value="pcs" />
            <option value="m" />
            <option value="kg" />
            <option value="box" />
            <option value="set" />
            <option value="pair" />
          </datalist>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Supplier</label>
        <input
          type="text"
          value={draft.supplier}
          onChange={(e) => field('supplier', e.target.value)}
          className="bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Part #</label>
        <input
          type="text"
          value={draft.partNumber}
          onChange={(e) => field('partNumber', e.target.value)}
          className="bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Unit cost</label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={draft.unitCost}
          onChange={(e) => field('unitCost', Math.max(0, parseFloat(e.target.value) || 0))}
          className="bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Notes</label>
        <textarea
          rows={3}
          value={draft.notes}
          onChange={(e) => field('notes', e.target.value)}
          className="bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-border mt-auto">
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onSave(draft)}>
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
        {confirming ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-destructive">Delete?</span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setConfirming(false)
                onDelete(item.id)
              }}
            >
              Confirm
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              No
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirming(true)}
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  )
}
