import { pack } from './geometry.ts'
import { characterFloor } from './character-data.ts'
import { roomBounds } from './scene-data.ts'
import type { WallProjector } from './projection.ts'
import type { GraffitiSplat, Vec3, Vertex } from './types.ts'

export const maxGraffitiSplats = 100000
export const graffitiTextureSize = 1024
export const graffitiCellSize = graffitiTextureSize / 2
export const graffitiColors: Vec3[] = [
  [0.015, 0.012, 0.01],
  [1, 1, 1],
  [0.42, 0.42, 0.42],
  [0.42, 0.2, 0.08],
  [1, 0.02, 0.02],
  [1, 0.32, 0.02],
  [1, 0.9, 0.02],
  [0.02, 1, 0.12],
  [0.02, 0.55, 1],
  [0.1, 0.08, 1],
  [0.66, 0.08, 1],
  [1, 0.03, 0.72],
]

const wallYMin = characterFloor + 0.03
const wallYMax = 5
const wallMargin = 0.03
const wallEpsilon = 0.09
const splatBaseScale = 0.38
const splatRadiusScale = 1.9

const walls = [
  { axis: 'z', value: roomBounds.front, min: roomBounds.left, max: roomBounds.right, normal: [0, 0, 1] as Vec3 },
  { axis: 'z', value: roomBounds.back, min: roomBounds.left, max: roomBounds.right, normal: [0, 0, -1] as Vec3 },
  { axis: 'x', value: roomBounds.left, min: roomBounds.back, max: roomBounds.front, normal: [-1, 0, 0] as Vec3 },
  { axis: 'x', value: roomBounds.right, min: roomBounds.back, max: roomBounds.front, normal: [1, 0, 0] as Vec3 },
] as const

export function sprayWallPoint(clientX: number, clientY: number, projector: WallProjector) {
  const ray = screenRay(clientX, clientY, projector)
  let best: { wall: number; x: number; y: number; distance: number } | undefined

  for (let wall = 0; wall < walls.length; wall++) {
    const hit = wallHit(wall, ray)

    if (hit && (!best || hit.distance < best.distance)) {
      best = { wall, x: hit.x, y: hit.y, distance: hit.distance }
    }
  }

  return best
}

export function addGraffitiGeometry(target: Vertex[], splats: GraffitiSplat[]) {
  for (const splat of splats) {
    addGraffitiSplat(target, splat)
  }
}

export function addGraffitiWallGeometry(target: Vertex[]) {
  for (let wall = 0; wall < walls.length; wall++) {
    const data = walls[wall]!
    const u0 = wall % 2 * 0.5
    const v0 = Math.floor(wall / 2) * 0.5
    const u1 = u0 + 0.5
    const v1 = v0 + 0.5

    if (data.axis === 'x') {
      const x = data.value + data.normal[0] * wallEpsilon

      addGraffitiQuad(target, [x, wallYMin, data.min], [x, wallYMin, data.max], [x, wallYMax, data.max],
        [x, wallYMax, data.min], u0, v0, u1, v1)
    }
    else {
      const z = data.value + data.normal[2] * wallEpsilon

      addGraffitiQuad(target, [data.min, wallYMin, z], [data.max, wallYMin, z], [data.max, wallYMax, z],
        [data.min, wallYMax, z], u0, v0, u1, v1)
    }
  }
}

export function createGraffitiCanvas() {
  const canvas = document.createElement('canvas')

  canvas.width = graffitiTextureSize
  canvas.height = graffitiTextureSize

  return canvas
}

export function paintGraffitiSplats(context: CanvasRenderingContext2D, splats: GraffitiSplat[]) {
  for (const splat of splats) {
    paintGraffitiSplat(context, splat)
  }
}

