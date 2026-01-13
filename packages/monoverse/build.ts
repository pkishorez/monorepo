/// <reference types="@types/bun" />
import pkg from "./package.json";

const result = await Bun.build({
  entrypoints: ["./src/cli/index.ts"],
  outdir: "./dist",
  target: "bun",
  format: "esm",
  sourcemap: "external",
  external: [
    "@opentui/core",
    "@opentui/react",
    "react",
  ],
  define: {
    MONOVERSE_VERSION: JSON.stringify(pkg.version),
  },
  naming: {
    entry: "cli.js",
  },
});

if (result.success) {
  const cliPath = "./dist/cli.js";
  const content = await Bun.file(cliPath).text();
  await Bun.write(cliPath, `#!/usr/bin/env bun\n${content}`);
  await Bun.$`chmod +x ${cliPath}`;
  console.log("Build complete");
} else {
  console.error("Build failed:", result.logs);
  process.exit(1);
}
