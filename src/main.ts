import './style.css'
import { getDomElements } from './dom-elements.ts'
import { afterNextPaint, setIntroLoadProgress } from './startup.ts'

const domElements = getDomElements()

document.body.dataset.introVisible = 'true'
document.body.dataset.introReady = 'false'
setIntroLoadProgress(domElements, 1)
await afterNextPaint()
setIntroLoadProgress(domElements, 2)
await import('./club-app.ts')

if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(e => console.error(e))
  })
}
