import { useState } from 'react'
import type { HardwareItem, Part } from '../scene/types'
import { HardwareEditPanel } from './HardwareEditPanel'
import { Button } from '@/components/ui/button'

interface HardwareTabProps {
  hardware: HardwareItem[]
  parts: Part[]
  onUpdateHardware: (items: HardwareItem[]) => void
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
  }
}

export function HardwareTab({ hardware, parts, onUpdateHardware }: HardwareTabProps) {
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
          onSave={handleSave}
          onCancel={handleCancel}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
