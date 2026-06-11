import { createDomWallProjection, domWallCorners } from './dom-wall.ts'
import { type ProjectedPoint, projectedQuadTransform, projectWallPointWithMinDepthInto,
  type WallProjector } from './projection.ts'
import { outsideScheduleWall } from './scene-data.ts'
import type { Vec3, VideoZone } from './types.ts'

type Camera = {
  center: Vec3
  eye: Vec3
}

type ScheduleSet = {
  duration: number
  id: string
  startAt: number
  title: string
}

type ScheduleColumn = {
  sets: ScheduleSet[]
  zone: VideoZone
}

type SchedulePayload = {
  columns: ScheduleColumn[]
}

const refreshInterval = 30_000
const viewerDuration = 360
const viewerEase = 'cubic-bezier(0, 0, 0.2, 1)'
const viewerMargin = 24
const wallScale = 112
const zones: VideoZone[] = ['inside', 'outside', 'upstairs', 'tent']
const zoneLabels: Record<VideoZone, string> = {
  inside: 'inside',
  loft: 'loft',
  outside: 'outside',
  tent: 'tent',
  upstairs: 'upstairs',
}

export function createScheduleWallUi(element: HTMLElement) {
  const projection = createDomWallProjection(element, {
    opacity: '0.94',
    pointerEvents: 'auto',
    scale: wallScale,
  })
  const panel = document.createElement('div')
  const viewer = document.createElement('div')
  const viewerPanel = document.createElement('div')
  const viewerClose = document.createElement('button')
  const viewerMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? { matches: false }
  let viewerAnimation: Animation | undefined
  let refreshedAt = 0
  let loading: Promise<void> | undefined
  let visible = false
  let viewerOpen = false
  const cornerA: Vec3 = [0, 0, 0]
  const cornerB: Vec3 = [0, 0, 0]
  const cornerC: Vec3 = [0, 0, 0]
  const cornerD: Vec3 = [0, 0, 0]
  const pointA: ProjectedPoint = { x: 0, y: 0 }
  const pointB: ProjectedPoint = { x: 0, y: 0 }
  const pointC: ProjectedPoint = { x: 0, y: 0 }
  const pointD: ProjectedPoint = { x: 0, y: 0 }
  const wallPoints = [pointA, pointB, pointC, pointD]
  let payload: SchedulePayload = {
    columns: zones.map(zone => ({ zone, sets: [] })),
  }

  panel.id = 'schedule-wall-panel'
  viewer.id = 'schedule-wall-viewer'
  viewerPanel.id = 'schedule-wall-viewer-panel'
  viewerClose.id = 'schedule-wall-viewer-close'
  viewerClose.type = 'button'
  viewerClose.textContent = 'X'
  viewerClose.setAttribute('aria-label', 'close schedule')
  viewer.dataset.open = 'false'
  viewerPanel.append(viewerClose)
  viewer.append(viewerPanel)
  element.append(panel)
  document.body.append(viewer)
  element.addEventListener('click', () => openViewer())
  viewerClose.addEventListener('click', () => closeViewer())
  viewer.addEventListener('click', event => {
    if (event.target === viewer) {
      closeViewer()
    }
  })
  viewer.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeViewer()
    }
  })
  render()

  return {
    hide() {
      visible = false
      projection.hide()
      element.style.pointerEvents = 'none'
    },
    refresh,
    update(camera: Camera, projector: WallProjector) {
      visible = projection.update(camera, projector, outsideScheduleWall)
      element.style.pointerEvents = visible ? 'auto' : 'none'
      if (visible) {
        updateWallPoints(projector)
      }

      if (visible && performance.now() - refreshedAt >= refreshInterval) {
        void refresh()
      }
    },
  }

  async function refresh() {
    if (loading) {
      await loading
      return
    }

    loading = fetchSchedule()
      .then(next => {
        payload = next
        refreshedAt = performance.now()
        render()
      })
      .catch((e: unknown) => console.error(e))
      .finally(() => {
        loading = undefined
      })
    await loading
  }

  async function fetchSchedule() {
    const response = await fetch('/api/video-schedule', { cache: 'no-store' })

    if (!response.ok) {
      throw new Error(`Video schedule request failed: ${response.status}`)
    }

    return await response.json() as SchedulePayload
  }

  function render() {
    panel.replaceChildren(...renderColumns())
    viewerPanel.replaceChildren(...renderColumns(), viewerClose)
  }

  function renderColumns() {
    return payload.columns.map(column => {
      const section = document.createElement('section')
      const heading = document.createElement('h2')
      const list = document.createElement('ol')

      section.className = 'schedule-wall-column'
      heading.textContent = zoneLabels[column.zone]
      list.className = 'schedule-wall-list'
      list.replaceChildren(...column.sets.map((set, index) => {
        const item = document.createElement('li')
        const time = document.createElement('time')
        const title = document.createElement('span')

        item.className = 'schedule-wall-set'
        item.dataset.current = String(index === 0)
        time.className = 'schedule-wall-time'
        time.dateTime = new Date(set.startAt).toISOString()
        time.textContent = localTime(set.startAt)
        title.className = 'schedule-wall-title'
        title.textContent = set.title
        item.append(time, title)

        return item
      }))
      section.append(heading, list)

      return section
    })
  }

  function openViewer() {
    if (viewerOpen || !visible) {
      return
    }

    viewerOpen = true
    viewer.dataset.open = 'true'
    viewer.tabIndex = -1
    viewer.focus()
    animateViewer(false)
  }

  function closeViewer() {
    if (!viewerOpen) {
      return
    }

    viewerOpen = false
    animateViewer(true)
  }

  function animateViewer(closing: boolean) {
    resetViewerPanelAnimation()

    if (viewerMotion.matches) {
      viewer.dataset.open = String(!closing)
      return
    }

    viewerPanel.getBoundingClientRect()
    const transform = wallTransform(viewerPanel.getBoundingClientRect())

    viewerPanel.style.transformOrigin = '0 0'
    if (!closing) {
      viewerPanel.style.opacity = '0.82'
      viewerPanel.style.transform = transform
      viewerPanel.getBoundingClientRect()
    }
    viewerAnimation = viewerPanel.animate([
      {
        opacity: closing ? 1 : 0.82,
        transform: closing ? 'translate3d(0, 0, 0) scale(1, 1)' : transform,
      },
      {
        opacity: closing ? 0.82 : 1,
        transform: closing ? transform : 'translate3d(0, 0, 0) scale(1, 1)',
      },
    ], {
      duration: viewerDuration,
      easing: viewerEase,
      fill: 'both',
    })
    const animation = viewerAnimation

    void animation.finished
      .then(() => finishViewerAnimation(closing, animation))
      .catch(() => {})
  }

  function finishViewerAnimation(closing: boolean, animation: Animation | undefined) {
    if (viewerAnimation !== animation) {
      return
    }

    resetViewerPanelAnimation()
    if (closing) {
      viewer.dataset.open = 'false'
    }
  }

  function resetViewerPanelAnimation() {
    for (const animation of viewerPanel.getAnimations()) {
      animation.cancel()
    }
    viewerAnimation = undefined
    viewerPanel.style.opacity = ''
    viewerPanel.style.transform = ''
    viewerPanel.style.transformOrigin = ''
  }

  function updateWallPoints(projector: WallProjector) {
    domWallCorners(outsideScheduleWall, cornerA, cornerB, cornerC, cornerD)
    projectWallPointWithMinDepthInto(cornerA, projector, pointA, 0.05)
    projectWallPointWithMinDepthInto(cornerB, projector, pointB, 0.05)
    projectWallPointWithMinDepthInto(cornerC, projector, pointC, 0.05)
    projectWallPointWithMinDepthInto(cornerD, projector, pointD, 0.05)
  }

  function wallTransform(target: DOMRect) {
    const points = wallPoints.map(point => ({
      x: point.x - target.left,
      y: point.y - target.top,
    }))

    return projectedQuadTransform(target.width, target.height, points)
  }
}

function localTime(value: number) {
  const date = new Date(value)

  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}
