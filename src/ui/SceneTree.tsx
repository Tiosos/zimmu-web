import { useState } from 'react'
import { openingRect, validateCarcaseParams } from '../scene/carcaseRoles'
import { overridesOf, roleThicknessFor } from '../scene/resolveThickness'
import { sectionNodes, type SectionNode } from '../scene/sectionNodes'
import { sectionOpenings } from '../scene/sectionInterior'
import { resolveSections } from '../scene/sectionTree'
import type {
  CarcaseComponent,
  Component,
  ComponentId,
  MaterialDef,
  Part,
  PartId,
  Selection,
} from '../scene/types'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// px-2 in numbers, so nesting can add to it without fighting the class.
const ROW_PADDING = 8
const INDENT = 12

const ROW_CLASS = 'flex items-center gap-1.5 px-2 py-1.5 cursor-pointer select-none'
const LABEL_CLASS = 'flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs'
const ICON_BUTTON_CLASS = 'h-6 w-6 text-muted-foreground hover:text-foreground'

interface SceneTreeProps {
  components: Component[]
  parts: Part[]
  selection: Selection | null
  onSelect: (s: Selection | null) => void
  onToggleVisible: (s: Selection) => void
  errors: Map<PartId, string>
  pendingIds: Set<PartId>
  onDuplicate: (id: PartId) => void
  onRemove: (id: PartId) => void
  // A carcase's openings are resolved here, and a panel's thickness comes from its material.
  materials: Record<string, MaterialDef>
}

function VisibilityButton({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  const title = visible ? 'Hide' : 'Show'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title={title}
          className={ICON_BUTTON_CLASS}
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
        >
          {visible ? '●' : '○'}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  )
}

