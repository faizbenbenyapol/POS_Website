import type { NextConfig } from 'next';

/** คอนฟิกหลักของ Next.js — กำหนด mysql2 เป็น serverExternalPackages ป้องกัน Webpack chunk error */
const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['mysql2'],
};

export default nextConfig;
