import './style.css'
import './club-app.ts'

if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(e => console.error(e))
  })
}
