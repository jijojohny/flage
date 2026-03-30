import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Allow ethers and other CJS modules
  transpilePackages: [],
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    return config;
  },
};

export default config;
