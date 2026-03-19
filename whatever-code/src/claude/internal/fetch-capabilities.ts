import {
  query,
  type ModelInfo,
  type SlashCommand,
} from "@anthropic-ai/claude-agent-sdk";
import { Effect } from "effect";

export interface SessionCapabilities {
  models: ModelInfo[];
  commands: SlashCommand[];
}

export const fetchSessionCapabilities = (absolutePath: string) =>
  Effect.async<SessionCapabilities, Error>((resume) => {
    async function* neverYield() {
      await new Promise(() => {});
    }

    const q = query({
      prompt: neverYield(),
      options: { cwd: absolutePath, permissionMode: "plan" },
    });

    let resolved = false;

    (async () => {
      for await (const message of q) {
        if (message.type === "system" && message.subtype === "init") {
          const [models, commands] = await Promise.all([
            q.supportedModels(),
            q.supportedCommands(),
          ]);
          resolved = true;
          q.close();
          resume(Effect.succeed({ models, commands }));
          break;
        }
      }
      if (!resolved) {
        resume(Effect.fail(new Error("Query ended before init")));
      }
    })();

    return Effect.sync(() => q.close());
  });
