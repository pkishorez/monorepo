import { Command } from "@effect/cli";
import { Effect } from "effect";
import { renderTui } from "../../tui/index.js";

export const updates = Command.make("updates", {}, () =>
  Effect.promise(() => renderTui(process.cwd()))
);
