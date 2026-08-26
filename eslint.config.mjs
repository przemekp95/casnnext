import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig(
  // 1) Ignorowane ścieżki (zamiast .eslintignore)
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "dist/**",
      "app/generated/**", // Generated client and runtime (vendor)
      "**/*.d.ts", // TypeScript definition files
    ],
  },

  // 2) Bazowe konfiguracje Next (core web vitals + TS)
  ...nextCoreWebVitals,
  ...nextTypescript,

  // 3) Reguły dla testów - automatyczne wyłączanie uzasadnionych błędów
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off", // Test mocks require any types
      "@typescript-eslint/no-require-imports": "off", // Jest compatibility requires require()
      "@typescript-eslint/no-unused-vars": "off", // Test files often have unused variables (catch blocks, mocks)
      "@typescript-eslint/ban-ts-comment": "off", // Allow @ts-ignore in tests
    },
  },

  // 4) Reguły dla komponentów MDX - dynamic typing requirements
  {
    files: ["**/mdx/**/*.tsx", "**/mdx/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off", // MDX components require dynamic typing
    },
  },

  // 5) Reguły dla skryptów i config files
  {
    files: ["scripts/**/*.js", "scripts/**/*.ts", "**/*.config.js", "**/*.config.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off", // CommonJS scripts need require()
      "@typescript-eslint/no-var-requires": "off", // Allow var requires in scripts
    },
  },

  // 6) Reguły dla API routes - error handling patterns
  {
    files: ["app/api/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }], // Allow unused error vars in catch blocks
      "@typescript-eslint/no-explicit-any": "off", // API error handling requires any types
    },
  },

  // 7) Reguły dla lib files - database and utility functions
  {
    files: ["lib/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off", // Database operations require any types
      "@typescript-eslint/no-require-imports": "off", // Some legacy imports
    },
  },

  // 8) Reguły dla scripts - allow require() and disable module assignment warnings
  {
    files: ["scripts/**/*.js", "test/**/*.ts"],
    rules: {
      "@next/next/no-assign-module-variable": "off", // Allow module assignments in tests
    },
  },

  // 9) Drobne dopasowania pod projekt
  {
    rules: {
      // Pozwól używać <img> (np. w stopce)
      "@next/next/no-img-element": "off",
      // These strict React 19-oriented rules are too noisy for current codebase patterns.
      "react-hooks/error-boundaries": "off",
      "react-hooks/set-state-in-effect": "off",
      // Global rules - these will be overridden by file-specific rules above
      "@typescript-eslint/no-explicit-any": "error", // Strict any checking everywhere else
      "@typescript-eslint/no-require-imports": "error", // Require ES modules everywhere else
    },
  },
);
