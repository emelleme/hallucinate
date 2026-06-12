import { loadAssimpScene } from './assimp-loader.ts'
import { characterFloor } from './character-data.ts'
import { triangleAreaSquared } from './character-geometry.ts'
import { add, clamp, normalize } from './math.ts'
import { landscapeBounds, roomBounds } from './scene-data.ts'
import { afterNextPaint } from './startup.ts'
import { addTreeShadowReceiver, createTreeMeshes, treeCollision, treeMeshColor,
  uploadTreeShadowMap } from './tree-object.ts'
import type { CircleBounds, TreeMesh, Vec3, Vertex } from './types.ts'

type OutsideTreeOptions = {
  color: (index: number) => Vec3
  height: number
  name: string
  nodeTransforms: boolean
  path: string
  shadow: boolean
  sourceUp: 'y' | 'z'
}

const treeShadowCasters: Array<{
  meshes: TreeMesh[]
  position: Vec3
}> = []
const treeShadowAzimuthSteps = 12
const treeShadowHeightSteps = 5
let treeShadowReceiverAdded = false
let treeShadowLightKey = ''

export async function loadOutsideTree(
  gl: WebGL2RenderingContext,
  treeShadowMap: WebGLTexture,
  vertices: Vertex[],
  outsideTree: CircleBounds,
  addSunLitTriangle: (target: Vertex[], a: Vec3, b: Vec3, c: Vec3, color: Vec3, tree: CircleBounds) => void,
  options: OutsideTreeOptions = {
    color: index => treeMeshColor(index),
    height: 12.9,
    name: 'trees',
    nodeTransforms: false,
    path: '/packed/trees.json',
    shadow: true,
    sourceUp: 'z',
  },
) {
  const trees = await loadAssimpScene(options.path, options.name)
  await afterNextPaint()
  const meshes = createTreeMeshes(trees, options.name, options.height, options.color, options.sourceUp,
    options.nodeTransforms)
  const positionY = options.sourceUp === 'y' ? characterFloor : characterFloor + options.height * 0.287
  const position: Vec3 = [outsideTree.x, positionY, outsideTree.z]
  const collision = treeCollision(meshes, position)

  if (options.shadow) {
    treeShadowCasters.push({ meshes, position })
    treeShadowLightKey = ''
    uploadTreeShadowMap(gl, treeShadowMap, treeShadowCasters, characterFloor, landscapeBounds, roomBounds.front)

    if (!treeShadowReceiverAdded) {
      addTreeShadowReceiver(vertices, characterFloor, landscapeBounds)
      treeShadowReceiverAdded = true
    }
  }

  for (const mesh of meshes) {
    for (const face of mesh.faces) {
      const a = add(position, mesh.points[face[0]!]!)
      const b = add(position, mesh.points[face[1]!]!)
      const c = add(position, mesh.points[face[2]!]!)

      if (triangleAreaSquared(a, b, c) > 0.00000001) {
        addSunLitTriangle(vertices, a, b, c, mesh.color, collision)
      }
    }
  }

  return collision
}

export function updateOutsideTreeShadowMap(
  gl: WebGL2RenderingContext,
  treeShadowMap: WebGLTexture,
  sunDirection: Vec3,
) {
  const shadow = snappedTreeShadowLight(sunDirection)

  if (shadow.key === treeShadowLightKey) {
    return
  }

  treeShadowLightKey = shadow.key
  uploadTreeShadowMap(gl, treeShadowMap, treeShadowCasters, characterFloor, landscapeBounds, roomBounds.front,
    shadow.light)
}

function snappedTreeShadowLight(sunDirection: Vec3): { key: string; light: Vec3 } {
  const rayX = -sunDirection[0]
  const rayZ = -sunDirection[2]
  const angle = Math.atan2(rayX, rayZ)
  const angleStep = Math.PI * 2 / treeShadowAzimuthSteps
  const angleIndex = (Math.round(angle / angleStep) + treeShadowAzimuthSteps) % treeShadowAzimuthSteps
  const snappedAngle = angleIndex * angleStep
  const minHeight = 0.14
  const maxHeight = 0.92
  const height = clamp(sunDirection[1], minHeight, maxHeight)
  const heightIndex = Math.round(((height - minHeight) / (maxHeight - minHeight)) * (treeShadowHeightSteps - 1))
  const snappedHeight = minHeight + (heightIndex / (treeShadowHeightSteps - 1)) * (maxHeight - minHeight)
  const horizontal = Math.sqrt(1 - snappedHeight * snappedHeight)

  return {
    key: `${angleIndex}:${heightIndex}`,
    light: normalize([
      Math.sin(snappedAngle) * horizontal,
      -snappedHeight,
      Math.cos(snappedAngle) * horizontal,
    ]),
  }
}
