import type { Metadata } from "next";
// Ship the fonts with the app; production builds need no Google Fonts access.
import localFont from 'next/font/local';
// Tokens first: globals.css and components/ds read the custom properties it defines.
import "./tokens.css";
import "./globals.css";
import UsageAnalytics from '@/components/UsageAnalytics';
import { NO_FLASH_SCRIPT } from "@/lib/settings";
import { OG_IMAGE, SITE_URL } from "@/lib/site";
import SiteNav from "@/components/SiteNav";
import AccountMenu from "@/components/AccountMenu";
import Toasts from "@/components/Toasts";
import AuthProvider from "@/components/AuthProvider";
import SettingsSync from "@/components/SettingsSync";
import BestsSync from "@/components/BestsSync";
import SpriteDefsHost from "@/components/SpriteDefsHost";

// The pixel face sets every element, so it belongs here, preloaded on every
// route. Inter sets prose only, so it is declared beside the prose shell
// instead (components/marketing/proseFont.ts).
const pressStart2P = localFont({
  src: '../node_modules/@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2',
  weight: '400',
  display: 'optional',
  variable: '--font-press-start-2p',
});

// Within the SERP's limits (~60-char title, ~155-char description). No
// `keywords` meta: Google has ignored it since 2009.
const TITLE = "Minesweeper Co-op — Free Online Multiplayer Minesweeper";
const DESCRIPTION =
  "Play Minesweeper with friends on one shared board, race a 1v1, or take on the daily challenge. Free in your browser, no download, unblocked at school.";

export const metadata: Metadata = {
  // Keeps a relative URL from silently resolving against localhost.
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
    <html lang="en" suppressHydrationWarning className={pressStart2P.variable}>
      <head>
        {/* No icon links here: Next writes them from app/favicon.ico,
            app/icon.svg and app/apple-icon.png, and a second hand-written set
            only duplicated them. */}
        {/* Applies the stored palette before first paint, or a themed player
            sees the default flash on every load. <html> carries
            suppressHydrationWarning so this may mutate it. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
        {/* No canonical or theme-color here: the canonical comes from
            metadata.alternates (one in the LAYOUT would claim every route is a
            duplicate of /), and a theme-color would be one literal colour
            across twelve palettes. */}
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
              // No aggregateRating: nothing collects one, and a made-up rating
              // breaks Google's structured-data policy (a manual action).
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

      <body>
        {/* The mine and flag art every <Sprite> points at; follows the palette
            (holiday pairs included) unless the player pinned a general set. */}
        <SpriteDefsHost />
        <AuthProvider>
          <SettingsSync />
          {/* The site's only navigation, on every route. */}
          <SiteNav />
          {/* Fetches the account's board records when signed in. Renders nothing. */}
          <BestsSync />
          {children}
          {/* Sign-in and privacy dialogs, opened imperatively from anywhere. */}
          <AccountMenu />
          {/* Achievement and invite toasts, here rather than on the game page so
              they survive navigation; their code loads when one first shows. */}
          <Toasts />
        </AuthProvider>
        <UsageAnalytics />
      </body>

    </html>
  );
}
