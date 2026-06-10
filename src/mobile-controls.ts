import { usesTouchControls, usesTouchMovementControls } from './device.ts'
import { setTouchMoveInput } from './input.ts'

type StyleAction = {
  label: string
  apply: (direction: number) => void
}

type DpadDirection = {
  label: string
  name: string
  x: number
  z: number
}

const actions: StyleAction[] = []
const dpadDirections: DpadDirection[] = [
  { label: '↖', name: 'up-left', x: -1, z: 1 },
  { label: '▲', name: 'up', x: 0, z: 1 },
  { label: '↗', name: 'up-right', x: 1, z: 1 },
  { label: '◀', name: 'left', x: -1, z: 0 },
  { label: '▶', name: 'right', x: 1, z: 0 },
  { label: '↙', name: 'down-left', x: -1, z: -1 },
  { label: '▼', name: 'down', x: 0, z: -1 },
  { label: '↘', name: 'down-right', x: 1, z: -1 },
]

export function createMobileControls(options: {
  cycleHair: (direction: number) => void
  cycleHairColor: (direction: number) => void
  cycleSkin: (direction: number) => void
  cycleIdle: (direction: number) => void
  cycleShirt: (direction: number) => void
  cyclePants: (direction: number) => void
  cycleAccessory: (direction: number) => void
  openChatInput: () => void
  dismissVideoHint: () => void
  startJumping: () => void
  stopJumping: () => void
}) {
  updateTouchControlsMode()
  addEventListener('resize', updateTouchControlsMode)
  actions.length = 0
  actions.push(
    { label: 'Hair color', apply: options.cycleHairColor },
    { label: 'Hair style', apply: options.cycleHair },
    { label: 'Skin tone', apply: options.cycleSkin },
    { label: 'Top wear', apply: options.cycleShirt },
    { label: 'Bottom wear', apply: options.cyclePants },
    { label: 'Accessories', apply: options.cycleAccessory },
    { label: 'Dance move', apply: options.cycleIdle },
  )

  const root = document.createElement('div')
  const toggle = document.createElement('button')
  const panel = document.createElement('div')
  const speak = document.createElement('button')
  const dpad = createDpad({
    startJumping: options.startJumping,
    stopJumping: options.stopJumping,
  })

  root.id = 'mobile-controls'
  root.dataset.open = 'false'
  toggle.id = 'mobile-menu-toggle'
  toggle.type = 'button'
  toggle.ariaLabel = 'Open menu'
  toggle.textContent = '☰'
  speak.id = 'mobile-speak'
  speak.type = 'button'
  speak.ariaLabel = 'Speak'
  speak.textContent = '💬'
  panel.id = 'mobile-menu'

  panel.append(...actions.map(actionRow))
  root.append(toggle, panel, speak, dpad)
  document.body.append(root)

  toggle.addEventListener('click', () => {
    const open = root.dataset.open !== 'true'

    root.dataset.open = String(open)
    toggle.ariaLabel = open ? 'Close menu' : 'Open menu'
    options.dismissVideoHint()
  })
  speak.addEventListener('click', () => {
    root.dataset.open = 'false'
    toggle.ariaLabel = 'Open menu'
    options.dismissVideoHint()
    options.openChatInput()
  })

  return root
}

function updateTouchControlsMode() {
  document.documentElement.dataset.touchControls = String(usesTouchControls())
  document.documentElement.dataset.touchMovementControls = String(usesTouchMovementControls())
}

function createDpad(options: {
  startJumping: () => void
  stopJumping: () => void
}) {
  const root = document.createElement('div')
  const active = new Map<number, DpadDirection>()

  root.id = 'mobile-dpad'
  root.setAttribute('aria-label', 'Move')
  root.append(...dpadDirections.map(direction => dpadButton(direction, active)), jumpButton(options))

  return root
}

function jumpButton(options: {
  startJumping: () => void
  stopJumping: () => void
}) {
  const button = document.createElement('button')
  const active = new Set<number>()

  button.type = 'button'
  button.className = 'mobile-dpad-button'
  button.dataset.direction = 'jump'
  button.ariaLabel = 'Jump'
  button.textContent = 'B'
  button.addEventListener('pointerdown', event => {
    event.preventDefault()
    event.stopPropagation()
    active.add(event.pointerId)
    button.setPointerCapture(event.pointerId)
    options.startJumping()
  })
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    button.addEventListener(eventName, event => {
      event.preventDefault()
      event.stopPropagation()
      active.delete(event.pointerId)
      if (active.size === 0) {
        options.stopJumping()
      }
    })
  }

  return button
}

function dpadButton(direction: DpadDirection, active: Map<number, DpadDirection>) {
  const button = document.createElement('button')

  button.type = 'button'
  button.className = 'mobile-dpad-button'
  button.dataset.direction = direction.name
  button.ariaLabel = `Move ${direction.name}`
  button.textContent = direction.label
  button.addEventListener('pointerdown', event => {
    event.preventDefault()
    event.stopPropagation()
    active.set(event.pointerId, direction)
    button.setPointerCapture(event.pointerId)
    syncDpadInput(active)
  })
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    button.addEventListener(eventName, event => {
      event.preventDefault()
      event.stopPropagation()
      active.delete(event.pointerId)
      syncDpadInput(active)
    })
  }

  return button
}

function syncDpadInput(active: Map<number, DpadDirection>) {
  let x = 0
  let z = 0

  for (const direction of active.values()) {
    x += direction.x
    z += direction.z
  }

  setTouchMoveInput(Math.sign(x), Math.sign(z))
}

function actionRow(action: StyleAction) {
  const row = document.createElement('div')
  const previous = document.createElement('button')
  const next = document.createElement('button')
  const label = document.createElement('span')

  row.className = 'mobile-menu-row'
  previous.type = 'button'
  next.type = 'button'
  previous.textContent = '👈'
  next.textContent = '👉'
  label.textContent = action.label
  previous.addEventListener('click', () => action.apply(-1))
  next.addEventListener('click', () => action.apply(1))
  row.append(previous, label, next)

  return row
}
