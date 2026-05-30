import { clamp, mix } from './math.ts'

export function createAdaptivePixelRatio() {
  const min = 0.35
  const step = 0.15
  const slowFrame = 1 / 55
  const fastFrame = 1 / 59
  const scale = window.devicePixelRatio
  let ratio = scale
  let frameTime = 1 / 60
  let changeAt = 0

  return {
    ratio: () => ratio,
    update(delta: number, stamp: number) {
      if (delta === 0) {
        return ratio
      }

      frameTime = mix(frameTime, delta, 0.08)
      ratio = clamp(ratio, min, window.devicePixelRatio)

      if (stamp < changeAt) {
        return ratio
      }

      const max = window.devicePixelRatio

      const next = frameTime > slowFrame
        ? ratio - step
        : frameTime < fastFrame
        ? ratio + step
        : ratio
      const direction = Math.sign(next - ratio)

      if (direction === 0) {
        return ratio
      }

      ratio = clamp(next, min, max)
      changeAt = stamp + (direction > 0 ? 2000 : 250)
      // console.log('[club] pixel ratio', ratio.toFixed(2), 'fps', Math.round(1 / frameTime))

      return ratio
    },
  }
}

export function createAdaptiveBloomScale() {
  const min = 0.35
  const max = 1
  const step = 0.1
  const slowFrame = 1 / 54
  const fastFrame = 1 / 59
  let scale = max
  let frameTime = 1 / 60
  let changeAt = 0

  return {
    scale: () => scale,
    update(delta: number, stamp: number) {
      if (delta === 0) {
        return scale
      }

      frameTime = mix(frameTime, delta, 0.08)

      if (stamp < changeAt) {
        return scale
      }

      const next = frameTime > slowFrame
        ? scale - step
        : frameTime < fastFrame
        ? scale + step
        : scale
      const direction = Math.sign(next - scale)

      if (direction === 0) {
        return scale
      }

      scale = clamp(next, min, max)
      changeAt = stamp + (direction > 0 ? 2500 : 250)

      return scale
    },
  }
}
