// next.config.ts
import createMDX from "@next/mdx";
import type { NextConfig } from "next";
import { legacyAnalysisRedirects } from "./lib/routing/legacy-analysis-redirects";

const nextConfig = {
  typescript: { ignoreBuildErrors: false },
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
  turbopack: {
    root: process.cwd(),
  },
  images: {
    unoptimized: true, // <- naprawia 400 na /_next/image
    qualities: [60, 68, 74, 75],
  },
  async redirects() {
    return legacyAnalysisRedirects;
  },
} satisfies NextConfig;

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: { remarkPlugins: [], rehypePlugins: [] },
});

export default withMDX(nextConfig);
