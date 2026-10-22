import { lazy, type ComponentType } from 'react'

export function lazyNamed<M, K extends keyof M>(
  load: () => Promise<M>,
  name: K,
): React.LazyExoticComponent<M[K] extends ComponentType<infer P> ? ComponentType<P> : never> {
  return lazy(async () => ({ default: (await load())[name] as never }))
}
