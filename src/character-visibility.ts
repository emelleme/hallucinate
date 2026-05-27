import { cross, dot, normalize, subtract } from './math.ts'
import type { Player, Vec3 } from './types.ts'

export function characterView(eye: Vec3, target: Vec3) {
  const forward = normalize(subtract(target, eye))
  const right = normalize(cross(forward, [0, 1, 0]))
  const up = cross(right, forward)

  return { eye, forward, right, up }
}

export function characterInView(
  player: Player,
  view: ReturnType<typeof characterView>,
  width: number,
  height: number,
) {
  const center: Vec3 = [player.position[0], player.position[1] + 0.85, player.position[2]]
  const toPlayer = subtract(center, view.eye)
  const depth = dot(toPlayer, view.forward)
  const radius = 1.2

  if (depth < -radius || depth > 45) {
    return false
  }

  const vertical = Math.tan(1.08 / 2) * Math.max(depth, 0.1) + radius
  const horizontal = vertical * (width / height) + radius

  return Math.abs(dot(toPlayer, view.right)) < horizontal && Math.abs(dot(toPlayer, view.up)) < vertical
}
