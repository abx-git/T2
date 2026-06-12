import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** z. B. `/T2` wenn SW unter `/T2/sw.js` liegt (GitHub Pages). */
function serviceWorkerBasePath(): string {
  const path = new URL(self.location.href).pathname.replace(/\/sw\.js$/, "");
  return path === "/" ? "" : path;
}

const offlineFallbackUrl = `${serviceWorkerBasePath()}/~offline`.replace(/\/{2,}/g, "/");

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: offlineFallbackUrl,
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
