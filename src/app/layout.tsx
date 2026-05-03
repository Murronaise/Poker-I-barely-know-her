import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
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
      <body className="min-h-dvh md:h-dvh md:overflow-hidden flex flex-col bg-[#0E1117] text-[#FAFAFA]">
        <NavBar />
        <div className="flex-1 flex flex-col md:min-h-0 md:overflow-hidden">{children}</div>
        <Footer />
        <Toaster theme="dark" position="top-center" richColors />
      </body>
    </html>
  );
}
