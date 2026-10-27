# AI Toolkit

Making Coding Harnesses work, and nothing around them: opening an Agent in a folder, running and steering its Turns, forking it and asking it, and reading what it emits as Messages; and Speech to Text. It keeps nothing and serves nothing, and offers plain Effects, not Actors: what is kept of an Agent, and how its Turns are ordered, is the business of whoever uses it, such as [[connect]]'s Sessions.

## Language

**Coding Harness**:
A provider-native coding agent, such as Claude Code or Codex, that executes work in a folder.
_Avoid_: model, provider, agent SDK

**Harness Binary**:
The executable a Coding Harness runs as on this computer: the one the user installed, found by its name on PATH, unless a Harness Account points at another path. This package ships none.
_Avoid_: CLI path, executable setting, bundled binary

**Harness Account**:
One login of a Coding Harness on this computer: the Harness Binary it runs and the config folder it keeps its login, settings and transcripts in (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`), such as a work Claude beside a personal one. Every harness call runs as one; an Agent's context lives in its account's folder, so it is resumed, forked and asked as the same account. One with no folder of its own uses the environment's, else the harness's own.
_Avoid_: profile, alias, login (alone), instance

**Language Model**:
A named model offered through a Coding Harness. An Agent has one, and any Turn may change it within the same harness.
_Avoid_: harness, provider

**Agent**:
A Coding Harness's agent in one folder, resumed by its Native Id. It is open while its process runs, and runs one Turn at a time. Its harness never changes.
_Avoid_: conversation, live conversation, session (that is Code's word for a kept Agent), HarnessSession, thread, chat

**Turn**:
One user message to the agent and everything it emits until it is idle again. Messages sent while it runs steer it; one the agent could not take before the Turn ended starts the next Turn instead.
_Avoid_: run, request, iteration

**Agent-started Turn**:
A Turn the Coding Harness begins on its own, without a user message, such as when a Background Job finishes. It begins only while no user Turn runs.
_Avoid_: automatic turn, wake-up

**Cancelled**:
A Turn the user stopped.
_Avoid_: interrupted, aborted

**Failed**:
A Turn the Coding Harness itself ended in an error.
_Avoid_: cancelled, interrupted

**Native Id**:
The harness's own identity for an Agent or Turn, used to resume and to fork its context.
_Avoid_: session id, resume token

**Message**:
An immutable record of what a Turn emitted since the last flush: a role and its parts, such as text, thinking, tool calls, and attachments. A long Turn is several Messages.
_Avoid_: chunk, event, delta

**Attachment**:
A file sent with a user message: an image, video, audio clip, or other file.
_Avoid_: upload, media, blob

**Skill**:
A named, reusable instruction set a Coding Harness offers in a folder, invoked from a user message. Each harness lists its own.
_Avoid_: command, prompt, plugin

**Fork**:
A new Agent in the same harness that carries on another's context from a Fork Point. The original is untouched.
_Avoid_: branch, clone, copy

**Fork Point**:
The end of a finished Turn; a Fork keeps that Turn and everything before it.
_Avoid_: checkpoint, message index

**Ask**:
A question put to an Agent's context that leaves the Agent untouched, answered as text or as data shaped by a given schema. The answer is not kept.
_Avoid_: side question, btw, query, summarize

**One-shot Prompt**:
A prompt a Coding Harness answers with no Agent behind it and nothing kept, such as writing a Title for a Session.
_Avoid_: titler, completion, Ask (that reads an Agent)

**Background Job**:
Work an open Agent started that runs beyond the Turn that started it, such as a shell process or a subagent. Background Jobs live only while the Agent is open and are never kept.
_Avoid_: task, process, daemon

**Agent Question**:
A question an Agent puts to the user while a Turn runs: one to four Question Items, each answered by choosing among its options or typing an answer of one's own. The Turn waits until it is answered or declined; declined, the agent carries on without an answer. It lives only while its Turn runs and is never kept, though the Turn's records show it asked and answered.
_Avoid_: prompt, elicitation, interaction request, Ask (that is put to an Agent)

**MCP Server Status**:
Which MCP servers an open Agent is connected to, and how each stands.
_Avoid_: tool status, plugin status

**Context Usage**:
How much of an Agent's context window is filled, and the account's remaining rate limits.
_Avoid_: tokens left, quota

**Speech to Text**:
Turning spoken audio into text, on the computer itself. It knows nothing of Agents or Coding Harnesses.
_Avoid_: transcription service, STT, voice

## TODO

- The Agent SDK's JavaScript is vendored at one version (`@anthropic-ai/claude-agent-sdk` in the catalog), and Codex's app-server protocol is typed at one version, but each runs whatever Claude Code or Codex the user installed. Nothing checks that the two agree: a Claude Code or Codex much older or newer than the one this package was built against may refuse an option, or send records the projection does not know. Read each Harness Binary's `--version`, say when it is outside the range this package was tested with, and keep the range in one place.
