const cacheName = 'hallucinate-v1'
const shell = [
  '/',
  '/manifest.json',
  '/favicon-180x180.png',
  '/icon-192x192.png',
  '/icon-192x192-maskable.png',
  '/icon-512x512.png',
  '/icon-512x512-maskable.png',
]

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(name => name !== cacheName).map(name => caches.delete(name))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const request = event.request

  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  event.respondWith(cacheFirst(request))
})

async function networkFirst(request) {
  const cache = await caches.open(cacheName)

  try {
    const response = await fetch(request)

    cache.put(request, response.clone())
    return response
  }
  catch (e) {
    const cached = await cache.match(request)

    if (cached) {
      return cached
    }

    console.error(e)
    throw e
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)

  if (cached) {
    return cached
  }

  const response = await fetch(request)

  if (response.ok) {
    cache.put(request, response.clone())
  }

  return response
}
