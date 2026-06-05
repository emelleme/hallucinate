import { characterFloor } from './character-data.ts'
import { clamp } from './math.ts'
import { outsideBounds } from './scene-data.ts'
import { collideSphereRoom, walkHeight } from './scene.ts'
import { reserveFloats } from './character-geometry.ts'
import type { VertexWriter } from './character-geometry.ts'
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

export function writeBeachBallGeometry(target: VertexWriter, balls: BeachBall[]) {
  const verticesPerBall = beachBallRows * beachBallColumns * 6

  reserveFloats(target, balls.length * verticesPerBall * 11)

  for (const ball of balls) {
    writeBeachBall(target, ball)
  }
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

const beachBallRows = 8
const beachBallColumns = 16
const beachBallUnitVertices = createBeachBallUnitVertices()

function writeBeachBall(target: VertexWriter, ball: BeachBall) {
  const color = palette[ball.id]!
  const data = target.data
  let offset = target.length

  for (let i = 0; i < beachBallUnitVertices.length; i += 3) {
    offset = writeVertex(data, offset, ball.position[0] + beachBallUnitVertices[i]! * beachBallRadius,
      ball.position[1] + beachBallUnitVertices[i + 1]! * beachBallRadius,
      ball.position[2] + beachBallUnitVertices[i + 2]! * beachBallRadius, color)
  }

  target.length = offset
}

function writeVertex(data: Float32Array, offset: number, x: number, y: number, z: number, color: Vec3) {
  data[offset] = x
  data[offset + 1] = y
  data[offset + 2] = z
  data[offset + 3] = color[0]
  data[offset + 4] = color[1]
  data[offset + 5] = color[2]
  data[offset + 6] = glow
  data[offset + 7] = 0
  data[offset + 8] = 0
  data[offset + 9] = 0
  data[offset + 10] = 0

  return offset + 11
}

function createBeachBallUnitVertices() {
  const vertices: number[] = []

  for (let y = 0; y < beachBallRows; y++) {
    const top = -Math.PI / 2 + Math.PI * y / beachBallRows
    const bottom = -Math.PI / 2 + Math.PI * (y + 1) / beachBallRows

    for (let x = 0; x < beachBallColumns; x++) {
      const left = Math.PI * 2 * x / beachBallColumns
      const right = Math.PI * 2 * (x + 1) / beachBallColumns

      addUnitQuad(vertices, top, bottom, left, right)
    }
  }

  return new Float32Array(vertices)
}

function addUnitQuad(target: number[], top: number, bottom: number, left: number, right: number) {
  addUnitPoint(target, top, left)
  addUnitPoint(target, top, right)
  addUnitPoint(target, bottom, right)
  addUnitPoint(target, top, left)
  addUnitPoint(target, bottom, right)
  addUnitPoint(target, bottom, left)
}

function addUnitPoint(target: number[], vertical: number, horizontal: number) {
  const radius = Math.cos(vertical)

  target.push(Math.cos(horizontal) * radius, Math.sin(vertical), Math.sin(horizontal) * radius)
}
