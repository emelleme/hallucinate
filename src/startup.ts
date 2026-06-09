import type { DomElements } from './dom-elements.ts'

type IntroProgressTarget = Pick<DomElements, 'introBar' | 'introProgress'>
type IntroProgressEffect = {
  setProgress(value: number): void
}

let introLoadProgress = 0

export function setIntroLoadProgress(
  elements: IntroProgressTarget,
  value: number,
  effect?: IntroProgressEffect,
) {
  const progress = Math.max(introLoadProgress, Math.min(Math.max(Math.round(value), 0), 100))

  if (progress === introLoadProgress) {
    return progress
  }

  introLoadProgress = progress
  elements.introProgress.textContent = `${progress}%`
  elements.introBar.style.transform = `scaleX(${progress / 100})`
  effect?.setProgress(progress / 100)

  return progress
}

export function introLoadProgressValue() {
  return introLoadProgress
}

export function afterNextPaint() {
  return new Promise<void>(resolve => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0)
    })
  })
}