function screenRay(clientX: number, clientY: number, projector: WallProjector) {
  const ndcX = clientX / projector.clientWidth * 2 - 1
  const ndcY = 1 - clientY / projector.clientHeight * 2
  const x = -projector.cameraZX + projector.cameraXX * ndcX * projector.aspect / projector.f
    + projector.cameraYX * ndcY / projector.f
  const y = -projector.cameraZY + projector.cameraXY * ndcX * projector.aspect / projector.f
    + projector.cameraYY * ndcY / projector.f
  const z = -projector.cameraZZ + projector.cameraXZ * ndcX * projector.aspect / projector.f
    + projector.cameraYZ * ndcY / projector.f

  return {
    eyeX: projector.eyeX,
    eyeY: projector.eyeY,
    eyeZ: projector.eyeZ,
    x,
    y,
    z,
    length: Math.hypot(x, y, z),
  }
}

function wallHit(wallIndex: number, ray: ReturnType<typeof screenRay>) {
  const wall = walls[wallIndex]!
  const component = wall.axis === 'x' ? ray.x : ray.z
  const eye = wall.axis === 'x' ? ray.eyeX : ray.eyeZ
  const distance = (wall.value - eye) / component

  if (distance <= 0) {
    return
  }

  const worldX = ray.eyeX + ray.x * distance
  const worldY = ray.eyeY + ray.y * distance
  const worldZ = ray.eyeZ + ray.z * distance
  const along = wall.axis === 'x' ? worldZ : worldX

  if (worldY < wallYMin || worldY > wallYMax || along < wall.min + wallMargin || along > wall.max - wallMargin) {
    return
  }

  return {
    x: along,
    y: worldY,
    distance: distance * ray.length,
  }
}

function addGraffitiSplat(target: Vertex[], splat: GraffitiSplat) {
  const wall = walls[splat.wall]!
  const color = graffitiColors[splat.colorIndex % graffitiColors.length]!
  const tangent: Vec3 = wall.axis === 'x' ? [0, 0, 1] : [1, 0, 0]
  const up: Vec3 = [0, 1, 0]
  const center = wallPoint(splat.wall, splat.x, splat.y)
  const scale = graffitiSplatScale(splat.radius)
  const count = 3 + splat.seed % 3

  for (let i = 0; i < count; i++) {
    const angle = random(splat.seed, i * 4) * Math.PI * 2
    const radius = scale * (0.025 + random(splat.seed, i * 4 + 1) * 0.12)
    const sizeX = scale * (0.055 + random(splat.seed, i * 4 + 2) * 0.09)
    const sizeY = scale * (0.04 + random(splat.seed, i * 4 + 3) * 0.08)
    const cx = Math.cos(angle) * radius
    const cy = Math.sin(angle) * radius * 0.72
    const point: Vec3 = [
      center[0] + tangent[0] * cx + up[0] * cy,
      center[1] + tangent[1] * cx + up[1] * cy,
      center[2] + tangent[2] * cx + up[2] * cy,
    ]

    addSplatQuad(target, point, tangent, up, sizeX, sizeY, color)
  }
}

function wallPoint(wallIndex: number, x: number, y: number): Vec3 {
  const wall = walls[wallIndex]!

  if (wall.axis === 'x') {
    return [wall.value + wall.normal[0] * wallEpsilon, y, x]
  }

  return [x, y, wall.value + wall.normal[2] * wallEpsilon]
}

function addSplatQuad(target: Vertex[], center: Vec3, tangent: Vec3, up: Vec3, sizeX: number, sizeY: number, color: Vec3) {
  const a = offset(center, tangent, up, -sizeX, -sizeY)
  const b = offset(center, tangent, up, sizeX, -sizeY)
  const c = offset(center, tangent, up, sizeX, sizeY)
  const d = offset(center, tangent, up, -sizeX, sizeY)

  target.push(
    pack(a, color, 0, 0, -1, -1, 6),
    pack(b, color, 0, 0, 1, -1, 6),
    pack(c, color, 0, 0, 1, 1, 6),
    pack(a, color, 0, 0, -1, -1, 6),
    pack(c, color, 0, 0, 1, 1, 6),
    pack(d, color, 0, 0, -1, 1, 6),
  )
}

