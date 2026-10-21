import { motionScene } from './motion'
import { defaultInterior } from '../sectionInterior'
import { applyPipeline } from '../pipeline'
export function interiorsScene(split = false) {
  const scene = motionScene('door')
  if (!split) return scene
  scene.components = scene.components.map((c) =>
    c.kind === 'carcase'
      ? {
          ...c,
          params: {
            ...c.params,
            section: {
              id: 'root',
              size: { kind: 'equal' },
              content: {
                kind: 'split',
                axis: 'vertical',
                division: 'panel',
                children: ['left', 'right'].map((id) => ({
                  id,
                  size: { kind: 'equal' },
                  content: { kind: 'leaf' },
                  interior: defaultInterior(0),
                })),
              },
            },
          },
        }
      : c,
  )
  return applyPipeline(scene)
}
