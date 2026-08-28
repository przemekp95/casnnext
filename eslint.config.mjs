import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "dist/**",
      "app/generated/**",
      "**/*.d.ts",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    name: "casn/strict-first-party",
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-require-imports": "error",
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/no-var-requires": "error",
      "@next/next/no-assign-module-variable": "error",
      "@next/next/no-css-tags": "error",
      "@next/next/no-img-element": "error",
    },
  },
  {
    name: "casn/react-hook-supported-files",
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      "react-hooks/error-boundaries": "error",
      "react-hooks/set-state-in-effect": "error",
    },
  },
  {
    name: "casn/next-image-mock",
    files: ["test/__mocks__/nextImageMock.tsx"],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
);
