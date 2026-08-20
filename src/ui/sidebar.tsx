import type { CutDef, CutId, Joint, Part, PartId, Scene, Selection } from '../scene/types'
import type { DowelCutTool } from '../scene/useAddCut'
import type { JointSuggestion } from '../scene/suggestJoints'
import { EditPanel } from './EditPanel'
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
  onSelect: (s: Selection | null) => void
  snapActive: boolean
  snapPhase: 'idle' | 'source-picked'
  onSnapToggle: () => void
  cutActive: boolean
  onCutToggle: () => void
  onToggleVisible: (s: Selection) => void
  dowelTool: DowelCutTool | null
  armDowelTool: (tool: DowelCutTool) => void
  onUpdateJoint: (jointId: string, updater: (j: Joint) => Joint) => void
  onRemoveJoint: (jointId: string) => void
  jointActive: boolean
  onJointToggle: () => void
  jointStatus: string | null
  halfLapActive: boolean
  onHalfLapToggle: () => void
  halfLapStatus: string | null
  mortiseTenonActive: boolean
  onMortiseTenonToggle: () => void
  mortiseTenonStatus: string | null
  fingerJointActive: boolean
  onFingerJointToggle: () => void
  fingerJointStatus: string | null
  tongueGrooveActive: boolean
  onTongueGrooveToggle: () => void
  tongueGrooveStatus: string | null
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
  onSelect,
  snapActive,
  snapPhase,
  onSnapToggle,
  cutActive,
  onCutToggle,
  onToggleVisible,
  dowelTool,
  armDowelTool,
  onUpdateJoint,
  onRemoveJoint,
  jointActive,
  onJointToggle,
  jointStatus,
  halfLapActive,
  onHalfLapToggle,
  halfLapStatus,
  mortiseTenonActive,
  onMortiseTenonToggle,
  mortiseTenonStatus,
  fingerJointActive,
  onFingerJointToggle,
  fingerJointStatus,
  tongueGrooveActive,
  onTongueGrooveToggle,
  tongueGrooveStatus,
  suggestions,
  sceneSuggestions,
  onApplySuggestion,
  onHoverSuggestion,
  onHoverPair,
}: SidebarProps) {
  const selectedPart =
    selection?.kind === 'part' ? (scene.parts.find((p) => p.id === selection.id) ?? null) : null

  return (
    <TooltipProvider delayDuration={300}>
      <div className="w-60 h-full bg-card border-l border-border flex flex-col flex-shrink-0">
        {/* Mode buttons */}
        <div className="p-2 pb-0 flex flex-col gap-1">
          <Button
            variant={cutActive ? 'secondary' : 'outline'}
            size="sm"
            onClick={onCutToggle}
            className={`w-full text-xs h-8 ${cutActive ? 'border-blue-700/50 text-blue-300' : 'text-muted-foreground'}`}
          >
            {cutActive ? 'Adding Cut' : 'Add Cut'}
          </Button>
          <Button
            variant={snapActive ? 'secondary' : 'outline'}
            size="sm"
            onClick={onSnapToggle}
            className={`w-full text-xs h-auto py-1.5 flex flex-col gap-0.5 ${snapActive ? 'border-green-700/50 text-green-300' : 'text-muted-foreground'}`}
          >
            <span>{snapActive ? 'Snapping' : 'Snap faces'}</span>
            {snapActive && (
              <span className="text-[10px] text-muted-foreground font-normal">
                {snapPhase === 'idle'
                  ? 'Click a face · Esc to cancel'
                  : 'Click target face · Esc to cancel'}
              </span>
            )}
          </Button>
          <Button
            variant={jointActive ? 'secondary' : 'outline'}
            size="sm"
            onClick={onJointToggle}
            className={`w-full text-xs h-auto py-1.5 flex flex-col gap-0.5 ${jointActive ? 'border-amber-700/50 text-amber-300' : 'text-muted-foreground'}`}
          >
            <span>{jointActive ? 'Dado joint' : 'Add Dado'}</span>
            {jointActive && (
              <span className="text-[10px] text-muted-foreground font-normal">
                {jointStatus ?? 'Click housing face, then housed end · Esc to cancel'}
              </span>
            )}
          </Button>
          <Button
            variant={halfLapActive ? 'secondary' : 'outline'}
            size="sm"
            onClick={onHalfLapToggle}
            className={`w-full text-xs h-auto py-1.5 flex flex-col gap-0.5 ${halfLapActive ? 'border-amber-700/50 text-amber-300' : 'text-muted-foreground'}`}
          >
            <span>{halfLapActive ? 'Half-lap joint' : 'Add Half-lap'}</span>
            {halfLapActive && (
              <span className="text-[10px] text-muted-foreground font-normal">
                {halfLapStatus ?? 'Click first board, then second board · Esc to cancel'}
              </span>
            )}
          </Button>
          <Button
            variant={mortiseTenonActive ? 'secondary' : 'outline'}
            size="sm"
            onClick={onMortiseTenonToggle}
            className={`w-full text-xs h-auto py-1.5 flex flex-col gap-0.5 ${mortiseTenonActive ? 'border-amber-700/50 text-amber-300' : 'text-muted-foreground'}`}
          >
            <span>{mortiseTenonActive ? 'Mortise & tenon' : 'Add Mortise & tenon'}</span>
            {mortiseTenonActive && (
              <span className="text-[10px] text-muted-foreground font-normal">
                {mortiseTenonStatus ?? 'Click mortise board, then tenon board · Esc to cancel'}
              </span>
            )}
          </Button>
          <Button
            variant={fingerJointActive ? 'secondary' : 'outline'}
            size="sm"
            onClick={onFingerJointToggle}
            className={`w-full text-xs h-auto py-1.5 flex flex-col gap-0.5 ${fingerJointActive ? 'border-amber-700/50 text-amber-300' : 'text-muted-foreground'}`}
          >
            <span>{fingerJointActive ? 'Finger joint' : 'Add Finger joint'}</span>
            {fingerJointActive && (
              <span className="text-[10px] text-muted-foreground font-normal">
                {fingerJointStatus ?? 'Click first board, then second board · Esc to cancel'}
              </span>
            )}
          </Button>
          <Button
            variant={tongueGrooveActive ? 'secondary' : 'outline'}
            size="sm"
            onClick={onTongueGrooveToggle}
            className={`w-full text-xs h-auto py-1.5 flex flex-col gap-0.5 ${tongueGrooveActive ? 'border-amber-700/50 text-amber-300' : 'text-muted-foreground'}`}
          >
            <span>{tongueGrooveActive ? 'Tongue & groove' : 'Add Tongue & groove'}</span>
            {tongueGrooveActive && (
              <span className="text-[10px] text-muted-foreground font-normal">
                {tongueGrooveStatus ?? 'Click groove edge, then tongue edge · Esc to cancel'}
              </span>
            )}
          </Button>
        </div>

        <ScrollArea className="flex-1">
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
            />
          )}
        </ScrollArea>

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
