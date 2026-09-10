import { useEffect, useMemo, useState } from 'react'
import type {
  Component,
  HardwareItem,
  HardwareLibraryEntry,
  MaterialDef,
  Part,
} from '../scene/types'
import type { HardwareLine } from '../scene/carcaseHardware'
import { CATALOGUE_ORDER, HARDWARE_CATALOGUE } from '../scene/hardwareCatalogue'
import { CuttingList } from './CuttingList'
import { DowelList } from './DowelList'
import { HardwareTab } from './HardwareTab'
import { groupHardware } from './groupHardware'
import { groupParts, buildCsv, buildHardwareCsv, groupDowels, buildDowelCsv } from './buildCsv'
import { downloadBlob } from './download'
import { SheetsTab } from './SheetsTab'
import type { NestReport } from '../scene/useNest'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Tab = 'boards' | 'dowels' | 'sheets' | 'hardware' | 'library'

interface BomModalProps {
  parts: Part[]
  components: Component[]
  materials: Record<string, MaterialDef>
  hardware: HardwareItem[]
  projectName: string
  onClose: () => void
  onMaterialCostChange: (name: string, def: MaterialDef) => void
  onUpdateHardware: (items: HardwareItem[]) => void
  library: Record<string, MaterialDef>
  onSaveRate: (name: string, def: MaterialDef) => void
  onDeleteLibraryEntry: (name: string) => void
  clearance: number
  onSetClearance: (mm: number) => void
  nestReports: NestReport[]
  nestPending: boolean
  // Set from the tab state so a 5-second nest only runs for a report someone is looking at.
  onSheetsTabChange: (open: boolean) => void
  hardwareLines: HardwareLine[]
  hardwareLibrary: Record<string, HardwareLibraryEntry>
  onSaveHardwareEntry: (key: string, entry: HardwareLibraryEntry) => void
  onDeleteHardwareEntry: (key: string) => void
}

