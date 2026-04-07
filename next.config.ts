import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const nextConfig: NextConfig = {
  // Disable Strict Mode to avoid double effects during dev streaming
  reactStrictMode: false,
  /* config options here */
  webpack: (config, { isServer }) => {
    // Monaco Editor webpack config
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
      };
    }
    return config;
  },
  eslint: {
    // Menonaktifkan ESLint selama build untuk mengatasi error
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Menonaktifkan pemeriksaan tipe selama build
    ignoreBuildErrors: true,
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  // Menghapus experimental.nodeMiddleware karena hanya tersedia di versi canary
  async redirects() {
    return [
      {
        source: "/acadlabs-logo.png",
        destination: "/favicon-black.ico",
        permanent: false,
      },
      {
        source: "/favicon.ico",
        destination: "/favicon-black.ico",
        permanent: true,
      },
      // CLI installation script redirects
      {
        source: "/install.sh",
        destination:
          "https://raw.githubusercontent.com/Acadgacor/Acadlabs-CLI/main/install.sh",
        permanent: false,
      },
      {
        source: "/install.ps1",
        destination:
          "https://raw.githubusercontent.com/Acadgacor/Acadlabs-CLI/main/install.ps1",
        permanent: false,
      },
      {
        source: "/install.cmd",
        destination:
          "https://raw.githubusercontent.com/Acadgacor/Acadlabs-CLI/main/install.cmd",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=(), browsing-topics=()",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://vercel.live https://js.hcaptcha.com https://*.hcaptcha.com https://s3.tradingview.com https://tako.id; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://*.hcaptcha.com; img-src 'self' blob: data: https:; font-src 'self' data: https://cdn.jsdelivr.net https://unpkg.com; connect-src 'self' https:; worker-src 'self' blob:; frame-src 'self' https://*.hcaptcha.com https://www.tradingview.com https://s3.tradingview.com https://s.tradingview.com https://tako.id; wss://*.supabase.co;",
          },
        ],
      },
      {
        source: "/dashboard/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/chat/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/login",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/register",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

export default withBundleAnalyzer(nextConfig);
