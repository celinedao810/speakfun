import type { NextConfig } from "next";
// @ts-expect-error - next-pwa doesn't have type declarations
import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
      handler: 'NetworkOnly',
    },
  ],
});

const nextConfig: NextConfig = {
  // Empty turbopack config to suppress the warning in dev mode
  turbopack: {},
  reactStrictMode: false,
};

export default withPWA(nextConfig);
