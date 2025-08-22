// next.config.mjs (albo .ts – ważne by eksport był domyślny)
import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const withMDX = createMDX({
  // przykładowe opcje kompilatora MDX (opcjonalne)
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [],
    rehypePlugins: [],
  },
});

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
  output: "standalone",
};

export default withMDX(nextConfig);