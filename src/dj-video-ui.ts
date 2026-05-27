import { projectedQuadTransform, projectWallPointInto } from './projection.ts'
import type { ProjectedPoint, WallProjector } from './projection.ts'
import { djVideoWall, outsideVideoWall, videoPlaylists, videoTracks } from './scene-data.ts'
import { isOutside } from './scene.ts'
import type { Vec3, VideoZone, YouTubePlayer, YouTubeWindow } from './types.ts'

type Camera = { eye: Vec3; center: Vec3 }
type Wall = typeof djVideoWall

export function videoZones(): VideoZone[] {
  return ['inside', 'outside']
}

export function createDjVideoUi(
  element: HTMLElement,
  position: Vec3,
) {
  const layers: Record<VideoZone, HTMLElement> = {
    inside: document.createElement('div'),
    outside: document.createElement('div'),
  }
  const mounts: Record<VideoZone, HTMLElement> = {
    inside: document.createElement('div'),
    outside: document.createElement('div'),
  }
  const times: Record<VideoZone, number> = {
    inside: 0,
    outside: 0,
  }
  const trackIndexes: Record<VideoZone, number> = {
    inside: 0,
    outside: 0,
  }
  const players: Partial<Record<VideoZone, YouTubePlayer>> = {}
  const ready: Partial<Record<VideoZone, boolean>> = {}
  const pendingStarts: Partial<Record<VideoZone, number>> = {}
  let zone: VideoZone = isOutside(position) ? 'outside' : 'inside'
  const setElementStyle = createStyleSetter(element.style)
  const setInsideStyle = createStyleSetter(layers.inside.style)
  const setOutsideStyle = createStyleSetter(layers.outside.style)
  const cornerA: Vec3 = [0, 0, 0]
  const cornerB: Vec3 = [0, 0, 0]
  const cornerC: Vec3 = [0, 0, 0]
  const cornerD: Vec3 = [0, 0, 0]
  const pointA: ProjectedPoint = { x: 0, y: 0 }
  const pointB: ProjectedPoint = { x: 0, y: 0 }
  const pointC: ProjectedPoint = { x: 0, y: 0 }
  const pointD: ProjectedPoint = { x: 0, y: 0 }
  const points = [pointA, pointB, pointC, pointD]

  for (const area of videoZones()) {
    const layer = layers[area]
    const mount = mounts[area]

    layer.style.position = 'absolute'
    layer.style.inset = '0'
    layer.style.width = '100%'
    layer.style.height = '100%'
    layer.style.opacity = '0'
    layer.style.pointerEvents = 'none'
    mount.style.width = '100%'
    mount.style.height = '100%'
    layer.append(mount)
    element.append(layer)
  }

  return {
    times,
    trackIndexes,
    get zone() {
      return zone
    },
    setZoneFromPosition() {
      zone = isOutside(position) ? 'outside' : 'inside'
    },
    syncCurrentTime() {
      syncVideoTime(zone, players, ready, pendingStarts, times, trackIndexes)
    },
    load() {
      const youtube = window as YouTubeWindow

      youtube.onYouTubeIframeAPIReady = () => {
        for (const area of videoZones()) {
          players[area] = new youtube.YT!.Player(mounts[area], {
            playerVars: {
              autoplay: 0,
              controls: 1,
              playsinline: 1,
              enablejsapi: 1,
            },
            events: {
              onReady() {
                ready[area] = true

                warmVideo(area, players, pendingStarts, times, trackIndexes)
              },
              onStateChange() {
                syncVideoTime(area, players, ready, pendingStarts, times, trackIndexes)
              },
            },
          })
        }
      }

      if (youtube.YT?.Player) {
        youtube.onYouTubeIframeAPIReady()
      }
      else {
        const script = document.createElement('script')

        script.src = 'https://www.youtube.com/iframe_api'
        document.head.append(script)
      }
    },
    update(camera: Camera, projector: WallProjector) {
      const nextZone: VideoZone = isOutside(position) ? 'outside' : 'inside'

      if (nextZone !== zone) {
        if (ready[zone]) {
          syncVideoTime(zone, players, ready, pendingStarts, times, trackIndexes)
          players[zone]!.pauseVideo()
        }

        zone = nextZone

        if (ready[zone]) {
          playVideoFromTime(zone, players, pendingStarts, times)
        }
      }

      const wall = isOutside(position) ? outsideVideoWall : djVideoWall

      if (!djVideoFacesCamera(camera, wall)) {
        setElementStyle('opacity', '0')
        setInsideStyle('pointerEvents', 'none')
        setOutsideStyle('pointerEvents', 'none')
        return
      }

      const left = wall.x - wall.width / 2
      const right = wall.x + wall.width / 2
      const bottom = wall.y - wall.height / 2
      const top = wall.y + wall.height / 2
      if (wall.normal[2] < 0) {
        setPoint(cornerA, right, bottom, wall.z)
        setPoint(cornerB, left, bottom, wall.z)
        setPoint(cornerC, left, top, wall.z)
        setPoint(cornerD, right, top, wall.z)
      }
      else {
        setPoint(cornerA, left, bottom, wall.z)
        setPoint(cornerB, right, bottom, wall.z)
        setPoint(cornerC, right, top, wall.z)
        setPoint(cornerD, left, top, wall.z)
      }

      projectWallPointInto(cornerA, projector, pointA)
      projectWallPointInto(cornerB, projector, pointB)
      projectWallPointInto(cornerC, projector, pointC)
      projectWallPointInto(cornerD, projector, pointD)

      setElementStyle('opacity', '0.74')
      setInsideStyle('opacity', zone === 'inside' ? '1' : '0')
      setOutsideStyle('opacity', zone === 'outside' ? '1' : '0')
      setInsideStyle('pointerEvents', zone === 'inside' ? 'auto' : 'none')
      setOutsideStyle('pointerEvents', zone === 'outside' ? 'auto' : 'none')
      setElementStyle('width', `${wall.width * 120}px`)
      setElementStyle('height', `${wall.height * 120}px`)
      setElementStyle('transform', projectedQuadTransform(
        wall.width * 120,
        wall.height * 120,
        points,
      ))
    },
    play() {
      if (ready[zone]) {
        playVideoFromTime(zone, players, pendingStarts, times)
        return true
      }

      return false
    },
  }
}

