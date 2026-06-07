import {
  createGraffitiOffscreenCanvas,
  paintGraffitiSplats,
  paintLoftPaintingTextures,
} from './graffiti.ts'
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

self.onmessage = (event: MessageEvent<RenderRequest>) => {
  try {
    const bitmap = renderGraffitiTexture(event.data.splats)

    postTransfer({ id: event.data.id, bitmap }, [bitmap])
  }
  catch (error) {
    self.postMessage({
      id: event.data.id,
      error: error instanceof Error ? error.message : String(error),
    } satisfies RenderResponse)
  }
}

function postTransfer(message: RenderResponse, transfer: unknown[]) {
  ;(self.postMessage as (message: RenderResponse, transfer: unknown[]) => void)(message, transfer)
}

function renderGraffitiTexture(splats: GraffitiSplat[]) {
  const canvas = createGraffitiOffscreenCanvas()
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Failed to initialize graffiti worker context')
  }

  paintLoftPaintingTextures(context)
  paintGraffitiSplats(context, splats)

  return canvas.transferToImageBitmap()
}
