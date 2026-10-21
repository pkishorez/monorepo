# QA scenarios (draft)

Draft from the QA pass on 2026-10-22. The recordings will be redone after the UI redesign.

## Run it yourself

```sh
pnpm --filter @kestack/ai-toolkit build
node toolkits/ai-toolkit/bin/ai-toolkit.mjs serve --port 4590 --db /tmp/ai-qa-db/ai.db
pnpm --filter ai dev   # open the URL it prints
```

Test folders: `/tmp/ai-qa/demo` (README.md, math.ts, package.json) and `/tmp/ai-qa/other`.
Models: Claude `claude-haiku-5-5` (effort Low), Codex `gpt-5.6-luna` (reasoning effort Low).

## Results

| #   | Scenario                | What to watch for                                                                                                      | Result                                                                                | Video                           |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------- |
| 01  | Add a folder            | Relative path refused, missing folder error, then /tmp/ai-qa/demo opens its project page                               | pass                                                                                  | videos/01-add-folder.mp4        |
| 02  | New Claude session      | Agent and model pickers, search "haiku", settings, tool rows spin then show ✓, ls row expanded, auto title, usage line | pass (Haiku is fast, so the spinners show for about a second)                         | videos/02-claude-session.mp4    |
| 03  | Claude subagent         | Subagent block nests its `wc -l` call and "What it reported"; collapse and expand                                      | pass                                                                                  | videos/03-claude-subagent.mp4   |
| 04  | Claude steer            | Stop and Steer buttons while running, "Steered" marker, answer includes the math.ts line count                         | pass                                                                                  | videos/04-claude-steer.mp4      |
| 05  | Claude stop             | `sleep 30` stopped: turn and tool both say Stopped; the next message answers "ready"                                   | pass after a fix (the first, stopped turn in the transcript is from the pre-fix take) | videos/05-claude-stop.mp4       |
| 06  | New Codex session       | GPT-5.6 Luna, Low effort, shell rows, math.ts edit with diff, usage                                                    | pass (subtract was added to math.ts)                                                  | videos/06-codex-session.mp4     |
| 07  | Codex subagent          | Sub-agent block nests its prompt, its `ls -la` and its report                                                          | pass                                                                                  | videos/07-codex-subagent.mp4    |
| 08  | Codex steer and stop    | Steered marker, answer covers the steer; `sleep 30` stopped; next message works                                        | pass                                                                                  | videos/08-codex-steer-stop.mp4  |
| 09  | Projects                | Add "other" from the sidebar, switch projects and sessions, "Keep it", then remove; folder listing shown at the end    | pass                                                                                  | videos/09-projects.mp4          |
| 10  | Reload                  | Scroll to top, reload, transcript comes back scrolled to the bottom                                                    | pass                                                                                  | videos/10-reload.mp4            |
| 11a | Server restart (idle)   | "Reconnecting to the server..." in the sidebar, reconnects by itself, agent remembers the first question               | pass                                                                                  | videos/11a-server-restart.mp4   |
| 11b | Server restart mid-turn | `sleep 40` running, server killed and restarted, turn shows Stopped, next message works                                | pass                                                                                  | videos/11b-restart-mid-turn.mp4 |
| 12  | Theme and long scroll   | Light and dark on session, project and home pages; smooth scroll through two long transcripts                          | pass                                                                                  | videos/12-theme-scroll.mp4      |

Final-state screenshots are in `screenshots/` with the same names.

Folder check after removing "other" (scenario 09, terminal):

```
$ ls -la /tmp/ai-qa/other
-rw-r--r--  1 kishorepolamarasetty  wheel   17 22 Oct 00:19 notes.txt
-rw-r--r--  1 kishorepolamarasetty  wheel    8 22 Oct 00:19 README.md
```

## Fixed during QA

- A Claude tool stopped by Stop showed "Failed" with Claude's "The user doesn't want to proceed..." text. Claude answers an interrupt with an error tool result, so the row now counts as stopped when the turn was cancelled and that result came after the agent's last message. When expanded, the output is labelled "Stopped". Files: `src/client/views/project/session/transcript/thread.ts`, `thread.test.ts` (new test), `transcript.tsx`.

## Known issues

- Claude sessions load your global Claude config (MCP servers, SessionStart hooks). In scenario 03 the agent talked about MCP servers needing attention. Codex also reads your global skills (scenario 07 read the orchestrate skill).
- "Reconnecting to the server..." is small grey text at the bottom of the sidebar, easy to miss. While disconnected, the session still shows "Working..." with Steer and Stop enabled.
- Stopping the server logs a stack trace for each open WebSocket (`InterruptError: All fibers interrupted without error`, INFO level, status 503). This is shutdown noise, not a failure. No other errors appeared in the server log.
- For Claude, a turn's cost includes subagents but its token counts do not.
- Claude's subagent block shows no prompt row (Codex's does).
