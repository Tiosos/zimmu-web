import type { Perspective } from './PerspectiveSwitcher'

const CONTENT: Record<Exclude<Perspective, 'workbench'>, { title: string; stage: string; body: string; items: string[] }> = {
  cabinet: {
    title: 'Cabinet Editor',
    stage: 'Stage S2',
    body: 'A dedicated surface for the sixteen parametric cabinet tabs, with grouped navigation and a live preview. The tab order already matches the existing CabinetEditor component.',
    items: ['16 parameter tabs', 'Grouped navigation', 'Live front-elevation preview', 'Exploded and section views'],
  },
  modes: {
    title: 'Viewport Modes',
    stage: 'Stage S3',
    body: 'A reference surface for all interaction modes. The seven real interaction modes keep the verified keyboard map; tool and display modes are promoted in a later stage.',
    items: ['7 interaction modes with F/C/J/L/M/B/T', 'Step-by-step overlays', 'Live gizmo readouts', '8 tool / display modes'],
  },
  manufacture: {
    title: 'Manufacturing',
    stage: 'Stage S4',
    body: 'A production dashboard grouping readiness, cutting lists, drawings, packets and release review into one workflow surface.',
    items: ['Readiness triage', 'BOM & nesting', 'Shop drawings', 'Production packet & verification'],
  },
  project: {
    title: 'Project & Room',
    stage: 'Stage S5',
    body: 'Project structure, room geometry, installation assessment and service points in one place.',
    items: ['Project tree', 'Dimensioned room plan', 'Installation assessment', 'Services & clearances'],
  },
}

/** Placeholder for perspectives scheduled for later implementation stages. */
export function PlannedPerspective({ perspective }: { perspective: Exclude<Perspective, 'workbench'> }) {
  const c = CONTENT[perspective]
  return (
    <section
      className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 p-8 overflow-auto"
      aria-label={`${c.title} (planned)`}
    >
      <div className="max-w-xl text-center space-y-3">
        <span className="badge" style={{ background: 'hsl(var(--primary) / 0.14)', color: 'hsl(var(--primary))' }}>
          {c.stage}
        </span>
        <h2 className="text-xl font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{c.title}</h2>
        <p className="text-xs leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>{c.body}</p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {c.items.map((item) => (
            <span
              key={item}
              className="text-[11px] px-2.5 py-1 rounded"
              style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
            >
              {item}
            </span>
          ))}
        </div>
        <p className="text-[10px] pt-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
          See ui-redesign/DESIGN-SIGNOFF.md for the full specification.
        </p>
      </div>
    </section>
  )
}
