import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  experimental: {
    allowedDevOrigins: ['127.0.0.1:4000', 'localhost:4000'],
  },
};

export default nextConfig;
