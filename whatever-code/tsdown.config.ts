import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: ["src/cli.ts"],
    format: "esm",
    banner: { js: "#!/usr/bin/env node" },
    outDir: "dist",
    clean: true,
  },
  {
    entry: ["src/api/definitions/index.ts"],
    format: "esm",
    dts: true,
    sourcemap: "inline",
    outDir: "dist/api/definitions",
  },
  {
    entry: ["src/entity/claude/index.ts"],
    format: "esm",
    dts: true,
    sourcemap: "inline",
    outDir: "dist/entity/claude",
  },
  {
    entry: ["src/entity/project/index.ts"],
    format: "esm",
    dts: true,
    sourcemap: "inline",
    outDir: "dist/entity/project",
  },
]);
