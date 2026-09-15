const VERSION = 'wodflow-pages-v3'
const STATIC_CACHE = `${VERSION}-static`
const IMAGE_CACHE = `${VERSION}-images`

function scoped(path) {
  return new URL(path, self.registration.scope).href
}

const APP_SHELL = [
  scoped('./'),
  scoped('index.html'),
  scoped('manifest.webmanifest'),
  scoped('icons/icon-192.png'),
  scoped('icons/icon-512.png'),
  scoped('assets/app.js'),
  scoped('assets/app.css'),
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => ![STATIC_CACHE, IMAGE_CACHE].includes(key)).map((key) => caches.delete(key))))
  )
  self.clients.claim()
})

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok || response.type === 'opaque') await cache.put(request, response.clone())
  return response
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached
    throw new Error('offline')
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  // Cache exercise graphics, including cross-origin images imported from wger.
  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, IMAGE_CACHE))
    return
  }

  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, STATIC_CACHE).catch(() => caches.match(scoped('index.html'))))
    return
  }

  event.respondWith(cacheFirst(request, STATIC_CACHE))
})