export function SceneTree({
  components,
  parts,
  selection,
  onSelect,
  onToggleVisible,
  errors,
  pendingIds,
  onDuplicate,
  onRemove,
  materials,
}: SceneTreeProps) {
  // Section ids share this set with component ids: a `sec_` id can never equal a `cmp_` one.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const renderPart = (part: Part, depth: number) => {
    const error = errors.get(part.id)
    const isPending = pendingIds.has(part.id)
    return (
      <div
        key={part.id}
        data-testid={`node-${part.id}`}
        data-driven={String(part.driven)}
        data-selected={String(selection?.kind === 'part' && selection.id === part.id)}
        className={cn(
          ROW_CLASS,
          selection?.kind === 'part' && selection.id === part.id
            ? 'bg-secondary'
            : 'hover:bg-secondary/50',
        )}
        style={{ paddingLeft: ROW_PADDING + depth * INDENT }}
        onClick={() => onSelect({ kind: 'part', id: part.id })}
      >
        {error ? (
          <span title={error} className="text-xs text-destructive-foreground">
            ⚠
          </span>
        ) : isPending ? (
          <span className="text-xs text-muted-foreground animate-spin inline-block">⟳</span>
        ) : (
          <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: part.color }} />
        )}
        <span
          className={cn(LABEL_CLASS, part.visible ? 'text-foreground' : 'text-muted-foreground')}
        >
          {part.label}
        </span>
        {part.parentId !== null && !part.driven && (
          // Only meaningful against an owner: a top-level board was never driven, so calling it
          // detached would be noise. Inside a component it matters — turning a role off and on
          // again leaves the user with their detached part *and* a fresh generated one.
          <span
            title="Detached — this part no longer follows its cabinet"
            className="text-[9px] uppercase tracking-wide text-amber-400/80 shrink-0"
          >
            detached
          </span>
        )}
        <VisibilityButton
          visible={part.visible}
          onToggle={() => onToggleVisible({ kind: 'part', id: part.id })}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              title="Duplicate"
              className={ICON_BUTTON_CLASS}
              onClick={(e) => {
                e.stopPropagation()
                onDuplicate(part.id)
              }}
            >
              ⧉
            </Button>
          </TooltipTrigger>
          <TooltipContent>Duplicate</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              title="Delete"
              className="h-6 w-6 text-muted-foreground hover:text-destructive-foreground"
              onClick={(e) => {
                e.stopPropagation()
                onRemove(part.id)
              }}
            >
              ✕
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
      </div>
    )
  }

  const renderComponent = (component: Component, depth: number) => {
    const open = !collapsed.has(component.id)
    return (
      <div key={component.id} data-testid={`subtree-${component.id}`}>
        <div
          data-testid={`node-${component.id}`}
          data-selected={String(selection?.kind === 'component' && selection.id === component.id)}
          className={cn(
            ROW_CLASS,
            selection?.kind === 'component' && selection.id === component.id
              ? 'bg-secondary'
              : 'hover:bg-secondary/50',
          )}
          style={{ paddingLeft: ROW_PADDING + depth * INDENT }}
          onClick={() => onSelect({ kind: 'component', id: component.id })}
        >
          <Button
            variant="ghost"
            size="icon"
            aria-label={`${open ? 'Collapse' : 'Expand'} ${component.label}`}
            className="h-4 w-4 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              toggleCollapsed(component.id)
            }}
          >
            {open ? '▾' : '▸'}
          </Button>
          <span className="text-xs">{component.kind === 'carcase' ? '🗄' : '🗂'}</span>
          <span
            className={cn(
              LABEL_CLASS,
              component.visible ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {component.label}
          </span>
          <VisibilityButton
            visible={component.visible}
            onToggle={() => onToggleVisible({ kind: 'component', id: component.id })}
          />
        </div>
        {open &&
          (component.kind === 'carcase'
            ? renderCarcaseChildren(component, depth + 1)
            : renderChildren(component.id, depth + 1))}
      </div>
    )
  }

  // A carcase's parts are grouped by the opening that owns them; everything else renders flat.
  // `openingRect` reads thicknesses through a resolver that is fatal by design, so a cabinet naming
  // a material the scene cannot resolve would throw here — an unbuildable one falls back to the
  // flat tree that existed before this rather than taking the whole tree down with it.
  const carcaseGroups = (component: CarcaseComponent, own: Part[]) => {
    const thicknessOf = roleThicknessFor(component.params, materials, overridesOf(own, component.id))
    if (validateCarcaseParams(component.params, thicknessOf).length > 0) return null
    const tree = resolveSections(
      component.params.section,
      openingRect(component.params, thicknessOf),
      (parentId, index) => thicknessOf(`division-${parentId}-${index}`),
    )
    return sectionNodes(sectionOpenings(component.params.section, tree), own)
  }

  const renderCarcaseChildren = (component: CarcaseComponent, depth: number) => {
    const own = parts.filter((p) => p.parentId === component.id)
    const groups = carcaseGroups(component, own)
    if (groups === null) return renderChildren(component.id, depth)
    return (
      <>
        {components.filter((c) => c.parentId === component.id).map((c) => renderComponent(c, depth))}
        {groups.sections.map((node, i) => renderSection(component, node, i, depth))}
        {groups.carcase.map((p) => renderPart(p, depth))}
      </>
    )
  }

  const renderSection = (
    component: CarcaseComponent,
    node: SectionNode,
    index: number,
    depth: number,
  ) => {
    const open = !collapsed.has(node.sectionId)
    const isSelected = selection?.kind === 'section' && selection.sectionId === node.sectionId
    return (
      <div key={node.sectionId} data-testid={`subtree-${node.sectionId}`}>
        <div
          data-testid={`node-${node.sectionId}`}
          data-selected={String(isSelected)}
          className={cn(ROW_CLASS, isSelected ? 'bg-secondary' : 'hover:bg-secondary/50')}
          style={{ paddingLeft: ROW_PADDING + depth * INDENT }}
          onClick={() =>
            onSelect({ kind: 'section', cabinetId: component.id, sectionId: node.sectionId })
          }
        >
          <Button
            variant="ghost"
            size="icon"
            aria-label={`${open ? 'Collapse' : 'Expand'} Opening ${index + 1}`}
            className="h-4 w-4 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              toggleCollapsed(node.sectionId)
            }}
          >
            {open ? '▾' : '▸'}
          </Button>
          <span className="text-xs">▤</span>
          <span className={cn(LABEL_CLASS, 'text-foreground')}>Opening {index + 1}</span>
        </div>
        {open && node.parts.map((p) => renderPart(p, depth + 1))}
      </div>
    )
  }

  const renderChildren = (parentId: ComponentId | null, depth: number) => (
    <>
      {components.filter((c) => c.parentId === parentId).map((c) => renderComponent(c, depth))}
      {parts.filter((p) => p.parentId === parentId).map((p) => renderPart(p, depth))}
    </>
  )

  return renderChildren(null, 0)
}
