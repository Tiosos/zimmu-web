import { useState } from 'react'
import type { Component, ComponentId, Part, PartId, Selection } from '../scene/types'
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
}: SceneTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<ComponentId>>(new Set())

  const toggleCollapsed = (id: ComponentId) =>
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
        {open && renderChildren(component.id, depth + 1)}
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
