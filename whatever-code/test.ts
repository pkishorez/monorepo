import { Codex } from "@openai/codex-sdk";

const codex = new Codex({});
const thread = codex.startThread();
const result = await thread.runStreamed("What is Effect TS?");

for await (let event of result.events) {
  console.dir(event, { depth: 10, colors: true });
}
