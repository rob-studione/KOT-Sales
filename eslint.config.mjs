import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Existing codebase uses incremental typing; allow `any` where practical.
      "@typescript-eslint/no-explicit-any": "off",
      // React Compiler / purity-style rules are too strict for this codebase today.
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/no-ref-access-in-render": "off",
      "react-hooks/refs": "off",
      "react-hooks/error-boundaries": "off",
    },
  },
  {
    files: ["scripts/**/*.{js,cjs,mjs,ts,cts,mts}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
