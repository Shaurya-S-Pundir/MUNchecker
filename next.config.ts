import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Required for Google APIs on Vercel edge/serverless
  serverExternalPackages: ['googleapis'],
  // Avoid bundling googleapis on the client
  webpack: (config, { isServer }) => {
    if (!isServer) {
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
};

export default nextConfig;
