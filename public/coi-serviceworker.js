// coi-serviceworker v0.1.7 - MIT - https://github.com/gzuidhof/coi-serviceworker
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function isRequestFromServiceWorker(request) {
  return request.mode === "no-cors";
}

async function handleFetch(request) {
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") {
    return;
  }
  const r = await fetch(request).catch((e) => console.error(e));
  if (!r) return;
  if (r.status === 0) return r;
  // Skip responses that can't have a body (204, 304, etc.)
  if ([101, 204, 205, 304].includes(r.status)) return r;
  const headers = new Headers(r.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers });
}

self.addEventListener("fetch", (event) => {
  if (event.request.url.startsWith(self.location.origin)) {
    event.respondWith(handleFetch(event.request));
  }
});
