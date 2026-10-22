# AI Toolkit

Server-side execution of coding agents whose conversations outlive individual client connections. The context owns Projects and Sessions and runs each Session on a Coding Harness while keeping that harness's native identity.

## Language

**Coding Harness**:
A provider-native coding agent, such as Claude Code or Codex, that executes work in a folder.
_Avoid_: model, provider, agent SDK

**Harness Binary**:
The executable a Coding Harness runs as on this machine. Each harness has a default; the user may point it at another path.
_Avoid_: CLI path, executable setting

**Language Model**:
A named model offered through a Coding Harness. A Session has one, and any Turn may change it within the same harness.
_Avoid_: harness, provider

**Project**:
A folder on this machine that Sessions run in.
_Avoid_: workspace, repo

**Session**:
One conversation with one Coding Harness in a Project's folder. Its harness never changes.
_Avoid_: thread, chat, conversation

**Session Status**:
How a Session stands: idle, running, or how its last Turn ended if not done: cancelled, failed, or interrupted.
_Avoid_: streaming flag

**Settled**:
A Session the user is done with: kept, but out of the way. Settling never stops a running Turn; sending the Session a message un-settles it.
_Avoid_: archived, done, hidden, closed

**Turn**:
One user message to the agent and everything it emits until it is idle again. Messages sent while it runs steer it; one the agent could not take before the Turn ended starts the next Turn instead.
_Avoid_: run, request, iteration

**Agent-started Turn**:
A Turn the Coding Harness begins on its own, without a user message, such as when a Background Job finishes.
_Avoid_: automatic turn, wake-up

**Cancelled**:
A Turn the user stopped.
_Avoid_: interrupted, aborted

**Interrupted**:
A Turn cut off because the server stopped while it ran, found at the next start.
_Avoid_: cancelled, failed

**Failed**:
A Turn the Coding Harness itself ended in an error.
_Avoid_: cancelled, interrupted

**Native Id**:
The harness's own identity for a Session or Turn, used to resume and to fork its context.
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
A new Session in the same harness that carries on another Session's conversation from a Fork Point. What came before that point stays the original's and is read from there, never copied; the Fork is listed as a Session of its own, not under the original. The original is untouched.
_Avoid_: branch, clone, copy

**Fork Point**:
The end of a finished Turn; a Fork keeps that Turn and everything before it.
_Avoid_: checkpoint, message index

**Ask**:
A question put to a Session's context that leaves the Session untouched, answered as text or as data shaped by a given schema. The answer is not kept.
_Avoid_: side question, btw, query, summarize

**Background Job**:
Work a Session's agent started that runs beyond the Turn that started it, such as a shell process or a subagent. Background Jobs live only while the server runs and are never stored.
_Avoid_: task, process, daemon

**MCP Server Status**:
Which MCP servers a Session's agent is connected to, and how each stands.
_Avoid_: tool status, plugin status

**Context Usage**:
How much of a Session's context window is filled, and the account's remaining rate limits.
_Avoid_: tokens left, quota

**Title**:
A short name for a Session, written from its user messages; it can be regenerated at any time.
_Avoid_: name, label

**Bootstrap Sweep**:
The startup step that finds Turns the last server left running and ends them interrupted.
_Avoid_: recovery, orphan reaper

**Machine**:
One running server and the computer it runs on, signed in as one User, who alone may reach it. It keeps the same id across restarts and has a name the User can change. A Machine's Projects and Sessions are its own; another Machine of the same User has others.
_Avoid_: connection, environment, server, host, device (auth-toolkit's word for how it signs in)

**Machine Key**:
The secret a Machine asks of anyone who connects to it. It is made once and never changes; whoever holds it can reach the Machine.
_Avoid_: token (that proves a Sign-in), password, API key

**Heartbeat**:
A Machine's regular report of how it stands, carrying two signals: that it is running, shown by when it last reported, and whether it could reach itself at its public address. A Machine that stops reporting is down; one that reports but cannot reach itself is up with its tunnel broken.
_Avoid_: poll, ping, health check (the route it calls, not the concept)

**Last Seen**:
When a Machine last sent a Heartbeat. The only way to tell a Machine that stopped from one that is running.
_Avoid_: last active, updated at, online
