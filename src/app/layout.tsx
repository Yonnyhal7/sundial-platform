import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import ServiceWorkerRegister from "@/components/offline/ServiceWorkerRegister";
import ThemeRouteSync from "@/components/ThemeRouteSync";
import { getPwaDeploymentVersion } from "@/lib/pwa/deploymentVersion";
import { getThemeBootstrapScript } from "@/lib/themeBootstrap";
import PwaLaunchScreen from "@/components/pwa/PwaLaunchScreen";
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
    statusBarStyle: "default",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
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
  themeColor: PWA_LAUNCH_VISUAL.background,
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
      style={{ backgroundColor: PWA_LAUNCH_VISUAL.background }}
      suppressHydrationWarning
    >
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="default"
        />
        <script
          dangerouslySetInnerHTML={{ __html: getThemeBootstrapScript() }}
        />
        <script
          dangerouslySetInnerHTML={{ __html: getPwaLaunchPrepaintScript() }}
        />
        <style dangerouslySetInnerHTML={{ __html: PWA_LAUNCH_CRITICAL_CSS }} />
      </head>
      <body
        className="min-h-full flex flex-col"
        style={{ backgroundColor: PWA_LAUNCH_VISUAL.background }}
        suppressHydrationWarning
      >
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
