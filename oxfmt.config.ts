import { defineConfig } from "oxfmt";

export default defineConfig({
  trailingComma: "es5",
  sortPackageJson: false,
  ignorePatterns: ["pnpm-lock.yaml", "node_modules/"],
  sortImports: {
    groups: ["builtin", "external", "internal", ["parent", "sibling"], "type", "index"],
  },
});
