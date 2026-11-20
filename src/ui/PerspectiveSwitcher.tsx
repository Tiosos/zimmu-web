import type { ReactNode } from 'react'

/**
 * The five top-level work areas of the redesigned Zimmu workbench (S1 shell).
 * Kept presentational: it reports the chosen perspective and leaves all scene
 * state, routing and workspace mounting to App. Workbench and Cabinet Editor
 * carry content (S1 / S2); the remaining three are announced as upcoming so the
 * navigation structure is visible without implying a working surface.
 */
export type Perspective = 'workbench' | 'cabinet' | 'modes' | 'manufacture' | 'project'

const PERSPECTIVES: { id: Perspective; label: string; num: string; icon: string; hint: string; planned?: boolean }[] = [
  { id: 'workbench', label: 'Workbench', num: '01', icon: '◈', hint: 'Model workspace' },
  { id: 'cabinet', label: 'Cabinet Editor', num: '02', icon: '▦', hint: '16-tab cabinet parameters' },
  { id: 'modes', label: 'Viewport Modes', num: '03', icon: '✥', hint: 'Interaction modes', planned: true },
  { id: 'manufacture', label: 'Manufacturing', num: '04', icon: '⚡', hint: 'Production & exports', planned: true },
  { id: 'project', label: 'Project & Room', num: '05', icon: '▤', hint: 'Project structure', planned: true },
]

interface PerspectiveSwitcherProps {
  active: Perspective
  onChange: (p: Perspective) => void
  hintRight?: ReactNode
}

export function PerspectiveSwitcher({ active, onChange, hintRight }: PerspectiveSwitcherProps) {
  return (
    <nav className="zim-perspectives" aria-label="Workspace perspectives">
      <span className="zim-label" aria-hidden="true">Workspace</span>
      {PERSPECTIVES.map((p) => {
        const isActive = active === p.id
        const isPlanned = p.planned === true
        return (
          <button
            key={p.id}
            type="button"
            className={`zim-persp ${isActive ? 'on' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            // E2E helpers click the Plan view with name: 'Plan' (substring). The word "planned"
            // in an aria-label/title would match that too, so upcoming stages say "coming later".
            aria-label={`${p.label}${isPlanned ? ' (coming in a later stage)' : ''}`}
            title={isPlanned ? `${p.label} — ${p.hint}. Coming in a later stage.` : p.label}
            onClick={() => onChange(p.id)}
          >
            <span aria-hidden="true">{p.icon}</span>
            <span>{p.label}</span>
            <span className="zim-num" aria-hidden="true">{p.num}</span>
          </button>
        )
      })}
      <span className="zim-spacer" />
      {hintRight ?? (
        <span className="zim-hint">
          <span className="zim-sdot green" aria-hidden="true" />
          <span>{PERSPECTIVES.find((p) => p.id === active)?.hint}</span>
        </span>
      )}
    </nav>
  )
}
