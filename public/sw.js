/* Premiações – Service Worker (offline-first para shell)
 *
 * BUMPAR ESTE NÚMERO QUANDO QUISER FORÇAR ATUALIZAÇÃO GLOBAL
 * O SW velho será descartado, todos os caches velhos apagados, e cada
 * cliente vivo recebe um postMessage para fazer location.reload().
 */
const CACHE_VERSION = "v18";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "/",
  "/cliente",
  "/cliente/login",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => null))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Apaga TODOS os caches que não são da versão atual.
      // Inclui runtime caches antigos (v4/v5) com bundles desatualizados.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => ![STATIC_CACHE, RUNTIME_CACHE].includes(k))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
      // 1) Avisa abas com bundle NOVO via postMessage (UpdateChecker escuta).
      // 2) FORÇA navegação nas abas com bundle ANTIGO (que não tem UpdateChecker).
      //    `client.navigate(client.url)` recarrega a página, baixando o JS novo.
      const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
      for (const c of clients) {
        try {
          c.postMessage({ type: "SW_UPDATED", version: CACHE_VERSION });
        } catch (_) { /* ignore */ }
        // Aguarda 2s para o postMessage virar reload elegante; se a aba
        // estiver com bundle antigo (sem UpdateChecker), navega à força.
        try {
          setTimeout(() => {
            try { c.navigate(c.url); } catch (_) { /* not allowed for some clients */ }
          }, 2000);
        } catch (_) { /* ignore */ }
      }
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Nunca cachear chamadas ao Supabase ou APIs internas
  if (
    url.hostname.endsWith(".supabase.co") ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  // Navegação HTML: tenta rede, cai para cache de "/"
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => null);
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/cliente") || caches.match("/")))
    );
    return;
  }

  // Assets estáticos: cache-first
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(svg|png|jpg|jpeg|webp|ico|woff2?)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => null);
            return res;
          })
      )
    );
    return;
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
