/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker deployments
  output: 'standalone',
  
  experimental: {
    serverComponentsExternalPackages: ['playwright', 'pg'],
  },
  
  // Production optimizations
  poweredByHeader: false, // Remove X-Powered-By header for security
  compress: true, // Enable gzip compression
  
  // Ensure Playwright runs server-side only
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't bundle playwright on the client
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        child_process: false,
      };
    }
    return config;
  },
  
  // Security headers (also configured in middleware.ts)
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
