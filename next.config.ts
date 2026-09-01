import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    localPatterns: [
      { pathname: "/brand/**", search: "" },
      { pathname: "/brand/**" },
    ],
  },
};

export default nextConfig;
