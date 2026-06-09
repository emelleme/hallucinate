import type { CharacterRig, HairMesh } from './types.ts'

type CoreRequest = {
  id: number
  hairIndex: number
}

type CoreProgressResponse = {
  id: number
  progress: number
}

type CoreLoadedResponse = {
  hairIndex: number
  hairMeshes: HairMesh[]
  id: number
  rig: CharacterRig
}

type CoreErrorResponse = {
  error: string
  id: number
}

type CoreResponse = CoreErrorResponse | CoreLoadedResponse | CoreProgressResponse

let loadId = 0
let worker: Worker | undefined
const loads = new Map<number, {
  onProgress?: (progress: number) => void
  reject: (reason?: unknown) => void
  resolve: (value: Omit<CoreLoadedResponse, 'id'>) => void
}>()

export function loadCharacterCoreAssets(hairIndex: number, onProgress?: (progress: number) => void) {
  const id = ++loadId
  const nextWorker = characterCoreWorker()

  return new Promise<Omit<CoreLoadedResponse, 'id'>>((resolve, reject) => {
    loads.set(id, { onProgress, reject, resolve })
    nextWorker.postMessage({ id, hairIndex } satisfies CoreRequest)
  })
}

function characterCoreWorker() {
  worker ??= new Worker(new URL('./character-core-worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<CoreResponse>) => {
    const load = loads.get(event.data.id)

    if (!load) {
      throw new Error(`Unknown character core load ${event.data.id}`)
    }

    if ('progress' in event.data) {
      load.onProgress?.(event.data.progress)
      return
    }

    loads.delete(event.data.id)
    if ('error' in event.data) {
      load.reject(new Error(event.data.error))
    }
    else {
      load.resolve({
        hairIndex: event.data.hairIndex,
        hairMeshes: event.data.hairMeshes,
        rig: event.data.rig,
      })
    }
  }
  worker.onerror = event => {
    for (const load of loads.values()) {
      load.reject(new Error(event.message))
    }

    loads.clear()
  }

  return worker
}
