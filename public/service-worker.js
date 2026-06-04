const CACHE_NAME = 'hallucinate-v3'
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon-180x180.png',
  '/icon-192x192.png',
  '/icon-192x192-maskable.png',
  '/icon-512x512.png',
  '/icon-512x512-maskable.png',
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
      .catch(e => console.error(e)),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const request = event.request

  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) {
    return
  }

  const url = new URL(request.url)
  const isHtmlRequest = request.mode === 'navigate'
    || request.headers.get('accept')?.includes('text/html')
    || url.pathname === '/'
    || url.pathname.endsWith('.html')
  const isHardRefresh = request.cache === 'reload'

  if (isHtmlRequest || isHardRefresh) {
    event.respondWith(networkFirst(request, isHtmlRequest))
    return
  }

  event.respondWith(staleWhileRevalidate(request))
})

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

async function networkFirst(request, isHtmlRequest) {
  const cache = await caches.open(CACHE_NAME)

  try {
    const response = await fetch(request)

    if (response.ok && response.type === 'basic') {
      cache.put(request, response.clone())
    }

    return response
  }
  catch (e) {
    const cached = await caches.match(request)

    if (cached) {
      return cached
    }

    if (isHtmlRequest) {
      const index = await caches.match('/index.html')

      if (index) {
        return index
      }
    }

    console.error(e)
    throw e
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request)
  const fetchPromise = fetch(request)
    .then(async response => {
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME)

        cache.put(request, response.clone())
      }

      return response
    })
    .catch(e => {
      console.error(e)
      throw e
    })

  return cached ?? fetchPromise
}