function addGraffitiQuad(
  target: Vertex[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
) {
  const color: Vec3 = [1, 1, 1]

  target.push(
    pack(a, color, 0, 0, u0, v1, 6),
    pack(b, color, 0, 0, u1, v1, 6),
    pack(c, color, 0, 0, u1, v0, 6),
    pack(a, color, 0, 0, u0, v1, 6),
    pack(c, color, 0, 0, u1, v0, 6),
    pack(d, color, 0, 0, u0, v0, 6),
  )
}

function paintGraffitiSplat(context: CanvasRenderingContext2D, splat: GraffitiSplat) {
  const color = graffitiColors[splat.colorIndex % graffitiColors.length]!
  const wall = walls[splat.wall]!
  const [x, y] = splatCanvasPoint(splat)
  const pixelsPerMeterX = graffitiCellSize / (wall.max - wall.min)
  const pixelsPerMeterY = graffitiCellSize / (wallYMax - wallYMin)
  const scale = graffitiSplatScale(splat.radius)
  const count = 3 + splat.seed % 3

  context.save()
  context.translate(x, y)
  context.scale(pixelsPerMeterX, pixelsPerMeterY)
  context.fillStyle = `rgb(${Math.round(color[0] * 255)} ${Math.round(color[1] * 255)} ${Math.round(color[2] * 255)})`

  for (let i = 0; i < count; i++) {
    const angle = random(splat.seed, i * 4) * Math.PI * 2
    const radius = scale * (0.025 + random(splat.seed, i * 4 + 1) * 0.12)
    const sizeX = scale * (0.055 + random(splat.seed, i * 4 + 2) * 0.09)
    const sizeY = scale * (0.04 + random(splat.seed, i * 4 + 3) * 0.08)
    const xRadius = Math.cos(angle) * radius
    const yRadius = Math.sin(angle) * radius * 0.72

    context.beginPath()
    context.ellipse(xRadius, yRadius, sizeX, sizeY, angle * 0.37, 0, Math.PI * 2)
    context.fill()
  }

  context.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < count + 2; i++) {
    const angle = random(splat.seed, 40 + i * 3) * Math.PI * 2
    const radius = scale * (0.035 + random(splat.seed, 41 + i * 3) * 0.12)
    const size = scale * (0.012 + random(splat.seed, 42 + i * 3) * 0.026)
    const xRadius = Math.cos(angle) * radius
    const yRadius = Math.sin(angle) * radius

    context.beginPath()
    context.arc(xRadius, yRadius, size, 0, Math.PI * 2)
    context.fill()
  }

  context.restore()
}

function splatCanvasPoint(splat: GraffitiSplat) {
  const wall = walls[splat.wall]!
  const cellX = splat.wall % 2 * graffitiCellSize
  const cellY = Math.floor(splat.wall / 2) * graffitiCellSize
  const u = (splat.x - wall.min) / (wall.max - wall.min)
  const v = 1 - (splat.y - wallYMin) / (wallYMax - wallYMin)

  return [
    cellX + u * graffitiCellSize,
    cellY + v * graffitiCellSize,
  ]
}

function graffitiSplatScale(radius: number) {
  return splatBaseScale + radius / 255 * splatRadiusScale
}

function offset(center: Vec3, tangent: Vec3, up: Vec3, x: number, y: number): Vec3 {
  return [
    center[0] + tangent[0] * x + up[0] * y,
    center[1] + tangent[1] * x + up[1] * y,
    center[2] + tangent[2] * x + up[2] * y,
  ]
}

function random(seed: number, offset: number) {
  let value = (seed + offset * 374761393) | 0

  value = Math.imul(value ^ value >>> 15, 2246822519)
  value = Math.imul(value ^ value >>> 13, 3266489917)

  return ((value ^ value >>> 16) >>> 0) / 4294967296
}
