const CACHE_NAME = "yokai-mobile-v037";
const SHELL = [
  "/mobile",
  "/offline.html",
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
];

self.addEventListener(
  "install",
  (event) => {
    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then((cache) =>
          cache.addAll(SHELL)
        )
    );

    self.skipWaiting();
  }
);

self.addEventListener(
  "activate",
  (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) =>
                  key !== CACHE_NAME
              )
              .map(
                (key) =>
                  caches.delete(key)
              )
          )
        )
    );

    self.clients.claim();
  }
);

self.addEventListener(
  "fetch",
  (event) => {
    const request =
      event.request;

    if (
      request.method !== "GET"
    ) {
      return;
    }

    const url =
      new URL(
        request.url
      );

    if (
      url.origin
      !== self.location.origin
    ) {
      return;
    }

    // Business data must always come from the VPS.
    if (
      url.pathname.startsWith(
        "/api/"
      )
    ) {
      event.respondWith(
        fetch(request)
      );
      return;
    }

    if (
      request.mode
      === "navigate"
    ) {
      event.respondWith(
        fetch(request)
          .then(
            (response) => {
              const copy =
                response.clone();

              caches
                .open(
                  CACHE_NAME
                )
                .then(
                  (cache) =>
                    cache.put(
                      request,
                      copy
                    )
                );

              return response;
            }
          )
          .catch(
            async () =>
              (
                await caches.match(
                  request
                )
              )
              || (
                await caches.match(
                  "/offline.html"
                )
              )
          )
      );

      return;
    }

    event.respondWith(
      caches
        .match(request)
        .then(
          (cached) => {
            const network =
              fetch(request)
                .then(
                  (response) => {
                    if (
                      response.ok
                    ) {
                      const copy =
                        response.clone();

                      caches
                        .open(
                          CACHE_NAME
                        )
                        .then(
                          (cache) =>
                            cache.put(
                              request,
                              copy
                            )
                        );
                    }

                    return response;
                  }
                )
                .catch(
                  () => cached
                );

            return (
              cached
              || network
            );
          }
        )
    );
  }
);
