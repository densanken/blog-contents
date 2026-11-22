import { defineConfig } from "oxlint";

export default defineConfig({
  categories: {
    correctness: "error",
    suspicious: "error",
    pedantic: "error",
  },
  options: {
    typeAware: true,
  },
  rules: {
    "require-unicode-regexp": "off",
    "typescript/prefer-readonly-parameter-types": "off",
  },
  overrides: [
    {
      // node:test の test() は Promise を返すが、ランナーが待つので await しなくてよい
      // モックは型を絞らずに書くので、any まわりの検査も外す
      files: ["scripts/*.test.ts"],
      rules: {
        "typescript/no-floating-promises": "off",
        "typescript/require-await": "off",
        "require-await": "off",
        "max-lines": "off",
        "max-lines-per-function": "off",
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-return": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-type-assertion": "off",
        "typescript/strict-boolean-expressions": "off",
      },
    },
  ],
});
