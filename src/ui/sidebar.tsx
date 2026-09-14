import type {
  CutDef,
  CutId,
  Joint,
  Part,
  PartId,
  Scene,
  Selection,
  ComponentId,
  Component,
  CarcaseParams,
  SectionId,
} from '../scene/types'
import type { DowelCutTool } from '../scene/useAddCut'
import type { JointSuggestion } from '../scene/suggestJoints'
import type { InteractionMode, UseInteractionModeResult } from '../scene/useInteractionMode'
import { EditPanel } from './EditPanel'
import { CarcasePanel } from './CarcasePanel'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { CARCASE_PRESETS, type CarcasePreset } from '../scene/carcasePresets'
import { SceneTree } from './SceneTree'
import { SceneSuggestionsPanel } from './SceneSuggestionsPanel'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TooltipProvider } from '@/components/ui/tooltip'

interface SidebarProps {
  scene: Scene
  occtReady: boolean
  errors: Map<PartId, string>
  pendingIds: Set<PartId>
  nextLabel: string
  onAdd: (kind: 'board' | 'cylinder') => void
  onAddComponent: (parentId: ComponentId | null) => void
  onAddCarcase: (preset: CarcasePreset) => void
  parameterFor: (
    id: PartId,
    dimension: 'length' | 'width' | 'thickness',
  ) => keyof CarcaseParams | null
  onDetachPart: (id: PartId, updater?: (p: Part) => Part) => void
  onUpdateComponent: (id: ComponentId, updater: (c: Component) => Component) => void
  onRemove: (id: PartId) => void
  onDuplicate: (id: PartId) => void
  onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel?: string) => void
  onUpdateCut: (partId: PartId, cutId: CutId, updater: (c: CutDef) => CutDef) => void
  onAddMitre: (partId: PartId) => void
  onRemoveCut: (partId: PartId, cutId: CutId) => void
  onLinkCuts: (partIdA: PartId, cutIdA: CutId, partIdB: PartId, cutIdB: CutId) => void
  onUnlinkCuts: (partId: PartId, cutId: CutId) => void
  lastPlacedCutId: CutId | null
  selection: Selection | null
  // Which section the elevation has selected. The sidebar reads it rather than holding a second
  // pick: two ways to choose an opening is one way to choose the wrong one.
  selectedSectionId: SectionId | null
  onSelect: (s: Selection | null) => void
  activeMode: InteractionMode
  onSetMode: (mode: InteractionMode) => void
  statuses: UseInteractionModeResult['statuses']
  snapPhase: 'idle' | 'source-picked'
  onToggleVisible: (s: Selection) => void
  dowelTool: DowelCutTool | null
  armDowelTool: (tool: DowelCutTool) => void
  onUpdateJoint: (jointId: string, updater: (j: Joint) => Joint) => void
  onRemoveJoint: (jointId: string) => void
  suggestions: JointSuggestion[]
  sceneSuggestions: JointSuggestion[]
  onApplySuggestion: (s: JointSuggestion) => void
  onHoverSuggestion: (s: JointSuggestion | null) => void
  onHoverPair: (ids: [PartId, PartId] | null) => void
}

