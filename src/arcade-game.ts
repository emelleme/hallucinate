import type { Quat, Vec3 } from './types.ts'

type Point = {
  x: number
  y: number
}

type Star = {
  color: string
  size: number
  trail: Point[]
  x: number
  y: number
  z: number
}

type Laser = {
  life: number
  maxLife: number
  velocity: Vec3
  x: number
  y: number
  z: number
}

const settings = {
  numStars: 2000,
  fieldSize: 8000,
  projectionScale: 300,
  baseSpeed: 0.1,
  maxThrustSpeed: 8,
  starSize: 1,
  starTrailAlpha: 0.4,
  turnRateSensitivity: 0.05,
  trailLength: 3,
  starColors: ['#ffffff', '#ffffaa', '#aaaaff', '#ffaaaa', '#aaffaa'],
  thrustBar: { width: 24, height: 120, margin: 24 },
} as const
const viewBounds = 500
const turnSpeed = 0.08
const maxTurnAngle = Math.PI / 6

export function createArcadeGame(root: HTMLElement) {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Arcade game canvas context is unavailable')
  }

  const ctx = context

  canvas.id = 'arcade-game-canvas'
  root.append(canvas)

  const stars: Star[] = []
  const lasers: Laser[] = []
  const cleanups: (() => void)[] = []
  let width = 1
  let height = 1
  let centerX = 0.5
  let centerY = 0.5
  let frame = 0
  let running = false
  let thrust = 0
  let targetThrust = 0
  let shipX = 0
  let shipY = 0
  let shipZ = 0
  let shipOrientation: Quat = [1, 0, 0, 0]
  let roll = 0
  let yawRate = 0
  let pitchRate = 0
  let targetYawRate = 0
  let targetPitchRate = 0
  let targetRoll = 0
  let mouseX = centerX
  let mouseY = centerY

  return {
    start() {
      if (running) {
        return
      }

      running = true
      reset()
      bind()
      resize()
      root.focus()
      frame = requestAnimationFrame(animate)
    },
    stop() {
      if (!running) {
        return
      }

      running = false
      cancelAnimationFrame(frame)
      for (const cleanup of cleanups.splice(0)) {
        cleanup()
      }
      targetThrust = 0
    },
  }

  function reset() {
    stars.length = 0
    lasers.length = 0
    thrust = 0
    targetThrust = 0
    shipX = 0
    shipY = 0
    shipZ = 0
    shipOrientation = [1, 0, 0, 0]
    roll = 0
    yawRate = 0
    pitchRate = 0
    targetYawRate = 0
    targetPitchRate = 0
    targetRoll = 0
    initStars()
  }

  function bind() {
    listen(window, 'resize', resize)
    for (const type of ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      listen(window, type, event => {
        event.stopPropagation()
      }, { capture: true })
    }
    listen(root, 'contextmenu', event => {
      event.preventDefault()
      event.stopPropagation()
    })
    listen(root, 'pointermove', event => {
      const pointer = event as PointerEvent

      updatePointer(pointer)
      event.stopPropagation()
    }, { capture: true })
    listen(root, 'pointerdown', event => {
      if (event.target instanceof HTMLButtonElement) {
        return
      }

      const pointer = event as PointerEvent

      updatePointer(pointer)
      targetThrust = 1
      root.setPointerCapture(pointer.pointerId)
      event.preventDefault()
      event.stopPropagation()
    }, { capture: true })
    listen(root, 'pointerup', event => {
      const pointer = event as PointerEvent

      releaseThrust()
      if (root.hasPointerCapture(pointer.pointerId)) {
        root.releasePointerCapture(pointer.pointerId)
      }
      event.preventDefault()
      event.stopPropagation()
    }, { capture: true })
    listen(root, 'pointercancel', event => {
      releaseThrust()
      event.preventDefault()
      event.stopPropagation()
    }, { capture: true })
    listen(root, 'mouseleave', event => {
      releaseThrust()
      event.stopPropagation()
    })
    listen(root, 'touchstart', event => {
      const touch = (event as TouchEvent).touches[0]

      if (!touch) {
        return
      }

      updateTouch(touch)
      targetThrust = 1
      event.preventDefault()
      event.stopPropagation()
    }, { capture: true, passive: false })
    listen(root, 'touchmove', event => {
      const touch = (event as TouchEvent).touches[0]

      if (!touch) {
        return
      }

      updateTouch(touch)
      event.preventDefault()
      event.stopPropagation()
    }, { capture: true, passive: false })
    listen(root, 'touchend', event => {
      releaseThrust()
      event.preventDefault()
      event.stopPropagation()
    }, { capture: true, passive: false })
    listen(root, 'touchcancel', event => {
      releaseThrust()
      event.preventDefault()
      event.stopPropagation()
    }, { capture: true, passive: false })
    listen(root, 'keydown', event => {
      const key = (event as KeyboardEvent).key.toLowerCase()

      if (key === 'z' || key === ' ') {
        shootLaser()
        event.preventDefault()
        event.stopPropagation()
      }
    }, { capture: true })
  }

  function listen(target: EventTarget, type: string, listener: EventListener, options?: AddEventListenerOptions) {
    target.addEventListener(type, listener, options)
    cleanups.push(() => target.removeEventListener(type, listener, options))
  }

  function resize() {
    const ratio = devicePixelRatio || 1

    width = Math.max(1, root.clientWidth)
    height = Math.max(1, root.clientHeight)
    centerX = width / 2
    centerY = height / 2
    canvas.width = Math.floor(width * ratio)
    canvas.height = Math.floor(height * ratio)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    mouseX = centerX
    mouseY = centerY
  }

  function updatePointer(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect()

    mouseX = event.clientX - rect.left
    mouseY = event.clientY - rect.top
  }

  function updateTouch(touch: Touch) {
    const rect = canvas.getBoundingClientRect()

    mouseX = touch.clientX - rect.left
    mouseY = touch.clientY - rect.top
  }

  function releaseThrust() {
    targetThrust = 0
    targetYawRate = 0
    targetPitchRate = 0
    targetRoll = 0
  }

  function createStar(): Star {
    return {
      x: (Math.random() - 0.5) * settings.fieldSize * 4,
      y: (Math.random() - 0.5) * settings.fieldSize * 4,
      z: (Math.random() - 0.5) * settings.fieldSize * 4,
      color: settings.starColors[Math.floor(Math.random() * settings.starColors.length)]!,
      trail: [],
      size: 1 + Math.pow(Math.random(), 10) * 40,
    }
  }

  function initStars() {
    stars.length = 0
    for (let i = 0; i < settings.numStars; i++) {
      stars.push(createStar())
    }
  }

  function updateStars() {
    const maxDistSq = (settings.fieldSize * 2) ** 2

    for (const star of stars) {
      const dx = star.x - shipX
      const dy = star.y - shipY
      const dz = star.z - shipZ
      const distSq = dx * dx + dy * dy + dz * dz

      if (distSq <= maxDistSq) {
        continue
      }

      const theta = Math.random() * 2 * Math.PI
      const phi = Math.acos(2 * Math.random() - 1)
      const distance = settings.fieldSize * 2
      const randDirX = Math.sin(phi) * Math.cos(theta)
      const randDirY = Math.sin(phi) * Math.sin(theta)
      const randDirZ = Math.cos(phi)

      star.x = shipX + randDirX * distance
      star.y = shipY + randDirY * distance
      star.z = shipZ + randDirZ * distance
      star.color = settings.starColors[Math.floor(Math.random() * settings.starColors.length)]!
      star.trail = []
      star.size = 1 + Math.pow(Math.random(), 3) * 4
    }
  }

  function animate() {
    const dynamicTrailAlpha = settings.starTrailAlpha * (1 - thrust * 0.6)

    ctx.fillStyle = `rgba(0, 0, 0, ${dynamicTrailAlpha})`
    ctx.fillRect(0, 0, width, height)
    thrust += (targetThrust - thrust) * 0.05

    const speed = settings.baseSpeed + thrust * settings.maxThrustSpeed
    const dynamicTurnSensitivity = settings.turnRateSensitivity * (1 + targetThrust * 2)
    const offsetX = (mouseX - centerX) / centerX
    const offsetY = (mouseY - centerY) / centerY

    targetYawRate = offsetX * dynamicTurnSensitivity
    targetPitchRate = -offsetY * dynamicTurnSensitivity
    targetRoll = offsetX * maxTurnAngle * 1.5

    const actualTurnSpeed = turnSpeed + thrust * 0.04

    roll += (targetRoll - roll) * actualTurnSpeed
    yawRate += (targetYawRate - yawRate) * actualTurnSpeed
    pitchRate += (targetPitchRate - pitchRate) * actualTurnSpeed

    const yawQuat = axisAngle([0, 1, 0], yawRate)
    const pitchQuat = axisAngle([1, 0, 0], pitchRate)

    shipOrientation = normalizeQuat(multiplyQuat(multiplyQuat(shipOrientation, yawQuat), pitchQuat))

    const forward = transformVector([0, 0, 1], shipOrientation)

    shipX += forward[0] * speed * 100
    shipY += forward[1] * speed * 100
    shipZ += forward[2] * speed * 100
    updateStars()
    drawStars()
    for (const laser of lasers) {
      renderFireball(laser)
    }
    updateLasers()
    drawThrustWidget()

    if (running) {
      frame = requestAnimationFrame(animate)
    }
  }

  function drawStars() {
    const drawables: Array<{ opacity: number; size: number; star: Star }> = []

    for (const star of stars) {
      const drawable = prepareStar(star)

      if (drawable) {
        drawables.push(drawable)
      }
    }

    drawables.sort((a, b) => a.size - b.size)

    let currentSize = -1

    for (const drawable of drawables) {
      if (drawable.size !== currentSize) {
        currentSize = drawable.size
        ctx.lineWidth = currentSize * 2
      }
      renderStar(drawable)
    }
  }

  function prepareStar(star: Star) {
    const starVec = sceneToView(star.x, star.y, star.z)

    if (starVec[2] <= 1) {
      star.trail = []
      return
    }

    const screenX = (starVec[0] / starVec[2]) * settings.projectionScale + centerX
    const screenY = (starVec[1] / starVec[2]) * settings.projectionScale + centerY

    star.trail.push({ x: screenX, y: screenY })
    if (star.trail.length > settings.trailLength) {
      star.trail.shift()
    }

    if (screenX < -viewBounds || screenX > width + viewBounds || screenY < -viewBounds
      || screenY > height + viewBounds)
    {
      star.trail = []
      return
    }

    const distance = Math.hypot(starVec[0], starVec[1], starVec[2])

    return {
      star,
      size: Math.max(1, Math.round(star.size * settings.starSize * (1000 / distance))),
      opacity: Math.max(0.1, Math.min(1, 2000 / distance)),
    }
  }

  function renderStar(drawable: { opacity: number; size: number; star: Star }) {
    const { star, opacity, size } = drawable
    const points = star.trail

    if (points.length === 0) {
      return
    }

    const color = star.color + Math.floor(opacity * 200).toString(16).padStart(2, '0')

    if (points.length === 1) {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(points[0]!.x, points[0]!.y, size, 0, 2 * Math.PI)
      ctx.fill()
      return
    }

    ctx.strokeStyle = color
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(points[0]!.x, points[0]!.y)

    for (let i = 1; i < points.length - 1; i++) {
      const point = points[i]!
      const next = points[i + 1]!

      ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2)
    }

    ctx.lineTo(points[points.length - 1]!.x, points[points.length - 1]!.y)
    ctx.stroke()
  }

  function drawThrustWidget() {
    const { width: barWidth, height: barHeight, margin } = settings.thrustBar
    const x = width - barWidth - margin
    const y = margin

    ctx.save()
    ctx.globalAlpha = 0.8
    ctx.fillStyle = '#222'
    ctx.fillRect(x, y, barWidth, barHeight)
    ctx.fillStyle = '#0ff'
    ctx.fillRect(x, y + barHeight * (1 - thrust), barWidth, barHeight * thrust)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.strokeRect(x, y, barWidth, barHeight)
    ctx.font = 'bold 14px monospace'
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.fillText('THRUST', x + barWidth / 2, y + barHeight + 18)
    ctx.restore()
  }

  function shootLaser() {
    const forward = transformVector([0, 0, 1], shipOrientation)

    lasers.push({
      x: shipX + forward[0] * 50,
      y: shipY + forward[1] * 50,
      z: shipZ + forward[2] * 50,
      velocity: [forward[0] * 30, forward[1] * 30, forward[2] * 30],
      life: 120,
      maxLife: 120,
    })
  }

  function renderFireball(laser: Laser) {
    const laserVec = sceneToView(laser.x, laser.y, laser.z)

    if (laserVec[2] <= 0) {
      return
    }

    const screenX = (laserVec[0] / laserVec[2]) * settings.projectionScale + centerX
    const screenY = (laserVec[1] / laserVec[2]) * settings.projectionScale + centerY + 70

    if (screenX < 0 || screenX > width || screenY < 0 || screenY > height) {
      return
    }

    const distance = Math.hypot(laserVec[0], laserVec[1], laserVec[2])
    const size = Math.max(1, 2000 / distance)
    const opacity = Math.max(0.1, Math.min(1, 2000 / distance)) * (laser.life / laser.maxLife)

    ctx.fillStyle = `rgba(255, 100, 0, ${opacity})`
    ctx.beginPath()
    ctx.arc(screenX, screenY, size, 0, 2 * Math.PI)
    ctx.fill()

    ctx.fillStyle = `rgba(255, 255, 0, ${opacity * 0.8})`
    ctx.beginPath()
    ctx.arc(screenX, screenY, size * 0.6, 0, 2 * Math.PI)
    ctx.fill()
  }

  function updateLasers() {
    for (let i = lasers.length - 1; i >= 0; i--) {
      const laser = lasers[i]!

      laser.life -= 1
      if (laser.life <= 0) {
        lasers.splice(i, 1)
        continue
      }

      laser.x += laser.velocity[0]
      laser.y += laser.velocity[1]
      laser.z += laser.velocity[2]
    }
  }

  function sceneToView(x: number, y: number, z: number): Vec3 {
    const local: Vec3 = [x - shipX, y - shipY, z - shipZ]
    const inverse = inverseQuat(shipOrientation)
    const unrolled = transformVector(local, inverse)
    const rollQuat = axisAngle([0, 0, 1], -roll)

    return transformVector(unrolled, rollQuat)
  }
}

function axisAngle(axis: Vec3, angle: number): Quat {
  const half = angle / 2
  const sin = Math.sin(half)

  return [Math.cos(half), axis[0] * sin, axis[1] * sin, axis[2] * sin]
}

function multiplyQuat(a: Quat, b: Quat): Quat {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ]
}

function normalizeQuat(quat: Quat): Quat {
  const length = Math.hypot(quat[0], quat[1], quat[2], quat[3])

  return [quat[0] / length, quat[1] / length, quat[2] / length, quat[3] / length]
}

function inverseQuat(quat: Quat): Quat {
  const lengthSq = quat[0] * quat[0] + quat[1] * quat[1] + quat[2] * quat[2] + quat[3] * quat[3]

  return [quat[0] / lengthSq, -quat[1] / lengthSq, -quat[2] / lengthSq, -quat[3] / lengthSq]
}

function transformVector(point: Vec3, quat: Quat): Vec3 {
  const vectorQuat: Quat = [0, point[0], point[1], point[2]]
  const next = multiplyQuat(multiplyQuat(quat, vectorQuat), inverseQuat(quat))

  return [next[1], next[2], next[3]]
}
