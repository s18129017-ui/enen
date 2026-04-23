const CACHE_NAME = "pink-phone-v3";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./聊天界面.html",
  "./chat-settings.html",
  "./wechat.html",
  "./offline.html",
  "./styles.css",
  "./script.js",
  "./prompt-config.js",
  "./api-modal.html",
  "./manifest.webmanifest",
  "./icons/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isNavigation = event.request.mode === "navigate";
  const destination = event.request.destination;
  const isStaticAsset =
    destination === "style" ||
    destination === "script" ||
    destination === "image" ||
    destination === "font";
  const isApiRequest =
    requestUrl.pathname.indexOf("/api/") >= 0 ||
    requestUrl.pathname.indexOf("/v1/") >= 0 ||
    requestUrl.pathname.indexOf("/models") >= 0;

  // API 请求保持网络优先，避免旧数据污染。
  if (!isSameOrigin || isApiRequest) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 页面导航：网络优先，离线回退到兜底页面。
  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return response;
        })
        .catch(() => caches.match("./offline.html"))
    );
    return;
  }

  // 静态资源：stale-while-revalidate，提高加载速度。
  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((response) => {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
            return response;
          })
          .catch(() => cached);

        return cached || networkFetch;
      })
    );
    return;
  }

  // 其他同源 GET：缓存优先。
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then((response) => {
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        return response;
      });
    })
  );
});