function LibraryTab({
  library,
  onDelete,
  onSaveRate,
  clearance,
  onSetClearance,
  hardwareLibrary,
  onDeleteHardwareEntry,
}: {
  library: Record<string, MaterialDef>
  onDelete: (name: string) => void
  onSaveRate: (name: string, def: MaterialDef) => void
  clearance: number
  onSetClearance: (mm: number) => void
  hardwareLibrary: Record<string, HardwareLibraryEntry>
  onDeleteHardwareEntry: (key: string) => void
}) {
  const entries = Object.entries(library).sort(([a], [b]) => a.localeCompare(b))

  // Row order matches the Hardware tab and the CSV: catalogue order, with stale entries (a key a
  // catalogue revision dropped) sorted last by key rather than first, which is what a raw -1 would do.
  const catalogueRank = (key: string) => {
    const i = CATALOGUE_ORDER.indexOf(key)
    return i === -1 ? CATALOGUE_ORDER.length : i
  }
  const hardwareEntries = Object.entries(hardwareLibrary).sort(([a], [b]) => {
    const byCatalogue = catalogueRank(a) - catalogueRank(b)
    return byCatalogue !== 0 ? byCatalogue : a.localeCompare(b)
  })

  const [confirmingKey, setConfirmingKey] = useState<string | null>(null)

  // Typing one dimension into a material that has no sheet creates the pair with the other at 0.
  // `isNestable` treats a 0 as absent, so a half-filled sheet is never nested.
  const setSheet = (name: string, def: MaterialDef, field: 'length' | 'width', mm: number) =>
    onSaveRate(name, {
      ...def,
      sheet: { length: 0, width: 0, ...def.sheet, [field]: mm },
    })

  return (
    <>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          No materials saved yet. Set a rate in the Boards tab to build your library.
        </p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-left">
              <th className="pb-2 pr-2 font-medium text-xs">Material</th>
              <th className="pb-2 px-2 font-medium text-xs">Cost/m²</th>
              <th className="pb-2 px-2 font-medium text-xs">Cost/m</th>
              <th className="pb-2 px-2 font-medium text-xs">Sheet L</th>
              <th className="pb-2 px-2 font-medium text-xs">Sheet W</th>
              <th className="pb-2 px-2 font-medium text-xs">Cost/sheet</th>
              <th className="pb-2 px-2 font-medium text-xs">Grain</th>
              <th className="pb-2 px-2 font-medium text-xs" />
            </tr>
          </thead>
          <tbody>
            {entries.map(([name, def]) => (
              <tr key={name} className="border-b border-border/30">
                <td className="py-1.5 pr-2 text-xs">{name}</td>
                <td className="py-1.5 px-2 text-xs">
                  {def.costPerM2 !== undefined ? `$${def.costPerM2.toFixed(2)}` : '—'}
                </td>
                <td className="py-1.5 px-2 text-xs">
                  {def.costPerM !== undefined ? `$${def.costPerM.toFixed(2)}` : '—'}
                </td>
                <td className="py-1.5 px-2">
                  <Input
                    type="number"
                    aria-label={`Sheet length for ${name}`}
                    value={def.sheet?.length ?? ''}
                    onChange={(e) => setSheet(name, def, 'length', Number(e.target.value))}
                    className="h-6 w-20 text-xs"
                  />
                </td>
                <td className="py-1.5 px-2">
                  <Input
                    type="number"
                    aria-label={`Sheet width for ${name}`}
                    value={def.sheet?.width ?? ''}
                    onChange={(e) => setSheet(name, def, 'width', Number(e.target.value))}
                    className="h-6 w-20 text-xs"
                  />
                </td>
                <td className="py-1.5 px-2">
                  <Input
                    type="number"
                    aria-label={`Cost per sheet for ${name}`}
                    value={def.sheet?.costPerSheet ?? ''}
                    onChange={(e) =>
                      onSaveRate(name, {
                        ...def,
                        sheet: {
                          length: 0,
                          width: 0,
                          ...def.sheet,
                          costPerSheet: Number(e.target.value),
                        },
                      })
                    }
                    className="h-6 w-20 text-xs"
                  />
                </td>
                <td className="py-1.5 px-2">
                  <input
                    type="checkbox"
                    aria-label={`${name} has grain`}
                    // Absent means "has grain": the safe default, since rotating a directional
                    // sheet freely is the answer that wastes material the user cannot get back.
                    checked={def.hasGrain ?? true}
                    onChange={(e) => onSaveRate(name, { ...def, hasGrain: e.target.checked })}
                  />
                </td>
                <td className="py-1.5 px-2 text-xs text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(name)}
                    className="h-5 px-1.5 text-xs text-muted-foreground hover:text-destructive"
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
        <Label htmlFor="lib-clearance" className="text-xs">
          Tool clearance
        </Label>
        <Input
          id="lib-clearance"
          type="number"
          value={clearance}
          onChange={(e) => onSetClearance(Number(e.target.value))}
          className="h-7 w-20 text-xs"
        />
        <span className="text-xs text-muted-foreground">
          mm — the gap left around every nested part
        </span>
      </div>

      <h3 className="text-xs font-medium text-muted-foreground mt-6 mb-2">Hardware</h3>
      {hardwareEntries.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          No hardware priced yet. Set a unit cost in the Hardware tab to build your library.
        </p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-left">
              <th className="pb-2 pr-2 font-medium text-xs">Item</th>
              <th className="pb-2 px-2 font-medium text-xs">Supplier</th>
              <th className="pb-2 px-2 font-medium text-xs">Part #</th>
              <th className="pb-2 px-2 font-medium text-xs">Unit cost</th>
              <th className="pb-2 px-2 font-medium text-xs" />
            </tr>
          </thead>
          <tbody>
            {hardwareEntries.map(([key, entry]) => {
              const name = HARDWARE_CATALOGUE[key]?.name ?? key
              return (
                <tr key={key} className="border-b border-border/30">
                  {/* The name is the catalogue's, never the library's: one statement of what an
                      item is called, so a renamed catalogue entry renames every priced row. */}
                  <td className="py-1.5 pr-2 text-xs">{name}</td>
                  <td className="py-1.5 px-2 text-xs">{entry.supplier || '—'}</td>
                  <td className="py-1.5 px-2 text-xs">{entry.partNumber || '—'}</td>
                  <td className="py-1.5 px-2 text-xs">${entry.unitCost.toFixed(2)}</td>
                  <td className="py-1.5 px-2 text-xs text-right">
                    {confirmingKey === key ? (
                      <span className="flex items-center justify-end gap-1.5">
                        <span className="text-xs text-destructive">Forget?</span>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-5 px-1.5 text-xs"
                          onClick={() => {
                            setConfirmingKey(null)
                            onDeleteHardwareEntry(key)
                          }}
                        >
                          Confirm
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1.5 text-xs"
                          onClick={() => setConfirmingKey(null)}
                        >
                          No
                        </Button>
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        title={`Forget ${name}`}
                        aria-label={`Forget ${name}`}
                        className="h-5 w-5 text-destructive hover:text-destructive"
                        onClick={() => setConfirmingKey(key)}
                      >
                        ✕
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </>
  )
}

export function BomModal({
  parts,
  components,
  materials,
  hardware,
  projectName,
  onClose,
  onMaterialCostChange,
  onUpdateHardware,
  library,
  onSaveRate,
  onDeleteLibraryEntry,
  clearance,
  onSetClearance,
  nestReports,
  nestPending,
  onSheetsTabChange,
  hardwareLines,
  hardwareLibrary,
  onSaveHardwareEntry,
  onDeleteHardwareEntry,
}: BomModalProps) {
  const [tab, setTab] = useState<Tab>('boards')

  const derivedHardware = useMemo(
    () => groupHardware(hardwareLines, hardwareLibrary),
    [hardwareLines, hardwareLibrary],
  )

  useEffect(() => {
    onSheetsTabChange(tab === 'sheets')
    // Cleanup matters as much as the effect: closing the modal while on the Sheets tab would
    // otherwise leave the nest wanted forever, running a 5-second job on every scene edit for a
    // report nobody can see.
    return () => onSheetsTabChange(false)
  }, [tab, onSheetsTabChange])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Field-level merge so a material keeps both rates: a library-only costPerM
  // (dowel rate) must not be shadowed by a scene entry that has only costPerM2.
  const effectiveMaterials: Record<string, MaterialDef> = {}
  for (const name of new Set([...Object.keys(library), ...Object.keys(materials)])) {
    effectiveMaterials[name] = { ...library[name], ...materials[name] }
  }

  const rows = groupParts(parts, effectiveMaterials, components)
  const boardSubtotal = rows.reduce((sum, r) => sum + (r.totalCost ?? 0), 0)
  const dowelRows = groupDowels(parts, effectiveMaterials)
  const dowelSubtotal = dowelRows.reduce((sum, r) => sum + (r.totalCost ?? 0), 0)
  const hardwareSubtotal = hardware.reduce((sum, item) => sum + item.qty * item.unitCost, 0)
  const grandTotal = boardSubtotal + dowelSubtotal + hardwareSubtotal

  const handleMaterialCostChange = (name: string, def: MaterialDef) => {
    onMaterialCostChange(name, def)
    onSaveRate(name, def)
  }

  const handleCopy = () => {
    if (tab === 'library' || tab === 'sheets') return
    const csv =
      tab === 'boards'
        ? buildCsv(parts, effectiveMaterials, components)
        : tab === 'dowels'
          ? buildDowelCsv(parts, effectiveMaterials)
          : buildHardwareCsv(hardware, derivedHardware)
    void navigator.clipboard.writeText(csv)
  }

  const handleDownload = () => {
    if (tab === 'library' || tab === 'sheets') return
    if (tab === 'boards') {
      downloadBlob(
        buildCsv(parts, effectiveMaterials, components),
        `${projectName}-boards.csv`,
        'text/csv',
      )
    } else if (tab === 'dowels') {
      downloadBlob(
        buildDowelCsv(parts, effectiveMaterials),
        `${projectName}-dowels.csv`,
        'text/csv',
      )
    } else {
      downloadBlob(
        buildHardwareCsv(hardware, derivedHardware),
        `${projectName}-hardware.csv`,
        'text/csv',
      )
    }
  }

  return (
    <div
      data-testid="bom-overlay"
      onClick={onClose}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]"
    >
      <div
        data-testid="bom-panel"
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-lg flex flex-col min-w-[700px] max-w-[960px] w-[90vw] max-h-[85vh] shadow-2xl text-foreground text-sm"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground/90">Bill of Materials</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close"
            onClick={onClose}
            className="text-muted-foreground h-6 w-6"
          >
            ×
          </Button>
        </div>

        {/* Tabs */}
        <div role="tablist" className="flex gap-0 border-b border-border px-6">
          {(['boards', 'dowels', 'sheets', 'hardware', 'library'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-xs font-medium capitalize border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'boards'
                ? 'Boards'
                : t === 'sheets'
                  ? 'Sheets'
                  : t === 'dowels'
                    ? 'Dowels'
                    : t === 'hardware'
                      ? 'Hardware'
                      : 'Library'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {tab === 'boards' ? (
            <CuttingList
              parts={parts}
              projectName={projectName}
              onClose={onClose}
              materials={effectiveMaterials}
              components={components}
              onMaterialCostChange={handleMaterialCostChange}
              hideExportButtons
            />
          ) : tab === 'dowels' ? (
            <DowelList
              parts={parts}
              materials={effectiveMaterials}
              onMaterialCostChange={handleMaterialCostChange}
            />
          ) : tab === 'sheets' ? (
            <SheetsTab
              reports={nestReports}
              pending={nestPending}
              materials={effectiveMaterials}
              labelOf={(id) => parts.find((p) => p.id === id)?.label ?? id}
            />
          ) : tab === 'hardware' ? (
            <HardwareTab
              hardware={hardware}
              parts={parts}
              components={components}
              onUpdateHardware={onUpdateHardware}
              derived={derivedHardware}
              onSaveHardwareEntry={onSaveHardwareEntry}
            />
          ) : (
            <LibraryTab
              library={library}
              onDelete={onDeleteLibraryEntry}
              onSaveRate={onSaveRate}
              clearance={clearance}
              onSetClearance={onSetClearance}
              hardwareLibrary={hardwareLibrary}
              onDeleteHardwareEntry={onDeleteHardwareEntry}
            />
          )}
        </div>

        {/* Footer */}
        <div
          data-testid="bom-grand-total"
          className="flex items-center justify-between px-6 py-3 border-t border-border bg-muted/20"
        >
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>
              Boards:{' '}
              <span className="text-foreground">
                {boardSubtotal === 0 && !rows.some((r) => r.totalCost !== null)
                  ? '—'
                  : `$${boardSubtotal.toFixed(2)}`}
              </span>
            </span>
            <span className="text-border">|</span>
            <span>
              Dowels:{' '}
              <span className="text-foreground">
                {dowelSubtotal === 0 && !dowelRows.some((r) => r.totalCost !== null)
                  ? '—'
                  : `$${dowelSubtotal.toFixed(2)}`}
              </span>
            </span>
            <span className="text-border">|</span>
            <span>
              Hardware: <span className="text-foreground">${hardwareSubtotal.toFixed(2)}</span>
            </span>
            <span className="text-border">|</span>
            <span className="font-medium text-foreground">
              Grand total: ${grandTotal.toFixed(2)}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopy}
              disabled={tab === 'library' || tab === 'sheets'}
            >
              Copy CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownload}
              disabled={tab === 'library' || tab === 'sheets'}
            >
              Download .csv
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
