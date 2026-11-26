import { useRef, type KeyboardEvent } from 'react'
import type { CabinetTab } from './CabinetEditor'
import { CABINET_TAB_GROUPS, ALL_CABINET_TABS } from './cabinetTabGroups'

/**
 * The four structural groups of the sixteen cabinet tabs (S2 shell). Presentational only: it
 * reports a click upward and leaves tab state and all scene data to App and CabinetEditor.
 */
export function CabinetGroupNav({
  active,
  onTabChange,
}: {
  active: CabinetTab
  onTabChange: (t: CabinetTab) => void
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const indexOf = (tab: CabinetTab) => ALL_CABINET_TABS.indexOf(tab) + 1
  // One tab stop for the sixteen tabs: arrows move within the group, Home/End jump to the ends.
  // The window-level mode shortcuts must not see these keys, so the event stops here.
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, at: number) => {
    let next: number
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (at + 1) % ALL_CABINET_TABS.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (at - 1 + ALL_CABINET_TABS.length) % ALL_CABINET_TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = ALL_CABINET_TABS.length - 1
    else return
    e.preventDefault()
    e.stopPropagation()
    onTabChange(ALL_CABINET_TABS[next])
    buttons.current[next]?.focus()
  }
  return (
    <nav className="zim-cep-nav" aria-label="Cabinet editor tabs">
      {CABINET_TAB_GROUPS.map((g) => (
        <div className="zim-cep-group" key={g.group}>
          <div className="zim-cep-glabel">{g.group}</div>
          {g.tabs.map((t) => {
            const on = active === t.id
            const at = indexOf(t.id) - 1
            return (
              <button
                key={t.id}
                ref={(el) => {
                  buttons.current[at] = el
                }}
                type="button"
                tabIndex={on ? 0 : -1}
                className={`zim-cep-tab ${on ? 'on' : ''}`}
                aria-current={on ? 'true' : undefined}
                onClick={() => onTabChange(t.id)}
                onKeyDown={(e) => onKeyDown(e, at)}
                title={`${t.label} · ${indexOf(t.id)} of 16 · arrow keys to move`}
              >
                <span className="zim-cep-ticon" aria-hidden="true">{t.icon}</span>
                <span className="zim-cep-tlabel">{t.label}</span>
                <span className="zim-cep-tnum" aria-hidden="true">{indexOf(t.id)}</span>
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
