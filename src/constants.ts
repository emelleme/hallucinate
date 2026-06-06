import type { Vec3 } from './types.ts'

export const outsideMotif: 'afternoon' | 'night' = (() => {
  const h = new Date().getHours()
  return h >= 6 && h < 18 ? 'afternoon' : 'night'
})()
export const electricNavy: Vec3 = [0.0, 0.028, 0.42]
