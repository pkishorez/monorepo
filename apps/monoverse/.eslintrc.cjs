/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: [
    "@remix-run/eslint-config",
    "@remix-run/eslint-config/node",
    "plugin:import/recommended",
  ],
  plugins: ["import"],
  ignorePatterns: ["build/**", "public/build/**"],
  rules: {
    "import/no-internal-modules": [
      "warn",
      {
        allow: [
          "~/*",

          // Onion Architecture
          "~/logic/tools",
          "~/logic/domain",
          "~/logic/implementation",
        ],
      },
    ],
  },
};
