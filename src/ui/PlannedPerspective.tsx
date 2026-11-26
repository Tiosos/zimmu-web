import type { Perspective } from './PerspectiveSwitcher'

const CONTENT: Record<Extract<Perspective, 'project'>, { title: string; stage: string; body: string; items: string[] }> = {
  project: {
    title: 'Project & Room',
    stage: 'Stage S5',
    body: 'Project structure, room geometry, installation assessment and service points in one place.',
    items: ['Project tree', 'Dimensioned room plan', 'Installation assessment', 'Services & clearances'],
  },
}

/** Placeholder for perspectives scheduled for later implementation stages. */
export function PlannedPerspective({ perspective }: { perspective: Extract<Perspective, 'project'> }) {
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
