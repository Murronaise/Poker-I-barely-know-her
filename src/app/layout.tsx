import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import MotionProvider from "@/components/MotionProvider";
import PollLoginPrompt from "@/components/PollLoginPrompt";
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
  title: {
    default: "Poker Tracker — Live Session Tracking",
    template: "%s | Poker Tracker",
  },
  description:
    "A premium live session tracker for home poker games — buy-ins, blinds, payouts, and player superlatives.",
  applicationName: "Poker Tracker",
  keywords: ["poker", "tracker", "session", "buy-in", "leaderboard", "home game"],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Poker Tracker",
  },
  openGraph: {
    title: "Poker Tracker",
    description:
      "Track your home poker games. Live timers, buy-ins, audits, leaderboards.",
    type: "website",
    siteName: "Poker Tracker",
  },
};

export const viewport: Viewport = {
  themeColor: "#0E1117",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="min-h-dvh md:h-dvh md:overflow-hidden overflow-x-hidden flex flex-col bg-[#0E1117] text-[#FAFAFA] safe-px">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:bg-[#39FF14] focus:text-black focus:font-black focus:px-3 focus:py-2 focus:rounded-md"
        >
          Skip to main content
        </a>
        <MotionProvider>
          <NavBar />
          <div id="main-content" className="flex-1 flex flex-col md:min-h-0 md:overflow-hidden">
            {children}
          </div>
          <Footer />
          <Toaster theme="dark" position="top-center" richColors />
          <PollLoginPrompt />
        </MotionProvider>
      </body>
    </html>
  );
}
