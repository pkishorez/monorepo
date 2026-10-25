# AI Toolkit

Making Coding Harnesses work, and nothing around them: opening a harness's Conversation in a folder, running and steering its Turns, forking it and asking it, and reading what it emits as Messages. It keeps nothing and serves nothing; what is kept of a Conversation, and where, is the business of whoever uses it, such as [[connect]]'s Sessions.

## Language

**Coding Harness**:
A provider-native coding agent, such as Claude Code or Codex, that executes work in a folder.
_Avoid_: model, provider, agent SDK

**Harness Binary**:
The executable a Coding Harness runs as on this computer. Each harness has a default; the user may point it at another path.
_Avoid_: CLI path, executable setting

**Language Model**:
A named model offered through a Coding Harness. A Conversation has one, and any Turn may change it within the same harness.
_Avoid_: harness, provider

**Conversation**:
A Coding Harness's own context in one folder, named by its Native Id. Its harness never changes. Opened, it is a **live Conversation**: an agent running Turns, until it is closed.
_Avoid_: session (that is Code's word for a kept Conversation), thread, chat, HarnessSession

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
The harness's own identity for a Conversation or Turn, used to resume and to fork its context.
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
A new Conversation in the same harness that carries on another's context from a Fork Point. The original is untouched.
_Avoid_: branch, clone, copy

**Fork Point**:
The end of a finished Turn; a Fork keeps that Turn and everything before it.
_Avoid_: checkpoint, message index

**Ask**:
A question put to a Conversation's context that leaves the Conversation untouched, answered as text or as data shaped by a given schema. The answer is not kept.
_Avoid_: side question, btw, query, summarize

**One-shot Prompt**:
A prompt a Coding Harness answers with no Conversation behind it and nothing kept, such as writing a Title for a Session.
_Avoid_: titler, completion, Ask (that reads a Conversation)

**Background Job**:
Work a live Conversation's agent started that runs beyond the Turn that started it, such as a shell process or a subagent. Background Jobs live only while the Conversation is open and are never kept.
_Avoid_: task, process, daemon

**MCP Server Status**:
Which MCP servers a live Conversation's agent is connected to, and how each stands.
_Avoid_: tool status, plugin status

**Context Usage**:
How much of a Conversation's context window is filled, and the account's remaining rate limits.
_Avoid_: tokens left, quota

**Speech to Text**:
Turning spoken audio into text, on the computer itself. It knows nothing of Conversations or Coding Harnesses.
_Avoid_: transcription service, STT, voice
