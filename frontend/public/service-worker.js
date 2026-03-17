/**
 * Service Worker for Convention Speaker List
 * Provides offline support and caching strategies
 */

const CACHE_VERSION = 'v1.0.0';
const CACHE_NAMES = {
  STATIC: `static-cache-${CACHE_VERSION}`,
  DYNAMIC: `dynamic-cache-${CACHE_VERSION}`,
  API: `api-cache-${CACHE_VERSION}`,
};

// Assets to precache
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/static/css/main.css',
  '/static/js/bundle.js',
];

// API endpoints to cache
const CACHEABLE_API_ENDPOINTS = ['/api/v1/delegates', '/api/v1/queue/current', '/api/v1/settings'];

// Install event - precache static assets
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...');

  event.waitUntil(
    caches
      .open(CACHE_NAMES.STATIC)
      .then((cache) => {
        console.log('[ServiceWorker] Precaching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[ServiceWorker] Installation complete');
        return self.skipWaiting(); // Activate immediately
      })
      .catch((error) => {
        console.error('[ServiceWorker] Installation failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating...');

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              return !Object.values(CACHE_NAMES).includes(cacheName);
            })
            .map((cacheName) => {
              console.log('[ServiceWorker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[ServiceWorker] Activation complete');
        return self.clients.claim(); // Take control immediately
      })
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-HTTP(S) requests
  if (!request.url.startsWith('http')) {
    return;
  }

  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Handle static assets
  if (isStaticAsset(url.pathname)) {
    event.respondWith(handleStaticAsset(request));
    return;
  }

  // Default strategy: Network first with cache fallback
  event.respondWith(handleDynamicRequest(request));
});

/**
 * Handle API requests with network-first strategy
 */
async function handleApiRequest(request) {
  const cache = await caches.open(CACHE_NAMES.API);

  try {
    // Try network first
    const networkResponse = await fetch(request.clone());

    // Cache successful GET responses
    if (request.method === 'GET' && networkResponse.ok) {
      const shouldCache = CACHEABLE_API_ENDPOINTS.some((endpoint) =>
        request.url.includes(endpoint)
      );

      if (shouldCache) {
        await cache.put(request, networkResponse.clone());
      }
    }

    return networkResponse;
  } catch (error) {
    console.log('[ServiceWorker] Network request failed, trying cache:', error);

    // Fallback to cache for GET requests
    if (request.method === 'GET') {
      const cachedResponse = await cache.match(request);
      if (cachedResponse) {
        console.log('[ServiceWorker] Serving from cache:', request.url);
        return cachedResponse;
      }
    }

    // Return offline response for failed requests
    return new Response(
      JSON.stringify({
        error: 'Offline',
        message: 'The application is currently offline',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Handle static assets with cache-first strategy
 */
async function handleStaticAsset(request) {
  const cache = await caches.open(CACHE_NAMES.STATIC);

  // Check cache first
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    console.log('[ServiceWorker] Serving static asset from cache:', request.url);
    return cachedResponse;
  }

  // Fallback to network and cache the response
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('[ServiceWorker] Failed to fetch static asset:', error);
    return new Response('Asset not available offline', { status: 404 });
  }
}

/**
 * Handle dynamic requests with network-first strategy
 */
async function handleDynamicRequest(request) {
  const cache = await caches.open(CACHE_NAMES.DYNAMIC);

  try {
    // Try network first
    const networkResponse = await fetch(request);

    // Cache successful responses
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log('[ServiceWorker] Network failed, checking cache:', error);

    // Fallback to cache
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      console.log('[ServiceWorker] Serving from dynamic cache:', request.url);
      return cachedResponse;
    }

    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      const offlineResponse = await cache.match('/offline.html');
      if (offlineResponse) {
        return offlineResponse;
      }
    }

    return new Response('Resource not available offline', { status: 404 });
  }
}

/**
 * Check if a path is a static asset
 */
function isStaticAsset(pathname) {
  const staticExtensions = [
    '.js',
    '.css',
    '.png',
    '.jpg',
    '.jpeg',
    '.svg',
    '.ico',
    '.woff',
    '.woff2',
  ];
  return staticExtensions.some((ext) => pathname.endsWith(ext)) || pathname.startsWith('/static/');
}

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  const { type, data } = event.data;

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CLEAR_CACHE':
      clearAllCaches().then(() => {
        event.ports[0].postMessage({ success: true });
      });
      break;

    case 'CACHE_URLS':
      cacheUrls(data.urls).then(() => {
        event.ports[0].postMessage({ success: true });
      });
      break;

    default:
      console.log('[ServiceWorker] Unknown message type:', type);
  }
});

/**
 * Clear all caches
 */
async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map((name) => caches.delete(name)));
  console.log('[ServiceWorker] All caches cleared');
}

/**
 * Cache specific URLs
 */
async function cacheUrls(urls) {
  const cache = await caches.open(CACHE_NAMES.DYNAMIC);
  await cache.addAll(urls);
  console.log('[ServiceWorker] Cached URLs:', urls);
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Background sync triggered:', event.tag);

  if (event.tag === 'sync-queue-updates') {
    event.waitUntil(syncQueueUpdates());
  }
});

/**
 * Sync queued updates when back online
 */
async function syncQueueUpdates() {
  try {
    // Get pending updates from IndexedDB
    const pendingUpdates = await getPendingUpdates();

    if (pendingUpdates.length === 0) {
      console.log('[ServiceWorker] No pending updates to sync');
      return;
    }

    console.log(`[ServiceWorker] Syncing ${pendingUpdates.length} pending updates`);

    // Process each update
    for (const update of pendingUpdates) {
      try {
        const response = await fetch(update.url, {
          method: update.method,
          headers: update.headers,
          body: JSON.stringify(update.body),
        });

        if (response.ok) {
          await markUpdateSynced(update.id);
          console.log('[ServiceWorker] Synced update:', update.id);
        } else {
          console.error('[ServiceWorker] Failed to sync update:', update.id, response.status);
        }
      } catch (error) {
        console.error('[ServiceWorker] Error syncing update:', update.id, error);
      }
    }

    // Notify clients about sync completion
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        data: { count: pendingUpdates.length },
      });
    });
  } catch (error) {
    console.error('[ServiceWorker] Background sync failed:', error);
  }
}

// Placeholder functions for IndexedDB operations
// These will be implemented in the IndexedDB module
async function getPendingUpdates() {
  // TODO: Implement IndexedDB query
  return [];
}

async function markUpdateSynced(id) {
  // TODO: Implement IndexedDB update
  return true;
}
