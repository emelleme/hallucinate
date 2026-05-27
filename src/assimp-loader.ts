import type assimpjs from 'assimpjs'
import type { AssimpScene } from './types.ts'

export async function loadAssimpScene(
  ajs: Awaited<ReturnType<typeof assimpjs>>,
  path: string,
  name: string,
): Promise<AssimpScene> {
  const response = await fetch(path)

  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`)
  }

  const files = new ajs.FileList()

  files.AddFile(name, new Uint8Array(await response.arrayBuffer()))

  const result = ajs.ConvertFileList(files, 'assjson')

  if (!result.IsSuccess() || result.FileCount() === 0) {
    throw new Error(`Assimp failed to convert ${name}: ${result.GetErrorCode()}`)
  }

  return JSON.parse(new TextDecoder().decode(result.GetFile(0).GetContent())) as AssimpScene
}
