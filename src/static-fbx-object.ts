import { loadAssimpScene } from './assimp-loader.ts'
import { triangleAreaSquared } from './character-geometry.ts'
import { add } from './math.ts'
import type { AssimpScene, CircleBounds, Vec3, Vertex } from './types.ts'

type StaticMesh = {
  color: Vec3
  faces: number[][]
  points: Vec3[]
}

type StaticObjectOptions = {
  color: Vec3
  height: number
  lightBounds: CircleBounds
  meshIndex?: number
  path: string
  position: Vec3
  sourceUp: 'y' | 'z'
  turn: number
}

export async function loadStaticFbxObject(
  target: Vertex[],
  options: StaticObjectOptions,
  addSunLitTriangle: (target: Vertex[], a: Vec3, b: Vec3, c: Vec3, color: Vec3, tree: CircleBounds) => void,
) {
  const scene = await loadAssimpScene(options.path, options.path.slice(1))

  addStaticFbxObject(target, scene, options, addSunLitTriangle)
}

export async function loadStaticFbxObjects(
  target: Vertex[],
  path: string,
  options: StaticObjectOptions[],
  addSunLitTriangle: (target: Vertex[], a: Vec3, b: Vec3, c: Vec3, color: Vec3, tree: CircleBounds) => void,
) {
  const scene = await loadAssimpScene(path, path.slice(1))

  for (const option of options) {
    addStaticFbxObject(target, scene, option, addSunLitTriangle)
  }
}

function addStaticFbxObject(
  target: Vertex[],
  scene: AssimpScene,
  options: StaticObjectOptions,
  addSunLitTriangle: (target: Vertex[], a: Vec3, b: Vec3, c: Vec3, color: Vec3, tree: CircleBounds) => void,
) {
  const meshes = createStaticMeshes(scene, options)

  for (const mesh of meshes) {
    for (const face of mesh.faces) {
      const a = add(options.position, mesh.points[face[0]!]!)
      const b = add(options.position, mesh.points[face[1]!]!)
      const c = add(options.position, mesh.points[face[2]!]!)

      if (triangleAreaSquared(a, b, c) > 0.00000001) {
        addSunLitTriangle(target, a, b, c, mesh.color, options.lightBounds)
      }
    }
  }
}

function createStaticMeshes(scene: AssimpScene, options: StaticObjectOptions): StaticMesh[] {
  const meshes = scene.meshes!.map(mesh => {
    const points: Vec3[] = []

    for (let i = 0; i < mesh.vertices.length; i += 3) {
      points.push([mesh.vertices[i]!, mesh.vertices[i + 1]!, mesh.vertices[i + 2]!])
    }

    return { points, faces: mesh.faces.filter(face => face.length === 3), color: options.color }
  })

  if (meshes.length === 0) {
    throw new Error(`${options.path} has no meshes`)
  }

  const normalized = normalizeStaticMeshes(meshes, options.height, options.sourceUp, options.turn)

  return options.meshIndex === undefined ? normalized : [normalized[options.meshIndex % normalized.length]!]
}

function normalizeStaticMeshes(meshes: StaticMesh[], height: number, sourceUp: 'y' | 'z', turn: number): StaticMesh[] {
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
  const zUp = sourceUp === 'z'
  const centerZ = (min[2] + max[2]) * 0.5
  const sourceHeight = zUp ? max[2] - min[2] : max[1] - min[1]
  const amount = height / sourceHeight
  const turnX = Math.cos(turn)
  const turnZ = Math.sin(turn)

  return meshes.map(mesh => ({
    points: mesh.points.map(point => {
      const x = (point[0] - centerX) * amount
      const y = zUp ? (point[2] - min[2]) * amount : (point[1] - min[1]) * amount
      const z = zUp ? -(point[1] - (min[1] + max[1]) * 0.5) * amount : (point[2] - centerZ) * amount

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
