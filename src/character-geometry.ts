import { addQuad } from './geometry.ts'
import { add, clamp, cross, dot, normalize, scale, subtract } from './math.ts'
import type { Vec3, Vertex } from './types.ts'

export function flattenVertices(target: Vertex[]) {
  const data = new Float32Array(target.length * 11)
  let offset = 0

  for (const vertex of target) {
    data[offset++] = vertex[0]
    data[offset++] = vertex[1]
    data[offset++] = vertex[2]
    data[offset++] = vertex[3]
    data[offset++] = vertex[4]
    data[offset++] = vertex[5]
    data[offset++] = vertex[6]
    data[offset++] = vertex[7]
    data[offset++] = vertex[8]
    data[offset++] = vertex[9]
    data[offset++] = vertex[10]
  }

  return data
}

export function triangleAreaSquared(a: Vec3, b: Vec3, c: Vec3) {
  return dot(cross(subtract(c, a), subtract(b, a)), cross(subtract(c, a), subtract(b, a)))
}

export function hairPoint(center: Vec3, side: Vec3, up: Vec3, forward: Vec3, point: Vec3) {
  const scaleAmount = 1.4
  const x = point[0] * scaleAmount
  const z = -(point[2] - 0.02) * scaleAmount - 0.055
  const y = (point[1] + 0.08) * scaleAmount - Math.max(0, z) * 0.28

  return add(add(add(center, scale(side, x)), scale(up, y)), scale(forward, z))
}

export function addLitTriangle(
  target: Vertex[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  color: Vec3,
  glow: number,
  light: (color: Vec3, point: Vec3, normal: Vec3) => Vec3,
) {
  const center = scale(add(add(a, b), c), 1 / 3)
  const normal = normalize(cross(subtract(c, a), subtract(b, a)))
  const shade = light(color, center, normal)

  target.push(
    [a[0], a[1], a[2], shade[0], shade[1], shade[2], glow, 0, 0, 0, 0],
    [b[0], b[1], b[2], shade[0], shade[1], shade[2], glow, 0, 0, 0, 0],
    [c[0], c[1], c[2], shade[0], shade[1], shade[2], glow, 0, 0, 0, 0],
  )
}

export function addCharacterBox(
  target: Vertex[],
  instances: number[],
  a: Vec3,
  b: Vec3,
  width: number,
  depth: number,
  color: Vec3,
  glow: number,
  turn: number,
  localReflection: boolean,
  light: (color: Vec3, point: Vec3, normal: Vec3) => Vec3,
  strobe = 0,
) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const dz = b[2] - a[2]
  const length = Math.hypot(dx, dy, dz)
  const nx = dx / length
  const ny = dy / length
  const nz = dz / length
  const vertical = Math.abs(ny) > 0.82
  let sideX = 0
  let sideY = 0
  let sideZ = 0
  let upX = 0
  let upY = 0
  let upZ = 0

  if (vertical) {
    sideX = Math.cos(turn)
    sideZ = -Math.sin(turn)
    upX = Math.sin(turn)
    upZ = Math.cos(turn)
  }
  else {
    const sideLength = Math.hypot(-nz, nx)

    sideX = -nz / sideLength
    sideZ = nx / sideLength
    upX = -sideZ * ny
    upY = sideZ * nx - sideX * nz
    upZ = sideX * ny

    const upLength = Math.hypot(upX, upY, upZ)

    upX /= upLength
    upY /= upLength
    upZ /= upLength
  }

  sideX *= width * 0.5
  sideY *= width * 0.5
  sideZ *= width * 0.5
  upX *= depth * 0.5
  upY *= depth * 0.5
  upZ *= depth * 0.5

  if (!localReflection) {
    addCharacterBoxInstance(instances, a, b, [sideX, sideY, sideZ], [upX, upY, upZ], color, glow, strobe)
    return
  }

  const a0: Vec3 = [a[0] - sideX - upX, a[1] - sideY - upY, a[2] - sideZ - upZ]
  const a1: Vec3 = [a[0] + sideX - upX, a[1] + sideY - upY, a[2] + sideZ - upZ]
  const a2: Vec3 = [a[0] + sideX + upX, a[1] + sideY + upY, a[2] + sideZ + upZ]
  const a3: Vec3 = [a[0] - sideX + upX, a[1] - sideY + upY, a[2] - sideZ + upZ]
  const b0: Vec3 = [b[0] - sideX - upX, b[1] - sideY - upY, b[2] - sideZ - upZ]
  const b1: Vec3 = [b[0] + sideX - upX, b[1] + sideY - upY, b[2] + sideZ - upZ]
  const b2: Vec3 = [b[0] + sideX + upX, b[1] + sideY + upY, b[2] + sideZ + upZ]
  const b3: Vec3 = [b[0] - sideX + upX, b[1] - sideY + upY, b[2] - sideZ + upZ]
  const shadeA = scale(color, 0.65)
  const shadeB = scale(color, 0.82)

  addCharacterQuad(target, a0, a1, b1, b0, shadeA, glow, localReflection, light)
  addCharacterQuad(target, a1, a2, b2, b1, color, glow, localReflection, light)
  addCharacterQuad(target, a2, a3, b3, b2, shadeB, glow, localReflection, light)
  addCharacterQuad(target, a3, a0, b0, b3, shadeA, glow, localReflection, light)
  addCharacterQuad(target, a3, a2, a1, a0, shadeB, glow, localReflection, light)
  addCharacterQuad(target, b0, b1, b2, b3, shadeB, glow, localReflection, light)
}

export function addCharacterQuad(
  target: Vertex[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  color: Vec3,
  glow: number,
  localReflection: boolean,
  light: (color: Vec3, point: Vec3, normal: Vec3) => Vec3,
) {
  if (localReflection) {
    addLitQuad(target, a, b, c, d, color, glow, light)
  }
  else {
    addQuad(target, a, b, c, d, color, glow)
  }
}

function addLitQuad(
  target: Vertex[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  color: Vec3,
  glow: number,
  light: (color: Vec3, point: Vec3, normal: Vec3) => Vec3,
) {
  const center = scale(add(add(a, b), add(c, d)), 0.25)
  const normal = normalize(cross(subtract(c, a), subtract(b, a)))

  addQuad(target, a, b, c, d, light(color, center, normal), glow)
}

function addCharacterBoxInstance(
  instances: number[],
  a: Vec3,
  b: Vec3,
  side: Vec3,
  up: Vec3,
  color: Vec3,
  glow: number,
  strobe: number,
) {
  instances.push(
    a[0],
    a[1],
    a[2],
    b[0],
    b[1],
    b[2],
    side[0],
    side[1],
    side[2],
    up[0],
    up[1],
    up[2],
    color[0],
    color[1],
    color[2],
    glow,
    strobe,
  )
}
