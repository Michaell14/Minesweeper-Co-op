/** @type {import('next').NextConfig} */
const nextConfig = {
    async redirects() {
        return [
            // The no-guess page was folded into How to play; the old URL is
            // indexed and linked from outside, so it keeps resolving.
            {
                source: "/no-guess-minesweeper",
                destination: "/how-to-play#no-guess",
                permanent: true,
            },
        ];
    },
};

export default nextConfig;
