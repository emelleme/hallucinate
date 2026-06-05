import { createDomWallProjection } from './dom-wall.ts'
import type { WallProjector } from './projection.ts'
import { outsidePhotoWall } from './scene-data.ts'
import type { Vec3 } from './types.ts'

type Camera = {
  center: Vec3
  eye: Vec3
}

type Photo = {
  createdAt: number
  timestamp: number
  url: string
}

type PhotoPage = {
  limit: number
  offset: number
  photos: Photo[]
  total: number
}

const refreshInterval = 30_000

export function createPhotoWallUi(element: HTMLElement, options: {
  admin: () => { enabled: boolean; pass: string }
  recoverFocus?: () => void
}) {
  const projection = createDomWallProjection(element, { opacity: '0.92' })
  const panel = document.createElement('div')
  const header = document.createElement('div')
  const nav = document.createElement('div')
  const previous = document.createElement('button')
  const next = document.createElement('button')
  const status = document.createElement('div')
  const grid = document.createElement('div')
  const viewer = document.createElement('dialog')
  const viewerPolaroid = document.createElement('div')
  const viewerImage = document.createElement('img')
  const viewerClose = document.createElement('button')
  let page: PhotoPage = { limit: 30, offset: 0, photos: [], total: 0 }
  let visible = false
  let loading = false
  let loaded = false
  let refreshedAt = 0

  panel.id = 'photo-wall-panel'
  header.id = 'photo-wall-header'
  nav.id = 'photo-wall-nav'
  status.id = 'photo-wall-status'
  grid.id = 'photo-wall-grid'
  viewer.id = 'photo-viewer-dialog'
  viewerPolaroid.id = 'photo-viewer-polaroid'
  viewerImage.id = 'photo-viewer-image'
  viewerClose.id = 'photo-viewer-close'
  previous.type = 'button'
  previous.textContent = '‹'
  previous.setAttribute('aria-label', 'previous photos')
  next.type = 'button'
  next.textContent = '›'
  next.setAttribute('aria-label', 'next photos')
  viewerImage.alt = 'photo'
  viewerClose.type = 'button'
  viewerClose.textContent = '✕'
  viewerClose.setAttribute('aria-label', 'close photo')
  nav.append(previous, next)
  header.append(status, nav)
  panel.append(header, grid)
  viewerPolaroid.append(viewerImage, viewerClose)
  viewer.append(viewerPolaroid)
  element.append(panel)
  document.body.append(viewer)

  previous.addEventListener('click', () => {
    page = { ...page, offset: Math.max(0, page.offset - page.limit) }
    void refresh()
    options.recoverFocus?.()
  })
  next.addEventListener('click', () => {
    page = { ...page, offset: page.offset + page.limit }
    void refresh()
    options.recoverFocus?.()
  })
  viewerClose.addEventListener('click', () => {
    closeViewer()
  })
  viewer.addEventListener('cancel', event => {
    event.preventDefault()
    closeViewer()
  })
  viewer.addEventListener('click', event => {
    if (event.target === viewer) {
      closeViewer()
    }
  })

  return {
    hide() {
      visible = false
      projection.hide()
      element.style.pointerEvents = 'none'
    },
    refresh,
    refreshLatest() {
      page = { ...page, offset: 0 }
      return refresh()
    },
    syncAdmin() {
      render()
    },
    update(camera: Camera, projector: WallProjector) {
      visible = projection.update(camera, projector, outsidePhotoWall)
      element.style.pointerEvents = visible ? 'auto' : 'none'

      if (visible && (!loaded || performance.now() - refreshedAt >= refreshInterval)) {
        void refresh()
      }
    },
  }

  async function refresh() {
    if (loading) {
      return
    }

    loading = true
    renderStatus('loading')
    try {
      const response = await fetch(`/api/photos?offset=${page.offset}`)

      if (!response.ok) {
        throw new Error(`Photo list failed ${response.status}`)
      }

      page = await jsonApiResponse<PhotoPage>(response, 'Photo list')
      loaded = true
      refreshedAt = performance.now()
      render()
    }
    catch (e) {
      console.error(e)
      renderStatus(e instanceof Error ? e.message : String(e))
    }
    finally {
      loading = false
    }
  }

  function render() {
    grid.replaceChildren()
    renderStatus(
      page.total === 0
        ? 'empty'
        : `${page.offset + 1}-${Math.min(page.offset + page.photos.length, page.total)} / ${page.total}`,
    )
    previous.disabled = page.offset === 0 || loading
    next.disabled = page.offset + page.limit >= page.total || loading

    const admin = options.admin()

    for (const photo of page.photos) {
      const item = document.createElement('div')
      const image = document.createElement('img')

      item.className = 'photo-wall-item'
      item.tabIndex = 0
      image.src = photo.url
      image.alt = new Date(photo.createdAt).toLocaleString()
      image.loading = 'lazy'
      item.append(image)
      item.addEventListener('click', () => {
        openViewer(photo)
      })
      item.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return
        }

        event.preventDefault()
        openViewer(photo)
      })

      if (admin.enabled) {
        const remove = document.createElement('button')

        remove.type = 'button'
        remove.className = 'photo-wall-delete'
        remove.textContent = '🗑️'
        remove.setAttribute('aria-label', `delete photo ${photo.timestamp}`)
        remove.addEventListener('click', async event => {
          event.preventDefault()
          event.stopPropagation()
          try {
            await deletePhoto(photo.timestamp, admin.pass)
            if (page.photos.length === 1 && page.offset > 0) {
              page = { ...page, offset: Math.max(0, page.offset - page.limit) }
            }
            await refresh()
            options.recoverFocus?.()
          }
          catch (e) {
            console.error(e)
          }
        })
        item.append(remove)
      }

      grid.append(item)
    }
  }

  function renderStatus(text: string) {
    status.textContent = text
  }

  function openViewer(photo: Photo) {
    viewerImage.src = photo.url
    viewerImage.alt = new Date(photo.createdAt).toLocaleString()
    viewer.showModal()
    viewerClose.focus()
  }

  function closeViewer() {
    viewerImage.removeAttribute('src')
    if (viewer.open) {
      viewer.close()
    }
    options.recoverFocus?.()
  }
}

async function deletePhoto(timestamp: number, pass: string) {
  const response = await fetch(`/api/photos/${timestamp}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pass }),
  })

  if (!response.ok) {
    throw new Error(`Photo delete failed ${response.status}`)
  }
}

async function jsonApiResponse<T>(response: Response, label: string): Promise<T> {
  const type = response.headers.get('content-type') ?? ''

  if (!type.includes('application/json')) {
    throw new Error(`${label} returned ${type || 'unknown content-type'}`)
  }

  return await response.json() as T
}
