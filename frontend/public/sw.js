const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
const CACHE_PREFIX = 'wodflow-pages'
const STATIC_CACHE = `${CACHE_PREFIX}-v${VERSION}-static`
const IMAGE_CACHE = `${CACHE_PREFIX}-images-v2`

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
  event.waitUntil(Promise.all([
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)),
    self.skipWaiting(),
  ]))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && ![STATIC_CACHE, IMAGE_CACHE].includes(key))
        .map((key) => caches.delete(key)),
    )),
    self.clients.claim(),
  ]))
})

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) {
      await cache.put(request, response.clone()).catch(() => undefined)
      return response
    }
    return await cache.match(request) || response
  } catch (error) {
    const cached = await cache.match(request)
    if (cached) return cached
    throw error
  }
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(IMAGE_CACHE)
  const cached = await cache.match(request)
  const update = fetch(request)
    .then(async (response) => {
      if (response.ok || response.type === 'opaque') {
        await cache.put(request, response.clone()).catch(() => undefined)
      }
      return response
    })
    .catch(() => null)

  if (cached) {
    event.waitUntil(update)
    return cached
  }

  const response = await update
  if (response) return response
  return new Response('', { status: 504, statusText: 'Image unavailable offline' })
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  const sameOrigin = url.origin === self.location.origin

  if (request.destination === 'image') {
    event.respondWith(
      sameOrigin
        ? networkFirst(request, STATIC_CACHE)
        : staleWhileRevalidate(request, event),
    )
    return
  }

  if (!sameOrigin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, STATIC_CACHE)
        .then(async (response) => response.ok ? response : await caches.match(scoped('index.html')) || response)
        .catch(() => caches.match(scoped('index.html')))
        .then((response) => response || Response.error()),
    )
    return
  }

  event.respondWith(networkFirst(request, STATIC_CACHE))
})
