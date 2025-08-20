import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/:path*',
      },
      // Serve SPA routes via the root page so hard refreshes don't 404
      {
        source: '/charts',
        destination: '/',
      },
      {
        source: '/trace',
        destination: '/',
      },
      {
        source: '/trace/:path*',
        destination: '/',
      },
    ];
  },
};

export default nextConfig;
