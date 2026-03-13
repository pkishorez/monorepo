// THIS IS A PLAY FILE. JUST FOR CASUAL STUFF!!!
import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { v7 } from "uuid";
import * as readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function* cliPrompts(): AsyncIterable<SDKUserMessage> {
  while (true) {
    let input = "";
    while (input.length === 0) {
      input = await ask("> ");
    }
    if (input === "STOP") return;

    const uuid = v7();
    yield {
      type: "user",
      uuid: uuid as any,
      message: { role: "user", content: input },
      parent_tool_use_id: null,
    } as any;
    console.log(`[CLAUDE]: I have the message now! With id ${uuid}`);
  }
}

async function main() {
  for await (const message of query({
    prompt: cliPrompts(),
    options: {
      resume: "1c43cf73-8d00-4ab4-a916-7028238782f0",
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: 100,
    },
  })) {
    console.dir(message, { depth: null, colors: true });
  }

  rl.close();
}

main();
