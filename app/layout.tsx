import type { Metadata } from "next";
import { Inter, Press_Start_2P } from "next/font/google";
// Tokens first: globals.css and every component in components/ds read the
// custom properties it defines, so it has to land in the cascade ahead of them.
import "./tokens.css";
import "./globals.css";
import { Analytics } from '@vercel/analytics/next';
import { NO_FLASH_SCRIPT } from "@/lib/settings";
import { OG_IMAGE, SITE_URL } from "@/lib/site";
import Footer from "@/components/Footer";
import AuthProvider from "@/components/AuthProvider";
import SettingsSync from "@/components/SettingsSync";
import SpriteDefsHost from "@/components/SpriteDefsHost";

// `variable` as well as `className`: the class puts Inter on <body>, where the
// `*` rule in globals.css immediately overrides it with the pixel face. The
// variable is what lets `.ms-prose` opt back in for long-form copy.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const pressStart2P = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  display: "optional",
  variable: "--font-press-start-2p"
});

// Kept inside the SERP's own limits — a title over ~60 chars and a description
// over ~155 are truncated, and the tail is the part that gets cut. No `keywords`
// meta: Google has ignored it since 2009, and a stuffed one is a spam signal to
// everyone who still reads it.
const TITLE = "Minesweeper Co-op — Free Online Multiplayer Minesweeper";
const DESCRIPTION =
  "Play Minesweeper with friends on one shared board, race a 1v1, or take on the daily challenge. Free in your browser, no download, unblocked at school.";

export const metadata: Metadata = {
  // Every other URL here is absolute, but this is what keeps a relative one
  // from silently resolving against localhost.
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  authors: [{ name: "Michael", url: "https://github.com/Michaell14" }],
  creator: "Michael",
  publisher: "Minesweeper Co-Op",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'Minesweeper Co-Op',
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'Minesweeper Co-op — two players on one shared board',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  alternates: {
    canonical: SITE_URL,
  },
  category: 'games',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${pressStart2P.variable} ${inter.variable}`}>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {/* Applies the stored palette before first paint — nothing sets
            data-theme until React hydrates, so without this a themed player sees
            the default flash on every load. <html> carries
            suppressHydrationWarning, which is what lets this mutate it safely. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
        {/* No canonical or theme-color here on purpose. The canonical comes
            from metadata.alternates; a hardcoded one in the LAYOUT renders on
            every route, claiming each is a duplicate of /. A theme-color has to
            be one literal colour, and there are twelve palettes — white was
            wrong on eleven of them, so the browser default is the better answer
            until it can follow `data-theme`. */}
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "VideoGame",
              "name": "Minesweeper Co-Op",
              "description": DESCRIPTION,
              "url": SITE_URL,
              "image": OG_IMAGE,
              "author": {
                "@type": "Person",
                "name": "Michael"
              },
              "genre": ["Puzzle", "Strategy", "Logic", "Multiplayer"],
              "gamePlatform": ["Web Browser", "Desktop", "Mobile"],
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD",
                "availability": "https://schema.org/InStock"
              },
              // No aggregateRating: nothing in the app collects one, and a
              // made-up rating breaks Google's structured-data policy — the
              // downside is a manual action, not a nicer snippet. Add it back
              // only alongside a real rating feature.
              "playMode": ["CoOp", "MultiPlayer"],
              "numberOfPlayers": {
                "@type": "QuantitativeValue",
                "minValue": 1,
                "maxValue": 100
              },
              "applicationCategory": "Game"
            })
          }}
        />
      </head>

      <body className={inter.className}>
        {/* The mine and flag art every <Sprite> points at; follows the palette
            (holiday pairs included) unless the player pinned a general set. */}
        <SpriteDefsHost />
        <AuthProvider>
          <SettingsSync />
          {children}
          <Footer />
        </AuthProvider>
        <Analytics />
      </body>

    </html>
  );
}