export function Sidebar({
  scene,
  occtReady,
  errors,
  pendingIds,
  nextLabel,
  onAdd,
  onAddComponent,
  onAddCarcase,
  parameterFor,
  onDetachPart,
  onUpdateComponent,
  onRemove,
  onDuplicate,
  onUpdate,
  onUpdateCut,
  onAddMitre,
  onRemoveCut,
  onLinkCuts,
  onUnlinkCuts,
  lastPlacedCutId,
  selection,
  selectedSectionId,
  onSelect,
  activeMode,
  onSetMode,
  statuses,
  snapPhase,
  onToggleVisible,
  dowelTool,
  armDowelTool,
  onUpdateJoint,
  onRemoveJoint,
  suggestions,
  sceneSuggestions,
  onApplySuggestion,
  onHoverSuggestion,
  onHoverPair,
}: SidebarProps) {
  const selectedPart =
    selection?.kind === 'part' ? (scene.parts.find((p) => p.id === selection.id) ?? null) : null
  const selectedComponent =
    selection?.kind === 'component'
      ? (scene.components.find((c) => c.id === selection.id) ?? null)
      : null
  // A section belongs to a cabinet, so picking an opening must not unmount the panel that holds its
  // shelving and front controls. Resolved through `cabinetId` — the obligation `Selection` states.
  const hostComponent =
    selection?.kind === 'section'
      ? (scene.components.find((c) => c.id === selection.cabinetId) ?? null)
      : selectedComponent
  const selectedCarcase = hostComponent?.kind === 'carcase' ? hostComponent : null

  return (
    <TooltipProvider delayDuration={300}>
      <div className="w-60 h-full bg-card border-l border-border flex flex-col flex-shrink-0">
        {/* Mode buttons */}
        <div className="p-2 pb-0 flex flex-col gap-1">
          <Button
            variant={activeMode === 'cut' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => onSetMode('cut')}
            className={`w-full text-xs h-8 ${activeMode === 'cut' ? 'border-blue-700/50 text-blue-300' : 'text-muted-foreground'}`}
          >
            {activeMode === 'cut' ? 'Adding Cut' : 'Add Cut'}
          </Button>
          <Button
            variant={activeMode === 'snap' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => onSetMode('snap')}
            className={`w-full text-xs h-auto py-1.5 flex flex-col gap-0.5 ${activeMode === 'snap' ? 'border-green-700/50 text-green-300' : 'text-muted-foreground'}`}
          >
            <span>{activeMode === 'snap' ? 'Snapping' : 'Snap faces'}</span>
            {activeMode === 'snap' && (
              <span className="text-[10px] text-muted-foreground font-normal">
                {snapPhase === 'idle'
                  ? 'Click a face · Esc to cancel'
                  : 'Click target face · Esc to cancel'}
              </span>
            )}
          </Button>
          <Button
            variant={activeMode === 'dado' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => onSetMode('dado')}
            className={`w-full text-xs h-auto py-1.5 flex flex-col gap-0.5 ${activeMode === 'dado' ? 'border-amber-700/50 text-amber-300' : 'text-muted-foreground'}`}
          >
            <span>{activeMode === 'dado' ? 'Dado joint' : 'Add Dado'}</span>
            {activeMode === 'dado' && (
              <span className="text-[10px] text-muted-foreground font-normal">
                {statuses.dado ?? 'Click housing face, then housed end · Esc to cancel'}
              </span>
            )}
          </Button>
          <Button
            variant={activeMode === 'halflap' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => onSetMode('halflap')}
            className={`w-full text-xs h-auto py-1.5 flex flex-col gap-0.5 ${activeMode === 'halflap' ? 'border-amber-700/50 text-amber-300' : 'text-muted-foreground'}`}
          >
            <span>{activeMode === 'halflap' ? 'Half-lap joint' : 'Add Half-lap'}</span>
            {activeMode === 'halflap' && (
              <span className="text-[10px] text-muted-foreground font-normal">
                {statuses.halflap ?? 'Click first board, then second board · Esc to cancel'}
              </span>
            )}
          </Button>
          <Button
            variant={activeMode === 'mortiseTenon' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => onSetMode('mortiseTenon')}
            className={`w-full text-xs h-auto py-1.5 flex flex-col gap-0.5 ${activeMode === 'mortiseTenon' ? 'border-amber-700/50 text-amber-300' : 'text-muted-foreground'}`}
          >
            <span>{activeMode === 'mortiseTenon' ? 'Mortise & tenon' : 'Add Mortise & tenon'}</span>
            {activeMode === 'mortiseTenon' && (
              <span className="text-[10px] text-muted-foreground font-normal">
                {statuses.mortiseTenon ?? 'Click mortise board, then tenon board · Esc to cancel'}
              </span>
            )}
          </Button>
          <Button
            variant={activeMode === 'finger' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => onSetMode('finger')}
            className={`w-full text-xs h-auto py-1.5 flex flex-col gap-0.5 ${activeMode === 'finger' ? 'border-amber-700/50 text-amber-300' : 'text-muted-foreground'}`}
          >
            <span>{activeMode === 'finger' ? 'Finger joint' : 'Add Finger joint'}</span>
            {activeMode === 'finger' && (
              <span className="text-[10px] text-muted-foreground font-normal">
                {statuses.finger ?? 'Click first board, then second board · Esc to cancel'}
              </span>
            )}
          </Button>
          <Button
            variant={activeMode === 'tongueGroove' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => onSetMode('tongueGroove')}
            className={`w-full text-xs h-auto py-1.5 flex flex-col gap-0.5 ${activeMode === 'tongueGroove' ? 'border-amber-700/50 text-amber-300' : 'text-muted-foreground'}`}
          >
            <span>{activeMode === 'tongueGroove' ? 'Tongue & groove' : 'Add Tongue & groove'}</span>
            {activeMode === 'tongueGroove' && (
              <span className="text-[10px] text-muted-foreground font-normal">
                {statuses.tongueGroove ?? 'Click groove edge, then tongue edge · Esc to cancel'}
              </span>
            )}
          </Button>
        </div>

        {/* min-h keeps the tree reachable: a cabinet makes the edit panel tall enough to
            squeeze a `flex-1` scroll area to nothing in a short window. */}
        <ScrollArea className="flex-1 min-h-32">
          {scene.parts.length === 0 && scene.components.length === 0 ? (
            <p className="p-4 text-muted-foreground text-xs text-center">
              No parts — add a part to start
            </p>
          ) : (
            <SceneTree
              components={scene.components}
              parts={scene.parts}
              selection={selection}
              onSelect={onSelect}
              onToggleVisible={onToggleVisible}
              errors={errors}
              pendingIds={pendingIds}
              onDuplicate={onDuplicate}
              onRemove={onRemove}
              materials={scene.materials}
            />
          )}
        </ScrollArea>

        {/* Parameter panel for a selected carcase — a cabinet is edited by its parameters,
            not by its generated boards. */}
        {selectedCarcase && (
          <CarcasePanel
            key={selectedCarcase.id}
            component={selectedCarcase}
            materials={scene.materials}
            parts={scene.parts}
            components={scene.components}
            onUpdate={(updater) => onUpdateComponent(selectedCarcase.id, updater)}
            onUpdateComponent={onUpdateComponent}
            selectedSectionId={selectedSectionId}
          />
        )}

        {/* Edit panel for selected part */}
        {selectedPart && (
          <EditPanel
            key={selectedPart.id}
            part={selectedPart}
            onUpdate={onUpdate}
            onRemove={onRemove}
            onUpdateCut={onUpdateCut}
            onAddMitre={onAddMitre}
            onRemoveCut={onRemoveCut}
            onLinkCuts={onLinkCuts}
            onUnlinkCuts={onUnlinkCuts}
            lastPlacedCutId={lastPlacedCutId}
            scene={scene}
            nextLabel={nextLabel}
            dowelTool={dowelTool}
            armDowelTool={armDowelTool}
            onUpdateJoint={onUpdateJoint}
            onRemoveJoint={onRemoveJoint}
            suggestions={suggestions}
            onApplySuggestion={onApplySuggestion}
            onHoverSuggestion={onHoverSuggestion}
            parameterFor={parameterFor}
            onDetachPart={onDetachPart}
            onUpdateComponent={onUpdateComponent}
          />
        )}

        {/* Scene-wide suggestions — outside EditPanel, since they belong to no single part
            and must stay reachable with nothing selected. */}
        <SceneSuggestionsPanel
          suggestions={sceneSuggestions}
          scene={scene}
          onApply={onApplySuggestion}
          onHoverSuggestion={onHoverSuggestion}
          onHoverPair={onHoverPair}
        />

        {/* Add part footer */}
        <div className="p-2 border-t border-border flex gap-1">
          <Button
            onClick={() => onAdd('board')}
            disabled={!occtReady}
            title={!occtReady ? 'Loading geometry engine…' : undefined}
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
          >
            + Board
          </Button>
          <Button
            onClick={() => onAddComponent(null)}
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
          >
            + Group
          </Button>
          <Select
            value=""
            onValueChange={(name) => {
              const preset = CARCASE_PRESETS.find((p) => p.name === name)
              if (preset) onAddCarcase(preset)
            }}
          >
            <SelectTrigger
              aria-label="Add cabinet"
              className="h-8 flex-1 text-xs justify-center gap-1"
            >
              + Cabinet
            </SelectTrigger>
            <SelectContent>
              {CARCASE_PRESETS.map((p) => (
                <SelectItem key={p.name} value={p.name}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => onAdd('cylinder')}
            disabled={!occtReady}
            title={!occtReady ? 'Loading geometry engine…' : undefined}
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
          >
            + Dowel
          </Button>
        </div>
      </div>
    </TooltipProvider>
  )
}
