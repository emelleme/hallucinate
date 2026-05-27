import { dot, subtract } from './math.ts'
import { projectedQuadTransform, projectWallPoint } from './projection.ts'
import { djVideoWall, outsideVideoWall, videoTracks } from './scene-data.ts'
import { isOutside } from './scene.ts'
import type { Vec3, VideoZone, YouTubePlayer, YouTubeWindow } from './types.ts'

type Camera = { eye: Vec3; center: Vec3 }
type Wall = typeof djVideoWall

export function videoZones(): VideoZone[] {
  return ['inside', 'outside']
}

export function createDjVideoUi(
  element: HTMLElement,
  canvas: HTMLCanvasElement,
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
  const players: Partial<Record<VideoZone, YouTubePlayer>> = {}
  const ready: Partial<Record<VideoZone, boolean>> = {}
  let zone: VideoZone = isOutside(position) ? 'outside' : 'inside'

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
    get zone() {
      return zone
    },
    setZoneFromPosition() {
      zone = isOutside(position) ? 'outside' : 'inside'
    },
    syncCurrentTime() {
      for (const area of videoZones()) {
        if (ready[area]) {
          times[area] = players[area]!.getCurrentTime()
        }
      }
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
                const load = area === zone ? players[area]!.loadVideoById : players[area]!.cueVideoById

                load.call(players[area]!, {
                  videoId: videoTracks[area],
                  startSeconds: times[area],
                })

                if (area === zone) {
                  players[area]!.playVideo()
                }
                else {
                  players[area]!.pauseVideo()
                }
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
    update(camera: Camera) {
      const nextZone: VideoZone = isOutside(position) ? 'outside' : 'inside'

      if (nextZone !== zone) {
        if (ready[zone]) {
          times[zone] = players[zone]!.getCurrentTime()
          players[zone]!.pauseVideo()
        }

        zone = nextZone

        if (ready[zone]) {
          players[zone]!.playVideo()
        }
      }

      const wall = isOutside(position) ? outsideVideoWall : djVideoWall

      if (!djVideoFacesCamera(camera, wall)) {
        element.style.opacity = '0'
        layers.inside.style.pointerEvents = 'none'
        layers.outside.style.pointerEvents = 'none'
        return
      }

      const left = wall.x - wall.width / 2
      const right = wall.x + wall.width / 2
      const bottom = wall.y - wall.height / 2
      const top = wall.y + wall.height / 2
      const points = wall.normal[2] < 0
        ? [
          projectWallPoint([right, bottom, wall.z], camera, canvas),
          projectWallPoint([left, bottom, wall.z], camera, canvas),
          projectWallPoint([left, top, wall.z], camera, canvas),
          projectWallPoint([right, top, wall.z], camera, canvas),
        ]
        : [
          projectWallPoint([left, bottom, wall.z], camera, canvas),
          projectWallPoint([right, bottom, wall.z], camera, canvas),
          projectWallPoint([right, top, wall.z], camera, canvas),
          projectWallPoint([left, top, wall.z], camera, canvas),
        ]

      element.style.opacity = '0.74'
      layers.inside.style.opacity = zone === 'inside' ? '1' : '0'
      layers.outside.style.opacity = zone === 'outside' ? '1' : '0'
      layers.inside.style.pointerEvents = zone === 'inside' ? 'auto' : 'none'
      layers.outside.style.pointerEvents = zone === 'outside' ? 'auto' : 'none'
      element.style.width = `${wall.width * 120}px`
      element.style.height = `${wall.height * 120}px`
      element.style.transform = projectedQuadTransform(
        wall.width * 120,
        wall.height * 120,
        points,
      )
    },
  }
}

function djVideoFacesCamera(camera: Camera, wall: Wall) {
  const center: Vec3 = [wall.x, wall.y, wall.z]
  const toCamera = subtract(camera.eye, center)
  const toVideo = subtract(center, camera.eye)
  const forward = subtract(camera.center, camera.eye)

  return dot(wall.normal, toCamera) > 0 && dot(forward, toVideo) > 0
}
