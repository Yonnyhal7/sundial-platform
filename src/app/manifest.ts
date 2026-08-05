import type { MetadataRoute } from "next";
import { PWA_LAUNCH_VISUAL } from "@/lib/pwa/launchScreen";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sundial",
    short_name: "Sundial",
    description:
      "School schedules, announcements, events, and communication in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Shared with the per-school app manifest so the two can never diverge.
    background_color: PWA_LAUNCH_VISUAL.background,
    theme_color: PWA_LAUNCH_VISUAL.background,
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
