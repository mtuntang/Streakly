import type { Metadata } from "next";
import { Figtree, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { ErrorBoundary } from "@/components/error-boundary";

// Figtree is the one face for text, headings and numbers.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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
  },
  openGraph: {
    title: "Streakly — Stay consistent on your goals",
    description:
      "Track your habits with streaks, heatmaps and daily check-ins.",
    siteName: "Streakly",
    type: "website",
  },
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
      className={`${figtree.variable} ${geistMono.variable}`}
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