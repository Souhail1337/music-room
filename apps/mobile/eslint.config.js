// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // jest.mock factories are hoisted above imports, so they load modules with require().
    files: ["src/**/__tests__/**", "src/testing/**"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);
