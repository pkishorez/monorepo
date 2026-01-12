import { Command } from "@effect/cli";
import { Effect } from "effect";
import { renderTui } from "../../tui";

export const tui = Command.make("tui", {}, () => Effect.promise(renderTui));
