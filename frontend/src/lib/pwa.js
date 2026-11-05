import { toast } from "sonner";

function offerUpdate(worker) {
  toast("A new version is ready", {
    id: "app-update",
    duration: Infinity,
    action: { label: "Refresh", onClick: () => worker.postMessage({ type: "SKIP_WAITING" }) },
  });
}

export function registerServiceWorker() {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${process.env.PUBLIC_URL}/service-worker.js`);
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", () => {
          // With no controller this is the first install, so there's nothing to update
          if (worker.state === "installed" && navigator.serviceWorker.controller) offerUpdate(worker);
        });
      });
      // An installed app can stay open for days: check for a release when it comes back to the foreground
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });
    } catch {
      // No service worker just means no instant start; the app works as normal
    }
  });
}

// The error-reporting code loads only when configured, and after the app, so it never slows the first screen
export function startErrorReporting() {
  const dsn = process.env.REACT_APP_SENTRY_DSN;
  if (!dsn) return;
  import("@sentry/react").then((Sentry) => {
    Sentry.init({ dsn, environment: process.env.NODE_ENV, sendDefaultPii: false, tracesSampleRate: 0 });
  }).catch(() => {});
}
