import type { Metadata } from "next";
import { Inter, Press_Start_2P } from "next/font/google";
import "./globals.css";
import { Provider } from "@/components/ui/provider";
import { Analytics } from '@vercel/analytics/next';
import Footer from "@/components/Footer";

const inter = Inter({ subsets: ["latin"] });
const pressStart2P = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  display: "optional",
  variable: "--font-press-start-2p"
});

export const metadata: Metadata = {
  title: "Minesweeper Co-Op - Free Online Multiplayer Minesweeper Game | Unblocked",
  description: "Play FREE Minesweeper Co-Op online! The best multiplayer minesweeper game for 2+ players. Unblocked at school and work. Play with friends, compete in real-time, and enjoy classic puzzle gaming together. No download required!",
  keywords: [
    "minesweeper",
    "minesweeper online",
    "minesweeper multiplayer",
    "minesweeper co-op",
    "minesweeper coop",
    "play minesweeper",
    "free minesweeper",
    "minesweeper game",
    "online minesweeper",
    "unblocked games",
    "unblocked minesweeper",
    "minesweeper unblocked",
    "two player games",
    "2 player games",
    "couple games",
    "games to play with friends",
    "multiplayer puzzle games",
    "cooperative games",
    "browser games",
    "free online games",
    "play with friends",
    "web games",
    "puzzle games",
    "strategy games",
    "logic games",
    "mind games",
    "brain games",
    "classic games online",
    "retro games",
    "minesweeper browser",
    "no download games",
    "instant play games",
    "school games",
    "work games"
  ].join(", "),
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
    url: 'https://www.minesweepercoop.com',
    siteName: 'Minesweeper Co-Op',
    title: 'Minesweeper Co-Op - Free Online Multiplayer Minesweeper | Unblocked',
    description: 'Play FREE Minesweeper Co-Op online! The best multiplayer minesweeper game for 2+ players. Unblocked at school and work. Team up with friends in this classic puzzle game!',
    images: [
      {
        url: 'https://www.minesweepercoop.com/minesweeperss.png',
        width: 1200,
        height: 630,
        alt: 'Minesweeper Co-Op Multiplayer Game Screenshot',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Minesweeper Co-Op - Free Online Multiplayer Minesweeper | Unblocked',
    description: 'Play FREE Minesweeper Co-Op online! The best multiplayer minesweeper game for 2+ players. Unblocked at school and work.',
    images: ['https://www.minesweepercoop.com/minesweeperss.png'],
    creator: '@yourtwitterhandle',
  },
  alternates: {
    canonical: 'https://www.minesweepercoop.com',
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
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link href="https://unpkg.com/nes.css/css/nes.css" rel="stylesheet" />
        <link rel="canonical" href="https://www.minesweepercoop.com" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#ffffff" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "VideoGame",
              "name": "Minesweeper Co-Op",
              "description": "Free online multiplayer minesweeper game. Play with friends, unblocked at school and work. Team up to solve puzzles together!",
              "url": "https://www.minesweepercoop.com",
              "image": "https://www.minesweepercoop.com/minesweeperss.png",
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
              "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": "4.8",
                "ratingCount": "1250",
                "bestRating": "5",
                "worstRating": "1"
              },
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
        <Provider defaultTheme="light" enableSystem={false}>
          {children}
          <Footer />
          <Analytics />
        </Provider>
      </body>

    </html>
  );
}
