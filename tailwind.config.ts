import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    // The app's one font is applied globally in app/globals.css via the
    // next/font CSS variable, not through a Tailwind `font-*` utility.
    extend: {},
  },
  plugins: [],
};
export default config;
