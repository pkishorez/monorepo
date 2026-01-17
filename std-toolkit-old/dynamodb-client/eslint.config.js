import baseConfig from '../../../eslint.config.mjs';

export default [
  ...await baseConfig,
  {
    ignores: [
      "scripts/**/*",
      "src/services/dynamodb/types.ts",
      "src/services/dynamodb/types.spec.json",
    ],
  },
];