function warmVideo(
  area: VideoZone,
  players: Partial<Record<VideoZone, YouTubePlayer>>,
  pendingStarts: Partial<Record<VideoZone, number>>,
  times: Record<VideoZone, number>,
  trackIndexes: Record<VideoZone, number>,
) {
  cueVideoFromTime(area, players, pendingStarts, times, trackIndexes)
  players[area]!.playVideo()
  requestAnimationFrame(() => {
    players[area]!.pauseVideo()
  })
}

function cueVideoFromTime(
  area: VideoZone,
  players: Partial<Record<VideoZone, YouTubePlayer>>,
  pendingStarts: Partial<Record<VideoZone, number>>,
  times: Record<VideoZone, number>,
  trackIndexes: Record<VideoZone, number>,
) {
  pendingStarts[area] = times[area]
  const playlist = videoPlaylists[area]

  if (playlist) {
    players[area]!.cuePlaylist({
      index: trackIndexes[area],
      list: playlist,
      listType: 'playlist',
      startSeconds: times[area],
    })
  }
  else {
    players[area]!.cueVideoById({
      videoId: videoTracks[area],
      startSeconds: times[area],
    })
  }
}

function playVideoFromTime(
  area: VideoZone,
  players: Partial<Record<VideoZone, YouTubePlayer>>,
  pendingStarts: Partial<Record<VideoZone, number>>,
  times: Record<VideoZone, number>,
) {
  pendingStarts[area] = times[area]
  players[area]!.seekTo(times[area], true)
  players[area]!.playVideo()
}

function setPoint(target: Vec3, x: number, y: number, z: number) {
  target[0] = x
  target[1] = y
  target[2] = z
}

function syncVideoTime(
  area: VideoZone,
  players: Partial<Record<VideoZone, YouTubePlayer>>,
  ready: Partial<Record<VideoZone, boolean>>,
  pendingStarts: Partial<Record<VideoZone, number>>,
  times: Record<VideoZone, number>,
  trackIndexes: Record<VideoZone, number>,
) {
  if (ready[area]) {
    const time = players[area]!.getCurrentTime()
    const pendingStart = pendingStarts[area]

    if (videoPlaylists[area]) {
      trackIndexes[area] = players[area]!.getPlaylistIndex()
    }

    if (pendingStart !== undefined && time < pendingStart - 0.5) {
      players[area]!.seekTo(pendingStart, true)
    }
    else {
      delete pendingStarts[area]
      times[area] = time
    }
  }
}

type StyleName = 'height' | 'opacity' | 'pointerEvents' | 'transform' | 'width'

function createStyleSetter(style: CSSStyleDeclaration) {
  const values = new Map<StyleName, string>()

  return (name: StyleName, value: string) => {
    if (values.get(name) !== value) {
      values.set(name, value)
      style[name] = value
    }
  }
}

function djVideoFacesCamera(camera: Camera, wall: Wall) {
  const toCameraX = camera.eye[0] - wall.x
  const toCameraY = camera.eye[1] - wall.y
  const toCameraZ = camera.eye[2] - wall.z
  const toVideoX = wall.x - camera.eye[0]
  const toVideoY = wall.y - camera.eye[1]
  const toVideoZ = wall.z - camera.eye[2]
  const forwardX = camera.center[0] - camera.eye[0]
  const forwardY = camera.center[1] - camera.eye[1]
  const forwardZ = camera.center[2] - camera.eye[2]

  return wall.normal[0] * toCameraX + wall.normal[1] * toCameraY + wall.normal[2] * toCameraZ > 0
    && forwardX * toVideoX + forwardY * toVideoY + forwardZ * toVideoZ > 0
}
