const { FlatCompat } = require("@eslint/eslintrc");
const nextPlugin = require("@next/eslint-plugin-next");

const compat = new FlatCompat({ baseDirectory: __dirname });

module.exports = [
  {
    // NOTE: eslint.config.js is intentionally NOT ignored. `next build` detects
    // the Next.js plugin by computing the ESLint config for this very file; if it
    // were ignored the computed config would be empty and Next would warn that
    // "The Next.js plugin was not detected in your ESLint configuration."
    ignores: [
      ".next/**",
      "next-env.d.ts",
      "artifacts/**",
      "circuits/**/target/**",
      // Vendored third-party bundles (@aztec/bb.js) served as-is; not our source.
      "public/vendor/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Register the official Next.js plugin explicitly so detection succeeds even
    // for non-source files (eslint.config.js, package.json) that Next inspects.
    plugins: { "@next/next": nextPlugin },
  },
  {
    // This config file is CommonJS by necessity (FlatCompat + require()).
    files: ["eslint.config.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];
