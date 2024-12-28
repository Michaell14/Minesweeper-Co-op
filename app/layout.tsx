import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Provider } from "@/components/ui/provider";
import { Analytics } from '@vercel/analytics/next';
import Footer from "@/components/Footer";
import { ChakraProvider, createSystem, defineConfig } from "@chakra-ui/react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Minesweeper Co-Op - An Online Multiplayer",
  description: "The Free Online Minesweeper Game! Team up to uncover mines and compete in real-time challenges - Different multiplayer modes coming soon!",
};

const config = defineConfig({
  theme: {
    tokens: {
      colors: {},
    },
  },
})

const system = createSystem(config)

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link href="https://fonts.googleapis.com/css?family=Press+Start+2P" rel="stylesheet" />
        <link href="https://unpkg.com/nes.css/css/nes.css" rel="stylesheet" />
        <title>Minesweeper Co-Op</title>
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
