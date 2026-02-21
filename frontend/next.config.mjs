/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export for production (served by nginx)
  output: 'export',

  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },

  // Trailing slashes for static file serving
  trailingSlash: false,

  // Proxy API requests to the Rust service during development
  // Note: rewrites don't work with static export, but we keep them for dev mode
  async rewrites() {
    // Skip rewrites in production/export mode
    if (process.env.NODE_ENV === 'production') {
      return [];
    }
    return [
      {
        source: '/v1/:path*',
        destination: 'http://127.0.0.1:9010/v1/:path*',
      },
      {
        source: '/healthz',
        destination: 'http://127.0.0.1:9010/healthz',
      },
    ];
  },
};

export default nextConfig;
