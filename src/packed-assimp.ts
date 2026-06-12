import type { AssimpScene } from './types.ts'

export function packedAssimpAssetPath(name: string) {
  return `/packed/${name}.json`
}

export function packedAssimpPath(path: string) {
  const file = path.split('/').pop()

  if (!file) {
    throw new Error(`Invalid Assimp path ${path}`)
  }

  return path.endsWith('.json') ? path : packedAssimpAssetPath(file.replace(/\.fbx$/i, ''))
}

export async function loadPackedAssimpScene(path: string): Promise<AssimpScene | undefined> {
  const response = await fetch(packedAssimpPath(path))

  if (response.status === 404) {
    return undefined
  }
  if (!response.ok) {
    throw new Error(`Failed to load ${packedAssimpPath(path)}: ${response.status}`)
  }

  return await response.json() as AssimpScene
}
