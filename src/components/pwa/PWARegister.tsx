"use client";

import { useEffect } from "react";

export default function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isLocalhost = Boolean(
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "[::1]"
    );

    if ("serviceWorker" in navigator) {
      const register = async () => {
        try {
          // Only register in production build or when explicitly testing PWA locally
          const allowInDev = process.env.NEXT_PUBLIC_ENABLE_SW_DEV === "true";
          if (process.env.NODE_ENV !== "production" && !allowInDev && !isLocalhost) return;

          const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
          // Listen for a new service worker and activate it immediately
          if (reg && reg.waiting) {
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
          }
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                // New content is available, trigger immediate activation
                newWorker.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });
        } catch (err) {
          // Silently ignore to avoid crashing the app
          console.error("SW register failed", err);
        }
      };

      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
