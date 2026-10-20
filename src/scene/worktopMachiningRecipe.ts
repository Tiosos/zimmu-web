export interface WorktopFeature {
  id: string
  label: string
  shape: 'rectangle' | 'circle'
  mode: 'through' | 'blind'
  length: number
  width: number
  diameter: number
  depth: number
  xRef: 'left' | 'centre' | 'right'
  yRef: 'front' | 'centre' | 'rear'
  x: number
  y: number
  clearance: number
}
export interface WorktopMachining {
  version: 1
  features: WorktopFeature[]
}
export function worktopMachiningError(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return 'Worktop machining must be an object.'
  const recipe = value as Record<string, unknown>
  if (recipe.version !== 1) return 'Unsupported worktop machining version.'
  if (!Array.isArray(recipe.features) || recipe.features.length > 100)
    return 'Use a feature list with at most 100 items.'
  const ids = new Set<string>()
  for (const value of recipe.features) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return 'Each feature must be an object.'
    const f = value as Record<string, unknown>
    if (typeof f.id !== 'string' || !f.id.trim() || ids.has(f.id))
      return 'Feature IDs must be nonempty and unique.'
    ids.add(f.id)
    if (typeof f.label !== 'string' || !f.label.trim()) return 'Name every feature.'
    if (
      !['rectangle', 'circle'].includes(f.shape as string) ||
      !['through', 'blind'].includes(f.mode as string)
    )
      return 'Choose a supported shape and depth mode.'
    if (
      !['left', 'centre', 'right'].includes(f.xRef as string) ||
      !['front', 'centre', 'rear'].includes(f.yRef as string)
    )
      return 'Choose supported position references.'
    for (const key of ['length', 'width', 'diameter', 'depth', 'x', 'y', 'clearance'])
      if (typeof f[key] !== 'number' || !Number.isFinite(f[key]))
        return 'Every feature dimension must be a finite number.'
    if (['length', 'width', 'diameter', 'depth'].some((key) => Number(f[key]) <= 0.1))
      return 'Feature dimensions and depths must exceed 0.1 mm.'
    if (
      Number(f.clearance) < 0 ||
      (f.xRef !== 'centre' && Number(f.x) < 0) ||
      (f.yRef !== 'centre' && Number(f.y) < 0)
    )
      return 'Edge offsets and clearance must be zero or greater.'
  }
  return null
}
export function defaultWorktopFeature(
  id: string,
  starter: 'rectangle' | 'circle' | 'sink' | 'hob' = 'rectangle',
): WorktopFeature {
  return {
    id,
    label:
      starter === 'sink'
        ? 'Sink opening'
        : starter === 'hob'
          ? 'Hob opening'
          : starter === 'circle'
            ? 'Circular opening'
            : 'Rectangular opening',
    shape: starter === 'circle' ? 'circle' : 'rectangle',
    mode: 'through',
    length: starter === 'sink' ? 500 : starter === 'hob' ? 560 : 200,
    width: starter === 'sink' ? 400 : starter === 'hob' ? 490 : 150,
    diameter: 35,
    depth: 5,
    xRef: 'centre',
    yRef: 'centre',
    x: 0,
    y: 0,
    clearance: 10,
  }
}
