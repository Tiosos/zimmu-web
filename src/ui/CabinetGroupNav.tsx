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
  const indexOf = (t: CabinetTab) => ALL_CABINET_TABS.indexOf(t) + 1
  return (
    <nav className="zim-cep-nav" aria-label="Cabinet editor tabs">
      {CABINET_TAB_GROUPS.map((g) => (
        <div className="zim-cep-group" key={g.group}>
          <div className="zim-cep-glabel">{g.group}</div>
          {g.tabs.map((t) => {
            const on = active === t.id
            return (
              <button
                key={t.id}
                type="button"
                className={`zim-cep-tab ${on ? 'on' : ''}`}
                aria-current={on ? 'true' : undefined}
                onClick={() => onTabChange(t.id)}
                title={`${t.label} · ${indexOf(t.id)} of 16`}
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
