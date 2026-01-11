// next.config.ts
import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig = {
  typescript: { ignoreBuildErrors: false },
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
  // output: "standalone",        // REMOVED - causing deployment issues
  images: { unoptimized: true }, // <- naprawia 400 na /_next/image
  // turbopack: {
  //   rules: undefined  // Remove invalid 'conditions' if present
  // }
} satisfies NextConfig;

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: { remarkPlugins: [], rehypePlugins: [] },
});

export default withMDX(nextConfig);