import { characterFloor } from './character-data.ts'
import { reserveFloats } from './character-geometry.ts'
import type { VertexWriter } from './character-geometry.ts'
import { clamp } from './math.ts'
import { outsideBounds } from './scene-data.ts'
import { collideSphereRoom, walkHeight } from './scene.ts'
import { createUnitSphere, writeSphere } from './sphere-geometry.ts'
import type { BeachBall, CircleBounds, Vec3 } from './types.ts'

export const beachBallRadius = 0.52

const bounce = 0.74
const friction = 0.995
const gravity = 5.6
const pushSpeed = 3.2
const liftSpeed = 5.4
const playerRadius = 0.42
const playerHeight = 1.7
const glow = 0.55
const palette: Vec3[] = [
  [1, 0.02, 0.65],
  [0.15, 1, 0.05],
  [0.04, 0.82, 1],
]
const nearLodDistanceSq = 10 * 10
const midLodDistanceSq = 18 * 18

export function createBeachBalls(): BeachBall[] {
  return [
    { id: 0, position: [-2.6, characterFloor + beachBallRadius, 7.8], velocity: [0, 0, 0] },
    { id: 1, position: [0.2, characterFloor + beachBallRadius, 9.6], velocity: [0, 0, 0] },
    { id: 2, position: [2.9, characterFloor + beachBallRadius, 7.9], velocity: [0, 0, 0] },
  ]
}

export function updateBeachBalls(balls: BeachBall[], delta: number, outsideTree: CircleBounds) {
  for (const ball of balls) {
    const position = ball.position
    const velocity = ball.velocity

    velocity[1] -= gravity * delta
    position[0] += velocity[0] * delta
    position[1] += velocity[1] * delta
    position[2] += velocity[2] * delta
    collideBallRoom(ball, outsideTree)
    velocity[0] *= friction
    velocity[2] *= friction
  }
}

export function hitBeachBalls(balls: BeachBall[], player: Vec3) {
  const hits: number[] = []

  for (const ball of balls) {
    if (ball.position[1] - beachBallRadius > player[1] + playerHeight
      || ball.position[1] + beachBallRadius < player[1])
    {
      continue
    }

    const dx = ball.position[0] - player[0]
    const dz = ball.position[2] - player[2]
    const min = beachBallRadius + playerRadius
    const distanceSq = dx * dx + dz * dz

    if (distanceSq < min * min) {
      const distance = Math.sqrt(distanceSq)
      const x = dx / distance
      const z = dz / distance
      const overlap = min - distance

      ball.position[0] += x * overlap
      ball.position[2] += z * overlap
      ball.velocity[0] = x * pushSpeed
      ball.velocity[1] = Math.max(ball.velocity[1], liftSpeed)
      ball.velocity[2] = z * pushSpeed
      hits.push(ball.id)
    }
  }

  return hits
}

export function writeBeachBallGeometry(target: VertexWriter, balls: BeachBall[], camera: Vec3) {
  let floats = 0

  for (const ball of balls) {
    floats += sphereFloats(beachBallUnitSphereFor(ball, camera))
  }

  reserveFloats(target, floats)

  for (const ball of balls) {
    writeSphere(target, beachBallUnitSphereFor(ball, camera), ball.position[0], ball.position[1], ball.position[2],
      beachBallRadius, palette[ball.id]!, glow)
  }
}

function sphereFloats(unit: Float32Array) {
  return unit.length / 3 * 11
}

function beachBallUnitSphereFor(ball: BeachBall, camera: Vec3) {
  const dx = ball.position[0] - camera[0]
  const dy = ball.position[1] - camera[1]
  const dz = ball.position[2] - camera[2]
  const distanceSq = dx * dx + dy * dy + dz * dz

  if (distanceSq < nearLodDistanceSq) {
    return beachBallUnitSphereHigh
  }
  if (distanceSq < midLodDistanceSq) {
    return beachBallUnitSphereMid
  }

  return beachBallUnitSphereLow
}

function collideBallRoom(ball: BeachBall, outsideTree: CircleBounds) {
  const position = ball.position
  const previousX = position[0]
  const previousZ = position[2]

  position[0] = clamp(position[0], outsideBounds.left + beachBallRadius, outsideBounds.right - beachBallRadius)
  position[2] = clamp(position[2], outsideBounds.back + beachBallRadius, outsideBounds.front - beachBallRadius)
  collideSphereRoom(position, beachBallRadius, outsideTree)

  if (position[0] !== previousX) {
    ball.velocity[0] *= -bounce
  }
  if (position[2] !== previousZ) {
    ball.velocity[2] *= -bounce
  }

  const floor = walkHeight(position[0], position[1], position[2]) + beachBallRadius

  if (position[1] < floor) {
    position[1] = floor
    ball.velocity[1] = Math.abs(ball.velocity[1]) * bounce
  }
}

const beachBallUnitSphereHigh = createUnitSphere(12, 24)
const beachBallUnitSphereMid = createUnitSphere(8, 16)
const beachBallUnitSphereLow = createUnitSphere(5, 10)
