/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    es2021: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
  ],
  plugins: ["@typescript-eslint"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: true,
    tsconfigRootDir: __dirname,
  },

  settings: {
    "import/resolver": {
      typescript: true,
      node: true,
    },
  },
  ignorePatterns: ["build/**", "public/build/**", ".eslintrc.cjs"],
  rules: {
    "import/no-internal-modules": [
      "error",
      {
        allow: [
          "~/*",
          "vitest/*",

          // Onion Architecture
          "~/logic/tools",
          "~/logic/domain",
          "~/logic/implementation",
        ],
      },
    ],
  },
};
