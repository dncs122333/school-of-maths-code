/* eslint-disable no-restricted-globals */
// Makes the app open instantly, even on a poor connection. react-scripts builds this file with Workbox.
// API responses are never cached: marks, tests and fees must always come fresh from the server.
import { ExpirationPlugin } from "workbox-expiration";
import { createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, StaleWhileRevalidate } from "workbox-strategies";

// Only the entry page and main bundle are downloaded ahead of time. Pages a student never opens (test builder,
// reports) stay undownloaded, which matters on mobile data. They're cached the first time they're opened.
const entryFiles = self.__WB_MANIFEST.filter(({ url }) => /\/index\.html$|\/static\/(js|css)\/main\./.test(url));
precacheAndRoute(entryFiles);

registerRoute(new NavigationRoute(createHandlerBoundToURL(`${process.env.PUBLIC_URL}/index.html`), {
  denylist: [/^\/api\//, /^\/_/, /\/[^/?]+\.[^/]+$/],
}));

// Code files have a content hash in their name, so a cached copy can never be out of date
registerRoute(
  ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/static/"),
  new CacheFirst({
    cacheName: "app-files",
    plugins: [new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 60, purgeOnQuotaError: true })],
  }),
);

registerRoute(
  ({ url }) => url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com",
  new StaleWhileRevalidate({
    cacheName: "fonts",
    plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365, purgeOnQuotaError: true })],
  }),
);

// A new release waits until the student taps "Refresh", so it never changes under them during a test
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
