const STATIC_CACHE = 'fluvib-static-v2';
const PAGES_CACHE = 'fluvib-pages-v2';
const RSC_CACHE = 'fluvib-rsc-v2';
const ALL_CACHES = [STATIC_CACHE, PAGES_CACHE, RSC_CACHE];

const PRECACHE_ASSETS = [
  '/offline',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-512x512.png',
  '/icons/apple-touch-icon.png',
  '/Img/Logo_Fluvib.webp',
  '/Img/Logo_Fluvib_Face.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      await Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !ALL_CACHES.includes(key))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'CLEAR_AUTH_CACHES') {
    event.waitUntil(
      Promise.all([caches.delete(PAGES_CACHE), caches.delete(RSC_CACHE)])
    );
    return;
  }

  if (data.type === 'WARM_ROUTES' && Array.isArray(data.routes)) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(PAGES_CACHE);
        await Promise.allSettled(
          data.routes.map(async (route) => {
            try {
              const res = await fetch(route, { credentials: 'include' });
              const finalPath = res.url ? new URL(res.url).pathname : route;
              if (res.ok && res.status === 200 && finalPath === route) {
                await cache.put(route, res.clone());
              }
            } catch {
              // Ignorar si no hay red durante el pre-cacheo
            }
          })
        );
      })()
    );
  }
});

async function fetchWithTimeout(request, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(request, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function isStaticAssetPath(pathname) {
  return (
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/Img/') ||
    /\.(?:png|jpg|jpeg|webp|svg|ico|woff2?|ttf|css|js)$/i.test(pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo interceptar peticiones GET del mismo origen
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Nunca cachear el propio Service Worker, API routes ni HMR de desarrollo
  if (
    url.pathname === '/sw.js' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/webpack-hmr') ||
    url.pathname.includes('hot-update') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/manifest.json'
  ) {
    return;
  }

  // 1. Recursos estáticos versionados de Next.js -> Cache-First
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;

        const networkRes = await fetch(request);
        if (networkRes && networkRes.ok && networkRes.status === 200) {
          cache.put(request, networkRes.clone());
        }
        return networkRes;
      })
    );
    return;
  }

  // 2. Otros recursos estáticos (imágenes, iconos, fuentes) -> Stale-While-Revalidate
  if (isStaticAssetPath(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((res) => {
            if (res && res.ok && res.status === 200) {
              cache.put(request, res.clone());
            }
            return res;
          })
          .catch(() => cached);

        return cached || networkPromise;
      })
    );
    return;
  }

  // 3. Payloads RSC de navegación interna Next.js App Router -> Network-First con fallback
  const isRscRequest =
    request.headers.get('RSC') === '1' || url.searchParams.has('_rsc');

  if (isRscRequest) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RSC_CACHE);
        const fallbackKey = `${url.pathname}::__rsc`;
        try {
          const networkRes = await fetchWithTimeout(request, 4500);
          if (networkRes && networkRes.ok && networkRes.status === 200) {
            const finalPath = networkRes.url ? new URL(networkRes.url).pathname : url.pathname;
            if (finalPath === url.pathname) {
              cache.put(request, networkRes.clone());
              cache.put(fallbackKey, networkRes.clone());
            }
          }
          return networkRes;
        } catch {
          const exactCached = await cache.match(request);
          if (exactCached) return exactCached;
          const pathCached = await cache.match(fallbackKey);
          if (pathCached) return pathCached;
          return Response.error();
        }
      })()
    );
    return;
  }

  // 4. Navegaciones de documentos HTML -> Network-First con fallback en caché / offline
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGES_CACHE);
        const cacheKey = url.pathname === '/' ? '/dashboard' : url.pathname;

        try {
          const networkRes = await fetchWithTimeout(request, 5000);
          if (networkRes && networkRes.ok && networkRes.status === 200) {
            const finalPath = networkRes.url
              ? new URL(networkRes.url).pathname
              : url.pathname;
            // Guardar bajo la ruta real final para no mezclar redirecciones a /login
            cache.put(finalPath, networkRes.clone());
          }
          return networkRes;
        } catch {
          const cachedPage =
            (await cache.match(cacheKey)) ||
            (await cache.match(url.pathname)) ||
            (await cache.match('/dashboard'));
          if (cachedPage) return cachedPage;

          const offlinePage = await caches.match('/offline');
          if (offlinePage) return offlinePage;

          return new Response(
            '<!doctype html><html lang="es"><meta charset="utf-8"><title>Sin conexión</title><body style="font-family:sans-serif;padding:2rem;text-align:center"><h1>Sin conexión a internet</h1><p>Reconecta tu dispositivo o abre una vista guardada en caché.</p></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
      })()
    );
  }
});

