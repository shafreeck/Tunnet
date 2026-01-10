import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // @ts-ignore
  allowedDevOrigins: [
    'localhost:4000',
    '127.0.0.1:4000',
    '0.0.0.0:4000',
    'localhost:3000',
    '127.0.0.1:3000',
    'tauri://localhost'
  ],
};

export default nextConfig;
