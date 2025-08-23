// eslint.config.mjs
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  // 1) Ignorowane ścieżki (zamiast .eslintignore)
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "app/generated/**", // Prisma client i runtime (vendor)
      // jeśli chcesz: wycisz typy
      // "**/*.d.ts",
    ],
  },

  // 2) Bazowe konfiguracje Next (core web vitals + TS)
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // 3) Drobne dopasowania pod projekt
  /*{
    rules: {
      // pozwól używać <img> (np. w stopce)
      "@next/next/no-img-element": "off",
    },
  },*/

  // 4) (opcjonalnie) jeżeli NIE chcesz globalnie ignorować .d.ts,
  //    to złagodź reguły tylko dla definicji typów:
  // {
  //   files: ["**/*.d.ts"],
  //   rules: {
  //     "@typescript-eslint/no-explicit-any": "off",
  //     "@typescript-eslint/no-empty-object-type": "off",
  //     "@typescript-eslint/no-unsafe-function-type": "off",
  //   },
  // },
];
