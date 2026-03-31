/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  transpilePackages: [],
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    return config;
  },
};

export default config;
