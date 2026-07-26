import { test, expect } from 'vitest'
import type { Face } from './types'
import { localNormalToFaceString } from './snapMath'
import { synthHit } from './suggestJoints'

const FACES: Face[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z']

test('synthHit produces a FaceHit whose local normal round-trips to the same face', () => {
  for (const f of FACES) {
    const h = synthHit('P1', f)
    expect(h.partId).toBe('P1')
    expect(localNormalToFaceString(h.localFaceNormal)).toBe(f)
    expect(h.faceNormal).toEqual(h.localFaceNormal)
  }
})
