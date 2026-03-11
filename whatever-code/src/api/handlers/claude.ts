import { query } from "@anthropic-ai/claude-agent-sdk";
import { Stream } from "effect";
import { ClaudeChatError, ClaudeRpcs } from "../definitions/claude.js";

export const ClaudeHandlers = ClaudeRpcs.toLayer(
  ClaudeRpcs.of({
    claudeChat: ({ prompt, sessionId }) =>
      Stream.fromAsyncIterable(
        query({
          prompt,
          options: {
            permissionMode: "bypassPermissions",
            allowDangerouslySkipPermissions: true,
          },
        }),
        (error) => new ClaudeChatError({ message: String(error) }),
      ).pipe(
        Stream.map((message) => ({
          value: {
            messageId: crypto.randomUUID(),
            sessionId,
            payload: { type: "claude-code" as const, message },
          },
          meta: {
            _v: "v1",
            _e: "Message",
            _d: false,
            _u: new Date().toISOString(),
          },
        })),
      ),
  }),
);
