import { addQuad, pack } from './geometry.ts'
import { add, identity, mix, multiply, nodeTransform, normalize } from './math.ts'
import type { AssimpNode, AssimpScene, CircleBounds, Mat4, TreeMesh, Vec3, Vertex } from './types.ts'

type EdgeBounds = { left: number; right: number; back: number; front: number }
type MeshInstance = { index: number; transform: Mat4 }
type SourceUp = 'y' | 'z'
type TreeShadowCaster = { meshes: TreeMesh[]; position: Vec3 }
type TreeMeshColor = (index: number) => Vec3
const defaultTreeShadowLight = normalize([-0.55, -1, -0.7])

export function createTreeMeshes(
  scene: AssimpScene,
  name = 'trees',
  height = 12.9,
  color: TreeMeshColor = treeMeshColor,
  sourceUp: SourceUp = 'z',
  nodeTransforms = false,
): TreeMesh[] {
  const instances = collectMeshInstances(scene.rootnode)
  const meshInstances = nodeTransforms && instances.length > 0
    ? instances
    : scene.meshes!.map((_, index) => ({ index, transform: identity() }))
  const meshes = meshInstances.map(instance => {
    const mesh = scene.meshes![instance.index]!
    const points: Vec3[] = []

    for (let i = 0; i < mesh.vertices.length; i += 3) {
      points.push(transformPoint([
        mesh.vertices[i]!,
        mesh.vertices[i + 1]!,
        mesh.vertices[i + 2]!,
      ], instance.transform))
    }

    return { points, faces: mesh.faces.filter(face => face.length === 3), color: color(instance.index) }
  })

  if (meshes.length === 0) {
    throw new Error(`${name} has no meshes`)
  }

  return normalizeTreeMeshes(meshes, height, sourceUp)
}

function collectMeshInstances(root: AssimpNode): MeshInstance[] {
  const instances: MeshInstance[] = []
  const visit = (node: AssimpNode, parent: Mat4) => {
    const transform = multiply(parent, nodeTransform(node))

    for (const index of node.meshes ?? []) {
      instances.push({ index, transform })
    }

    for (const child of node.children ?? []) {
      visit(child, transform)
    }
  }

  visit(root, identity())

  return instances
}

function transformPoint(point: Vec3, transform: Mat4): Vec3 {
  return [
    transform[0] * point[0] + transform[1] * point[1] + transform[2] * point[2] + transform[3],
    transform[4] * point[0] + transform[5] * point[1] + transform[6] * point[2] + transform[7],
    transform[8] * point[0] + transform[9] * point[1] + transform[10] * point[2] + transform[11],
  ]
}

function normalizeTreeMeshes(meshes: TreeMesh[], height: number, sourceUp: SourceUp): TreeMesh[] {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]

  for (const mesh of meshes) {
    for (const point of mesh.points) {
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], point[i])
        max[i] = Math.max(max[i], point[i])
      }
    }
  }

  const centerX = (min[0] + max[0]) * 0.5
  const yUp = sourceUp === 'y'
  const centerZ = (min[2] + max[2]) * 0.5
  const sourceHeight = max[1] - min[1]
  const amount = height / sourceHeight
  const turn = Math.PI / 4
  const turnX = Math.cos(turn)
  const turnZ = Math.sin(turn)

  return meshes.map(mesh => ({
    points: mesh.points.map(point => {
      const x = (point[0] - centerX) * amount
      const y = yUp ? (point[1] - min[1]) * amount : (point[2] - centerZ) * amount
      const z = yUp ? (point[2] - centerZ) * amount : -(point[1] - min[1]) * amount

      return [
        x * turnX - z * turnZ,
        y,
        x * turnZ + z * turnX,
      ]
    }),
    faces: mesh.faces,
    color: mesh.color,
  }))
}

export function treeMeshColor(index: number): Vec3 {
  if (index === 1) {
    return [0, 0, 0]
  }

  if (index === 2) {
    return [0, 1, 0]
  }

  if (index === 3) {
    return [0, 0.8, 0]
  }

  if (index === 4) {
    return [0, 0.9, 0]
  }

  return [0.38, 0.18, 0.07]
}

export function treeCollision(meshes: TreeMesh[], position: Vec3): CircleBounds {
  const trunk = meshes[1]!
  let bottom = Infinity
  let top = -Infinity
  let x = 0
  let z = 0
  let count = 0

  for (const point of trunk.points) {
    const y = position[1] + point[1]

    bottom = Math.min(bottom, y)
    top = Math.max(top, y)
  }

  for (const point of trunk.points) {
    const world = add(position, point)

    if (world[1] < bottom + (top - bottom) * 0.28) {
      x += world[0]
      z += world[2]
      count++
    }
  }

  x /= count
  z /= count

  z -= 2
  x += .25

  return {
    x,
    z,
    radius: 0.35,
  }
}

export function addTreeCollisionDebug(target: Vertex[], outsideTree: CircleBounds, characterFloor: number) {
  const y = characterFloor + 0.05
  const color: Vec3 = [0, 0.85, 1]
  const left = outsideTree.x - outsideTree.radius
  const right = outsideTree.x + outsideTree.radius
  const back = outsideTree.z - outsideTree.radius
  const front = outsideTree.z + outsideTree.radius

  addQuad(target, [left, y, back], [right, y, back], [right, y, front], [left, y, front], color, 0.35)
}

