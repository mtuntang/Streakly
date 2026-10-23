import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { ErrorBoundary } from "@/components/error-boundary";

// Figtree is the one face for text, headings and numbers.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Streakly — Stay consistent on your goals",
  description:
    "Streakly is a habit & goal tracker centered on streaks. Build unbroken chains, watch your consistency grow, and stay motivated every day.",
  keywords: [
    "streaks",
    "habit tracker",
    "goals",
    "consistency",
    "productivity",
  ],
  authors: [{ name: "Streakly" }],
  icons: {
    icon: "/favicon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
  // Added to an iPhone's Home Screen, Streakly opens as its own app, under
  // its own name, with the system status bar above the page.
  appleWebApp: {
    capable: true,
    title: "Streakly",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "Streakly — Stay consistent on your goals",
    description:
      "Track your habits with streaks, heatmaps and daily check-ins.",
    siteName: "Streakly",
    type: "website",
  },
};

// `cover` lets the page reach under a phone's rounded corners and home
// indicator, so `env(safe-area-inset-*)` reports real values. The phone
// ribbon bar uses the bottom inset to sit above the home indicator, and the
// body pads by the side insets so a notch never covers content in landscape.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // The page background, so the browser's and the installed app's bars
  // blend into the page in either theme.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f4ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0e141f" },
  ],
};

/** Renders the html shell: fonts, theme provider, error boundary, and toaster. */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variables sit on <html> because Tailwind resolves font-sans
    // there; on <body> they were out of scope and the system font won.
    <html
      lang="en"
      className={figtree.variable}
      suppressHydrationWarning
    >
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}