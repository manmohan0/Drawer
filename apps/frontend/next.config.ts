import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */ 
  transpilePackages: [
    "@repo/common",
    "@repo/ui"
  ]
};

export default nextConfig;
