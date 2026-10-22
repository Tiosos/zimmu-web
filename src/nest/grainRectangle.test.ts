import { expect, it } from 'vitest'
import { matchedRectangle } from './nestJob'
it('maps actual member rectangles through all four common blank rotations', () => {
  expect(matchedRectangle(10, 20, 30, 40, 100, 200, 0)).toEqual({ x: 10, y: 20, w: 30, h: 40 })
  expect(matchedRectangle(10, 20, 30, 40, 100, 200, 90)).toEqual({ x: 140, y: 10, w: 40, h: 30 })
  expect(matchedRectangle(10, 20, 30, 40, 100, 200, 180)).toEqual({ x: 60, y: 140, w: 30, h: 40 })
  expect(matchedRectangle(10, 20, 30, 40, 100, 200, 270)).toEqual({ x: 20, y: 60, w: 40, h: 30 })
})
