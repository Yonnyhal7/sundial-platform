import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import ServiceWorkerRegister from "@/components/offline/ServiceWorkerRegister";
import ThemeRouteSync from "@/components/ThemeRouteSync";
import { getPwaDeploymentVersion } from "@/lib/pwa/deploymentVersion";
import { getThemeBootstrapScript } from "@/lib/themeBootstrap";
import PwaLaunchScreen from "@/components/pwa/PwaLaunchScreen";
import { IOS_STARTUP_IMAGES } from "@/lib/pwa/iosStartupImages.generated";
import {
  getPwaLaunchPrepaintScript,
  PWA_LAUNCH_CRITICAL_CSS,
  PWA_LAUNCH_VISUAL,
} from "@/lib/pwa/launchScreen";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sundial",
  description:
    "School schedules, announcements, events, and communication in one place.",
  applicationName: "Sundial",
  appleWebApp: {
    capable: true,
    title: "Sundial",
    statusBarStyle: "black-translucent",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
  icons: {
    apple: [
      {
        url: "/apple-touch-icon.png",
        type: "image/png",
        sizes: "180x180",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    {
      media: "(prefers-color-scheme: light)",
      color: PWA_LAUNCH_VISUAL.background,
    },
    {
      media: "(prefers-color-scheme: dark)",
      color: PWA_LAUNCH_VISUAL.backgroundDark,
    },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <script
          dangerouslySetInnerHTML={{ __html: getThemeBootstrapScript() }}
        />
        <script
          dangerouslySetInnerHTML={{ __html: getPwaLaunchPrepaintScript() }}
        />
        {/* Declared explicitly rather than relying on next/image hoisting, which
            does not reach the head on streamed tenant routes. */}
        <link
          rel="preload"
          as="image"
          href={PWA_LAUNCH_VISUAL.iconSrc}
          type="image/webp"
          fetchPriority="high"
        />
        {/* iOS does not use the manifest's background_color for the standalone
            launch surface. Without a startup image matching the device exactly
            it shows a blank (black) screen until the web view paints, so each
            supported iPhone size and appearance gets the exact launch
            background — the web launch screen then draws on top of the same
            colour with no seam. */}
        {IOS_STARTUP_IMAGES.map((image) => (
          <link
            key={image.href}
            rel="apple-touch-startup-image"
            media={image.media}
            href={image.href}
          />
        ))}
        <style dangerouslySetInnerHTML={{ __html: PWA_LAUNCH_CRITICAL_CSS }} />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <PwaLaunchScreen />
        <ServiceWorkerRegister
          deploymentVersion={getPwaDeploymentVersion()}
        />
        <ThemeRouteSync />
        <Suspense fallback={null}>{children}</Suspense>
      </body>
    </html>
  );
}
