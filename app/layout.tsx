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
  title: "Minesweeper Co-Op - An Online Multiplayer",
  description: "The Free Online Minesweeper Game! Team up to uncover mines and compete in real-time challenges - Different multiplayer modes coming soon!",
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
        <title>Minesweeper Co-Op - An Online Multiplayer</title>
        <meta name="description" content="The Free Online Minesweeper Game! Team up to uncover mines and compete in real-time challenges - Different multiplayer modes coming soon!" />
        <meta name="keywords" content="minesweeper, co-op games, online games, retro games, multiplayer" />
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
