"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (!["http:", "https:"].includes(window.location.protocol)) return;

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("[offline] service worker registration failed", error);
    });
  }, []);

  return null;
}
