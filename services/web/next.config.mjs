import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@anima/shared'],
  images: { remotePatterns: [] },
  // Trace files relative to the monorepo root, not the user's home dir.
  outputFileTracingRoot: path.join(__dirname, '../..'),
};

export default nextConfig;
