const CACHE_NAME = 'vibe-reader-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/static/stylesnew.css',
  '/static/css/variablesnew.css',
  '/static/css/basenew.css',
  '/static/css/layoutnew.css',
  '/static/css/componentsnew.css',
  '/static/css/viewsnew.css',
  '/static/css/tagsnew.css',
  '/static/js/main.js',
  '/static/js/state.js',
  '/static/js/theme.js',
  '/static/js/auth.js',
  '/static/js/api.js',
  '/static/js/utils.js',
  '/static/js/router.js',
  '/static/js/library.js',
  '/static/js/reader.js',
  '/static/js/preferences.js',
  '/static/js/tags.js',
  '/static/js/profile.js',
  '/static/js/admin.js',
  '/static/js/scan-status.js',
  '/static/js/discovery.js',
  '/static/js/ui-utils.js',
  '/static/manifest.json',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - cache-first strategy
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip API requests
  if (url.pathname.startsWith('/api/')) {
    return;
  }
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Navigation requests - return index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html')
        .then(response => response || fetch(request))
        .catch(() => caches.match('/index.html'))
    );
    return;
  }
  
  // Static assets - cache first
  event.respondWith(
    caches.match(request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(request)
          .then(fetchResponse => {
            // Optionally cache new static assets
            return fetchResponse;
          });
      })
  );
});
