import type { GraffitiSplat } from './types.ts'

type RenderRequest = {
  id: number
  splats: GraffitiSplat[]
}

type RenderResponse = {
  id: number
  bitmap?: ImageBitmap
  error?: string
}

let renderId = 0
let worker: Worker | undefined
const renders = new Map<number, {
  reject: (reason?: unknown) => void
  resolve: (value: ImageBitmap) => void
}>()

export function canRenderGraffitiTextureInWorker() {
  return typeof Worker === 'function' && typeof OffscreenCanvas === 'function'
}

export function renderGraffitiTextureInWorker(splats: GraffitiSplat[]): Promise<ImageBitmap> {
  const id = ++renderId
  const nextWorker = graffitiWorker()

  return new Promise((resolve, reject) => {
    renders.set(id, { reject, resolve })
    nextWorker.postMessage({ id, splats } satisfies RenderRequest)
  })
}

function graffitiWorker() {
  worker ??= new Worker(new URL('./graffiti-worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<RenderResponse>) => {
    const render = renders.get(event.data.id)

    if (!render) {
      throw new Error(`Unknown graffiti render ${event.data.id}`)
    }

    renders.delete(event.data.id)

    if (event.data.error) {
      render.reject(new Error(event.data.error))
    }
    else {
      render.resolve(event.data.bitmap!)
    }
  }
  worker.onerror = event => {
    for (const render of renders.values()) {
      render.reject(new Error(event.message))
    }

    renders.clear()
  }

  return worker
}
