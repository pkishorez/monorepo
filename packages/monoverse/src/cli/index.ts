import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, CliConfig } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Console, Effect, Layer } from "effect";
import { Monoverse } from "../core/index.js";
import {
  tui,
  add,
  remove,
  rm,
  deleteCmd,
  format,
  lint,
  fix,
  ls,
} from "./commands/index.js";

const getVersion = (): string => {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(__dirname, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return `v${pkg.version}`;
  } catch {
    return "na";
  }
};

const monoverse = Command.make("monoverse", {}, () =>
  Console.log("Use --help to see available commands"),
);

const command = monoverse.pipe(
  Command.withSubcommands([
    tui,
    add,
    remove,
    rm,
    deleteCmd,
    format,
    lint,
    fix,
    ls,
  ]),
);

const cli = Command.run(command, {
  name: "monoverse",
  version: getVersion(),
});

const MainLayer = Layer.mergeAll(
  NodeContext.layer,
  Monoverse.Default,
  CliConfig.layer({
    isCaseSensitive: false,
    showBuiltIns: false,
    showTypes: false,
  }),
);

cli(process.argv).pipe(
  Effect.provide(MainLayer),
  NodeRuntime.runMain({ disableErrorReporting: true }),
);
