import { useState } from 'react'
import type { InteractionMode } from '../scene/useInteractionMode'
import {
  MODES, MODE_GROUPS, ALL_MODE_IDS,
  type ViewportModeSpec,
} from './viewportModeData'

/**
 * S3 shell for the Viewport Modes perspective (DESIGN-SIGNOFF.md §5).
 *
 * IMPORTANT — the 3D Viewport is NOT a child of these panels. It stays mounted at one stable DOM
 * position owned by App (key="viewport-host"), because viewport.tsx builds its renderer, camera and
 * meshes in a mount-once effect. These panels are flex siblings placed around that host, so
 * switching into/out of this perspective never tears the renderer down.
 *
 * Class A modes are activated by App through the real useInteractionMode.setMode. Class B modes
 * invoke a real tool action where one exists; advisory modes expose no Apply and state their limit.
 */

export function ViewportModesNav({
  activeId,
  onSelectMode,
  activeInteraction,
}: {
  activeId: string
  onSelectMode: (id: string) => void
  activeInteraction: InteractionMode
}) {
  return (
    <nav className="zim-vm-nav" aria-label="Viewport mode list">
      {MODE_GROUPS.map((g) => (
        <div className="zim-vm-group" key={g.group}>
          <div className="zim-vm-glabel">
            {g.group}
            <span className="zim-vm-gclass">{g.group === 'Joinery' ? 'joint' : 'tool'}</span>
          </div>
          {g.ids.map((id) => {
            const m = MODES[id]
            const on = activeId === id
            const activeReal = m.interactionMode && activeInteraction === m.interactionMode
            return (
              <button
                key={id}
                type="button"
                className={`zim-vm-mode ${on ? 'on' : ''}`}
                aria-current={on ? 'true' : undefined}
                onClick={() => onSelectMode(id)}
                title={m.description}
              >
                <span className={`zim-vm-badge ${m.modeClass === 'A' ? 'a' : 'b'}`}
                  aria-label={m.modeClass === 'A' ? 'Interaction mode' : 'Tool mode'}>
                  {m.modeClass}
                </span>
                <span className="zim-vm-mname">{m.name}</span>
                {m.key && <kbd className="zim-vm-key">{m.key}</kbd>}
                {activeReal && <span className="zim-vm-live" aria-label="Mode active">●</span>}
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

/** Small overlay pinned over the viewport host; purely informational. */
export function ViewportModesOverlay({ activeId }: { activeId: string }) {
  const spec: ViewportModeSpec = MODES[activeId] ?? MODES.select
  return (
    <div className="zim-vm-overlay" aria-hidden="true">
      <span className="zim-vm-mode-tag">{spec.name}</span>
      <span className="zim-vm-class-tag">Class {spec.modeClass} · {spec.wiring}</span>
    </div>
  )
}

/**
 * Stateful body for one mode. Keyed by activeId in ViewportModesPanel so selecting a mode remounts
 * this subtree — that resets the step indicator and Apply feedback (FR-VM-01) with no effect and no
 * ref writes during render, both of which the repo's react-hooks lint rules forbid.
 */
function PanelBody({
  spec,
  onActivateInteraction,
  onToolAction,
  interactionStatus,
}: {
  spec: ViewportModeSpec
  onActivateInteraction: (mode: InteractionMode) => void
  onToolAction: (id: string) => void
  interactionStatus: string | null
}) {
  const [step, setStep] = useState(0)
  const [applied, setApplied] = useState(false)

  const isClassA = spec.modeClass === 'A'
  const canApply = spec.wiring === 'wired'

  const apply = () => {
    if (!canApply) return
    if (isClassA && spec.interactionMode) onActivateInteraction(spec.interactionMode)
    else onToolAction(spec.id)
    setApplied(true)
    window.setTimeout(() => setApplied(false), 1600)
  }

  return (
    <aside className="zim-vm-side" aria-label="Mode parameters">
      <div className="zim-vm-side-head">
        <span>{spec.name}</span>
        <span className="zim-vm-side-count">{ALL_MODE_IDS.indexOf(spec.id) + 1} / 15</span>
      </div>

      <div className="zim-vm-steps" aria-label="Workflow steps">
        <div className="zim-vm-steps-h">
          <span className={`zim-vm-pill ${isClassA ? 'a' : 'b'}`}>{isClassA ? `KEY ${spec.key}` : 'TOOL'}</span>
          <b>{spec.name}</b>
        </div>
        <ol>
          {spec.steps.map((s, i) => (
            <li key={i} className={i === step ? 'cur' : i < step ? 'done' : ''} onClick={() => setStep(i)}>
              <span className="zim-vm-num">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="zim-vm-side-body">
        <p className="zim-vm-desc">{spec.description}</p>
        <div className="zim-vm-sec">Parameters</div>
        <div className="zim-vm-params">
          {spec.params.map((p) => (
            <div className="zim-vm-param" key={p.label}>
              <span>{p.label}</span>
              {p.editable ? (
                <input className="zim-vm-input" defaultValue={p.value} aria-label={`${spec.name} ${p.label}`} />
              ) : (
                <span className="zim-vm-val">{p.value}</span>
              )}
            </div>
          ))}
        </div>
        <div className="zim-vm-sec">Live state</div>
        <div className="zim-vm-readout">{spec.liveState}</div>
        <div className="zim-vm-sec">Gizmo / readout</div>
        <div className="zim-vm-readout mono">{spec.gizmo}</div>
        {interactionStatus && <div className="zim-vm-status">{interactionStatus}</div>}
        {spec.advisory && (
          <div className="zim-vm-advisory" role="note">
            <b>Advisory</b>
            <span>{spec.advisory}</span>
          </div>
        )}
      </div>

      <div className="zim-vm-foot">
        {canApply ? (
          <button type="button" className="zim-vm-apply" onClick={apply}>
            {applied ? 'Applied ✓' : isClassA ? 'Activate Mode' : 'Apply to Model'}
          </button>
        ) : (
          <button type="button" className="zim-vm-apply disabled" disabled aria-disabled="true">
            Not available in 3D yet
          </button>
        )}
        <span className="zim-vm-foot-note">
          {canApply ? 'Commits to the real scene / undo history' : 'Reference only — see advisory'}
        </span>
      </div>
    </aside>
  )
}

export function ViewportModesPanel({
  activeId,
  onActivateInteraction,
  onToolAction,
  interactionStatus,
}: {
  activeId: string
  onActivateInteraction: (mode: InteractionMode) => void
  onToolAction: (id: string) => void
  interactionStatus: string | null
}) {
  const spec: ViewportModeSpec = MODES[activeId] ?? MODES.select
  return (
    <PanelBody
      key={activeId}
      spec={spec}
      onActivateInteraction={onActivateInteraction}
      onToolAction={onToolAction}
      interactionStatus={interactionStatus}
    />
  )
}
