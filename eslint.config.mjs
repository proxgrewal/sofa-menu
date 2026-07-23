// Flat ESLint config. Kept intentionally light: TypeScript-aware linting on the
// app/lib/components source, with the noisy rules that fight Next.js/React
// conventions dialed down. Build + typecheck remain the hard gate; lint catches
// the class of mistakes the compiler doesn't (unused vars, etc.).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [".next/**", "node_modules/**", "out/**", "public/**", "site/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Register the Next.js plugin so the inline `@next/next/*` disable comments
    // in components resolve, and its recommended rules run on the source.
    plugins: { "@next/next": nextPlugin, "react-hooks": reactHooks },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Node-runtime tooling: CommonJS scripts + ESM test helpers.
    files: ["test/**", "scripts/**", "*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
        URL: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-undef": "off",
    },
  }
);