export function addTreeShadowReceiver(target: Vertex[], characterFloor: number, landscapeBounds: EdgeBounds) {
  const y = characterFloor + 0.026
  const color: Vec3 = [0, 0, 0]
  const a: Vec3 = [landscapeBounds.left, y, landscapeBounds.front]
  const b: Vec3 = [landscapeBounds.right, y, landscapeBounds.front]
  const c: Vec3 = [landscapeBounds.right, y, landscapeBounds.back]
  const d: Vec3 = [landscapeBounds.left, y, landscapeBounds.back]
  const uvA = shadowTextureUv(a, landscapeBounds)
  const uvB = shadowTextureUv(b, landscapeBounds)
  const uvC = shadowTextureUv(c, landscapeBounds)
  const uvD = shadowTextureUv(d, landscapeBounds)

  target.push(
    pack(a, color, 0, 0, uvA[0], uvA[1], 5),
    pack(b, color, 0, 0, uvB[0], uvB[1], 5),
    pack(c, color, 0, 0, uvC[0], uvC[1], 5),
  )
  target.push(
    pack(a, color, 0, 0, uvA[0], uvA[1], 5),
    pack(c, color, 0, 0, uvC[0], uvC[1], 5),
    pack(d, color, 0, 0, uvD[0], uvD[1], 5),
  )
}

function clipGroundPolygonFront(points: Vec3[], front: number): Vec3[] {
  const clipped: Vec3[] = []

  for (let i = 0; i < points.length; i++) {
    const current = points[i]!
    const next = points[(i + 1) % points.length]!
    const currentInside = current[2] >= front
    const nextInside = next[2] >= front

    if (currentInside && nextInside) {
      clipped.push(next)
    }
    else if (currentInside && !nextInside) {
      clipped.push(intersectGroundFront(current, next, front))
    }
    else if (!currentInside && nextInside) {
      clipped.push(intersectGroundFront(current, next, front), next)
    }
  }

  return clipped
}

function intersectGroundFront(a: Vec3, b: Vec3, front: number): Vec3 {
  const amount = (front - a[2]) / (b[2] - a[2])

  return [
    mix(a[0], b[0], amount),
    a[1],
    front,
  ]
}

function convexGroundHull(points: Vec3[]): Vec3[] {
  const unique = [...new Map(points.map(point => [`${point[0].toFixed(2)}:${point[2].toFixed(2)}`, point])).values()]
    .sort((a, b) => a[0] === b[0] ? a[2] - b[2] : a[0] - b[0])
  const lower: Vec3[] = []
  const upper: Vec3[] = []

  for (const point of unique) {
    while (lower.length >= 2 && groundTurn(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) {
      lower.pop()
    }

    lower.push(point)
  }

  for (const point of [...unique].reverse()) {
    while (upper.length >= 2 && groundTurn(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) {
      upper.pop()
    }

    upper.push(point)
  }

  lower.pop()
  upper.pop()

  return [...lower, ...upper]
}

function groundTurn(a: Vec3, b: Vec3, c: Vec3) {
  return (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])
}

function projectTreeShadow(point: Vec3, light: Vec3, ground: number): Vec3 {
  const amount = (ground - point[1]) / light[1]

  return [
    point[0] + light[0] * amount,
    ground,
    point[2] + light[2] * amount,
  ]
}

export function uploadTreeShadowMap(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  casters: TreeShadowCaster[],
  characterFloor: number,
  landscapeBounds: EdgeBounds,
  roomFront: number,
  light = defaultTreeShadowLight,
) {
  const size = 512
  const canvas = document.createElement('canvas')
  const blurCanvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!
  const blurContext = blurCanvas.getContext('2d')!
  const shadowLight = normalize(light)
  const ground = characterFloor + 0.02

  if (shadowLight[1] >= -0.01) {
    throw new Error('Tree shadow light must point toward the ground')
  }

  canvas.width = size
  canvas.height = size
  blurCanvas.width = size
  blurCanvas.height = size
  context.fillStyle = 'rgba(0,0,0,0.12)'

  for (const caster of casters) {
    for (const mesh of caster.meshes) {
      for (const face of mesh.faces) {
        const polygon = clipGroundPolygonFront([
          projectTreeShadow(add(caster.position, mesh.points[face[0]!]!), shadowLight, ground),
          projectTreeShadow(add(caster.position, mesh.points[face[1]!]!), shadowLight, ground),
          projectTreeShadow(add(caster.position, mesh.points[face[2]!]!), shadowLight, ground),
        ], roomFront + 0.06)

        if (polygon.length >= 3) {
          drawShadowPolygon(context, polygon, size, landscapeBounds)
        }
      }
    }
  }

  blurContext.clearRect(0, 0, size, size)
  blurContext.filter = 'blur(0.5px)'
  blurContext.globalAlpha = 0.72
  blurContext.drawImage(canvas, 0, 0)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, blurCanvas)
}

function drawShadowPolygon(context: CanvasRenderingContext2D, points: Vec3[], size: number,
  landscapeBounds: EdgeBounds)
{
  const first = shadowTexturePoint(points[0]!, size, landscapeBounds)

  context.beginPath()
  context.moveTo(first[0], first[1])

  for (const point of points.slice(1)) {
    const next = shadowTexturePoint(point, size, landscapeBounds)

    context.lineTo(next[0], next[1])
  }

  context.closePath()
  context.fill()
}

function shadowTexturePoint(point: Vec3, size: number, landscapeBounds: EdgeBounds): [number, number] {
  const uv = shadowTextureUv(point, landscapeBounds)

  return [uv[0] * size, uv[1] * size]
}

function shadowTextureUv(point: Vec3, landscapeBounds: EdgeBounds): [number, number] {
  return [
    (point[0] - landscapeBounds.left) / (landscapeBounds.right - landscapeBounds.left),
    (landscapeBounds.front - point[2]) / (landscapeBounds.front - landscapeBounds.back),
  ]
}
