import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { SupabaseProvider } from "@/components/supabase-provider";
import AuthLinksClient from "@/components/auth-links-client";
import SEOJsonLd from "@/components/seo-jsonld";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://acadlabs.fun"),
  title: {
    default: "Acadlabs – AI Chat Assistant Bahasa Indonesia",
    template: "%s – Acadlabs",
  },
  description:
    "Acadlabs adalah AI chat assistant berbahasa Indonesia untuk merangkum teks, menyusun rencana, brainstorming, dan menganalisis data. Cepat, akurat, dan gratis untuk dicoba.",
  keywords: [
    "Acadlabs",
    "AI chat Indonesia",
    "AI Assistant",
    "ringkas teks",
    "brainstorm",
    "analisis data",
  ],
  alternates: {
    canonical: "/",
    languages: {
      "id-ID": "/",
      "x-default": "/",
    },
  },
  openGraph: {
    title: "Acadlabs – AI Chat Assistant",
    description:
      "AI chat assistant berbahasa Indonesia untuk ringkas teks, brainstorming, rencana, dan analisis data.",
    url: "https://acadlabs.fun",
    siteName: "Acadlabs",
    images: ["/opengraph-image"],
    locale: "id_ID",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Acadlabs – AI Chat Assistant",
    description:
      "AI chat assistant berbahasa Indonesia untuk ringkas teks, brainstorming, rencana, dan analisis data.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon-black.ico", media: "(prefers-color-scheme: light)" },
      { url: "/favicon-white.ico", media: "(prefers-color-scheme: dark)" },
    ],
    shortcut: ["/favicon-black.ico"],
  },
  applicationName: "Acadlabs",
  verification: {
    google:
      (process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION as string | undefined) ||
      (process.env.GOOGLE_SITE_VERIFICATION as string | undefined),
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0F1A" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <SEOJsonLd />
      </head>
      <body className={`${inter.variable} ${ibmPlexMono.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <SupabaseProvider>
            {/* Top-right auth buttons (only on home/login/register when logged out) */}
            <AuthLinksClient />
            {children}
            <Toaster />
          </SupabaseProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
