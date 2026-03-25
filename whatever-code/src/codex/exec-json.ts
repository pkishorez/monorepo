import { execFile } from "node:child_process";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Effect, JSONSchema, Schema } from "effect";
import { CodexChatError } from "../api/definitions/codex.js";

const CODEX_TIMEOUT_MS = 60_000;

const tmpDir =
  process.env.TMPDIR ?? process.env.TEMP ?? process.env.TMP ?? "/tmp";

function tempPath(prefix: string): string {
  return join(tmpDir, `wc-${prefix}-${process.pid}-${randomUUID()}.tmp`);
}

async function safeUnlink(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {}
}

function execWithStdin(
  cmd: string,
  args: string[],
  opts: { cwd: string; timeout: number; maxBuffer: number },
  stdin: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      cmd,
      args,
      { ...opts, env: { ...process.env } },
      (error, stdout) => {
        if (error) return reject(error);
        resolve(String(stdout));
      },
    );
    child.stdin?.end(stdin);
  });
}

/**
 * Runs `codex exec` with structured JSON output via `--output-schema`
 * and `--output-last-message`, then decodes the result against the
 * provided Effect Schema.
 */
export const execCodexJson = <A, I, R>(params: {
  cwd: string;
  prompt: string;
  schema: Schema.Schema<A, I, R>;
  model?: string;
  timeout?: number;
}): Effect.Effect<A, CodexChatError> =>
  Effect.tryPromise({
    try: async () => {
      const schemaPath = tempPath("codex-schema");
      const outputPath = tempPath("codex-output");

      try {
        const jsonSchema = JSONSchema.make(params.schema);
        await writeFile(schemaPath, JSON.stringify(jsonSchema));
        await writeFile(outputPath, "");

        const args = [
          "exec",
          "--ephemeral",
          "-s",
          "read-only",
          "--config",
          'model_reasoning_effort="low"',
          "--output-schema",
          schemaPath,
          "--output-last-message",
          outputPath,
          ...(params.model ? ["-m", params.model] : []),
          "-",
        ];

        await execWithStdin("codex", args, {
          cwd: params.cwd,
          timeout: params.timeout ?? CODEX_TIMEOUT_MS,
          maxBuffer: 1024 * 1024,
        }, params.prompt);

        const raw = await readFile(outputPath, "utf-8");
        return JSON.parse(raw) as A;
      } finally {
        await Promise.all([safeUnlink(schemaPath), safeUnlink(outputPath)]);
      }
    },
    catch: (e) =>
      new CodexChatError({
        message: e instanceof Error ? e.message : String(e),
      }),
  });
