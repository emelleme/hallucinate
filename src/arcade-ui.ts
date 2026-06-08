import { createArcadeGame } from './arcade-game.ts'

type RectLike = {
  height: number
  left: number
  top: number
  width: number
}

export function createArcadeUi(options: { onClose: () => void }) {
  const root = document.createElement('div')
  const shell = document.createElement('div')
  const screen = document.createElement('div')
  const close = document.createElement('button')
  const game = createArcadeGame(screen)
  let open = false

  root.id = 'arcade-root'
  root.tabIndex = -1
  root.dataset.open = 'false'
  shell.id = 'arcade-shell'
  screen.id = 'arcade-screen'
  screen.tabIndex = -1
  close.id = 'arcade-close'
  close.type = 'button'
  close.textContent = 'x'
  close.setAttribute('aria-label', 'Exit arcade')
  close.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    closeArcade()
  })
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeArcade()
    }
  }, { capture: true })

  shell.append(screen)
  root.append(shell, close)
  document.body.append(root)

  return {
    get active() {
      return open
    },
    open(first: RectLike) {
      if (open) {
        return
      }

      open = true
      root.dataset.open = 'true'
      root.dataset.playing = 'false'
      root.focus()
      shell.getAnimations().forEach(animation => animation.cancel())
      shell.style.transform = 'none'

      const last = shell.getBoundingClientRect()
      const dx = first.left - last.left
      const dy = first.top - last.top
      const sx = first.width / last.width
      const sy = first.height / last.height
      const animation = shell.animate([
        {
          opacity: '0.72',
          transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
        },
        {
          opacity: '1',
          transform: 'translate(0, 0) scale(1, 1)',
        },
      ], {
        duration: 620,
        easing: 'cubic-bezier(0.18, 0.92, 0.2, 1)',
        fill: 'both',
      })

      animation.onfinish = () => {
        if (!open) {
          return
        }

        root.dataset.playing = 'true'
        game.start()
      }
    },
    close: closeArcade,
  }

  function closeArcade() {
    if (!open) {
      return
    }

    open = false
    game.stop()
    shell.getAnimations().forEach(animation => animation.cancel())
    shell.style.transform = 'none'
    root.dataset.open = 'false'
    root.dataset.playing = 'false'
    options.onClose()
  }
}
