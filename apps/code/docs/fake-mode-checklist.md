# Checklist: everything Code does, for fake mode

Every flow Code (`apps/code`) has in production, so that fake mode can be
proven whole ([the plan](fake-mode-plan.md), tasks 22 and 24). Read from
`src/app/` (its Actors' Messages and States, every `commands.ts`, the
Views), [README.md](../README.md), [CONTEXT.md](../CONTEXT.md),
[design.md](design.md), the code Plugin's contract
(`apps/connect/src/connection/plugins/code/api/contract/`) and Connect
Cloud's `AppApi` and `HeartbeatApi` (`apps/connect/src/contracts/`).

Each line: the flow; **reach**, how a person gets there; **needs**, the Fake
and the Control that make it possible, or "real middle" when the code in the
tab does it with no Control. The Fakes are those of the plan: Sign-in,
Computers (with Connect Cloud, as `@kestack/connect/browser` runs it),
File System (one per computer; git's state lives in it, so its Git
Controls are the File System's), Agent, Speech, Microphone and New build.
"Wide" is a screen with a keyboard and mouse; "touch" a phone, or the
browser's touch emulation. Flows that a browser can never show in fake
mode are under [Limits](#limits).

## 1. Sign-in and Accounts

- [x] App opens with nobody signed in: the mark, then the Sign-in Screen, "Continue with Google". **Reach:** open `/` after Start fresh. **Needs:** Sign-in, blank.
- [x] Sign in: "Continue with Google" asks who, and the app opens on the Account's home `/a/:accountId`. **Reach:** Sign-in Screen. **Needs:** Sign-in: sign in as (email, name).
- [x] Sign-in abandoned: the ask is answered with nobody, the screen stays, the button usable again (`SignInEnded`). **Reach:** Sign-in Screen, cancel the ask. **Needs:** Sign-in: sign in as → cancel.
- [x] Sign-in fails: the app says why (`SignInFailed` / `Refused`). **Reach:** Sign-in Screen. **Needs:** Sign-in: sign-in fails (with a reason).
- [x] Checking: with an Account kept on this device, the app draws it at once (`Checking { last }`) while the Auth Worker is asked; the header's avatar says it is checking. **Reach:** reload while signed in. **Needs:** Sign-in: Auth Worker slow / out of reach.
- [x] Auth Worker out of reach: the app stays on the kept Account, works from what this device holds, and nothing is pruned. **Reach:** reload. **Needs:** Sign-in: Auth Worker out of reach, then back.
- [x] `/` and an old address (`/settings`, `/m/…/p/…`) go to the same page under the Account active. **Reach:** type the address. **Needs:** Sign-in: signed in; real middle.
- [x] A guess corrected: placed under the kept Account while checking, the page moves quietly once the Auth Worker answers another. **Reach:** reload `/` while the kept Account was signed out elsewhere. **Needs:** Sign-in: Auth Worker slow, then answers another Account.
- [x] 404: an address that names no page says "Nothing lives at this address" with Go home, signed in or not. **Reach:** `/nope`, `/a/<id>/nope`. **Needs:** real middle.
- [x] Account Switcher (wide: header avatar menu; touch: sidebar foot, You, then Accounts): the Active Account checked, others to switch to, Add, Sign out, Sign out of all. **Reach:** header avatar. **Needs:** Sign-in: two Accounts signed in.
- [x] Add an Account from the switcher: signs in, comes back to `/`, placed under the new one. **Reach:** Account Switcher → Add. **Needs:** Sign-in: sign in as.
- [x] Switch Account here: the app goes to the new Account's home; the old Account's sockets close, the new one's Connections open. **Reach:** Account Switcher → another Account. **Needs:** Sign-in: two Accounts; Computers: a computer each.
- [x] The browser full: the switcher says it holds the most Accounts it can, and to sign one out. **Reach:** Account Switcher. **Needs:** Sign-in: sign in as, up to the maximum.
- [x] Sign out of the Active Account here: the page becomes Away, "<email> is signed out". **Reach:** Account Switcher → Sign out. **Needs:** Sign-in.
- [x] Sign out of all: the Sign-in Screen alone; every Account's databases go. **Reach:** Account Switcher → Sign out of all. **Needs:** Sign-in.
- [x] Away, signed out elsewhere: "<email> is signed out", the Accounts here to choose. **Reach:** any page. **Needs:** Sign-in: sign out from another tab.
- [x] Away, switched elsewhere: "You switched to <other> elsewhere"; choosing this page's Account switches and stays. **Reach:** any page. **Needs:** Sign-in: switch from another tab.
- [x] Away, another Account added elsewhere: the page says it was switched. **Reach:** any page. **Needs:** Sign-in: add an Account from another tab.
- [x] Away, a link for another Account signed in here: "This link is for <email>"; choosing it switches and stays. **Reach:** open `/a/<other id>/…`. **Needs:** Sign-in: two Accounts.
- [x] Away, a link for an Account not signed in here: says so; signing in comes back to the page. **Reach:** open `/a/<unknown id>`. **Needs:** Sign-in: sign in as.
- [x] Choosing another Account on the Away screen switches and goes to its home. **Reach:** Away screen. **Needs:** Sign-in: two Accounts.
- [x] Prune: once the Auth Worker answers, every Account no longer signed in on this device goes, with its databases; a failed check deletes nothing. **Reach:** reload after signing out elsewhere. **Needs:** Sign-in: sign out from another tab; real middle.
- [x] No socket open while Away; all reopen once Active again. **Reach:** become Away, then choose the Account. **Needs:** Sign-in; Computers: one online, its `sockets` in the bubble.

## 2. Connections (computers)

### The list

- [x] No Connection: home says how to start one, `npx @kestack/connect serve`. **Reach:** home. **Needs:** Computers, blank.
- [ ] A computer comes online: it shows up beside the others, in the sidebar and home, without a reload (Recheck while one is on its way). **Reach:** home. **Needs:** Computers: add a computer, online. _(Task 17: with no Connection listed yet, Code asks Connect Cloud nothing more by itself, as in production, so a first computer shows on Look again, Reload, or the tab back after 15 s; with one listed and linked, likewise.)_
- [ ] Two or more computers: the sidebar names each Connection, home lists every Project with its Connection's name. **Reach:** sidebar, home. **Needs:** Computers: add two computers.
- [ ] Kept list: the app opens with the Connection List this device last had, while Connect Cloud is asked behind. **Reach:** reload. **Needs:** Computers: Connect Cloud out of reach.
- [ ] Connect Cloud out of reach with no list kept: home says "Can't reach Connect Cloud", the problem, and a way to ask again. **Reach:** home after Start fresh. **Needs:** Computers: Connect Cloud out of reach, then back.
- [x] Reload: the sidebar's Reload turns once and asks the list and every Setup again. **Reach:** sidebar header Reload; Settings → Connections Reload. **Needs:** Computers.
- [ ] Pull to Reload on touch. **Reach:** pull the sidebar down from its top. **Needs:** Computers; touch.
- [ ] Recheck pace: every 3 s while one is on its way, every 10 s while one is stuck or down, none once all are linked. **Reach:** watch the Connect Cloud calls in the bubble's log. **Needs:** Computers: tunnel states, offline.
- [ ] The page back after 15 s or more hidden asks the list at once. **Reach:** hide the tab, come back. **Needs:** Computers; real middle.
- [ ] Prune on Connect Cloud's first answer: a Connection it no longer lists goes, with its databases and Saved Drafts. **Reach:** reload after the computer is forgotten elsewhere. **Needs:** Computers: forget a computer (as from another device).
- [ ] A computer that forgets itself (its `ke-connect` removed) leaves the list. **Reach:** sidebar, Settings. **Needs:** Computers: forgets itself.

### How a Connection stands

- [x] Linking: "Connecting…" while the socket is on its way, or while the kept Last Seen is not yet believed. **Reach:** header pill, sidebar, Settings card. **Needs:** Computers: online.
- [x] Linked: green dot; calls and syncs go. **Reach:** sidebar Connection name, Settings card. **Needs:** Computers: online.
- [ ] Setting up, cloudflared downloading with size and time; Opening its tunnel; Tunnel failed, retrying. **Reach:** header pill and its title, Connections Drawer, Settings card. **Needs:** Computers: tunnel state (Downloading with progress, Opening, Failed).
- [ ] Ready but Unchecked or Reachable while the socket links: "Connecting…". **Reach:** header pill. **Needs:** Computers: tunnel state (Unchecked, Reachable).
- [ ] Unreachable: "Out of reach", tunnel broken with its problem; Recheck every 10 s. **Reach:** header pill, Settings card. **Needs:** Computers: tunnel state (Unreachable, with a problem).
- [x] Down: no report for three Heartbeats (45 s): "Connection down", last seen; what it synced stays readable, quieter, no + in the sidebar, moved last. **Reach:** sidebar, header, any of its pages. **Needs:** Computers: offline (and last seen pushed back, to be Down at once).
- [x] Back online: the Link relinks, the Replicas resume, the order and dot come back. **Reach:** sidebar. **Needs:** Computers: offline, then online.
- [ ] Settings locked: a Link on its way for a while puts a lock on its card; agent rows and the Speech switch take nothing. **Reach:** Settings → Connections. **Needs:** Computers: offline or tunnel not up.
- [x] Expired key: a Connection Key rotated closes the socket (`KEY_EXPIRED`); the list is asked at once and the next socket offers the new key. **Reach:** any page; watch the Link relink. **Needs:** Computers: key rotates.
- [ ] Tunnel moves: the computer comes back at a new address and the socket is dialled there. **Reach:** any page. **Needs:** Computers: tunnel moves to a new address.
- [x] Outdated: a `ke-connect` older than the Minimum Connect is never dialled; header pill "Update ke-connect", Settings shows the line and `npm i -g @kestack/connect@latest` with Copy; it is dialled once a list says it was updated. **Reach:** header pill → Settings. **Needs:** Computers: `ke-connect` version, Connect Cloud's Minimum Connect; then update it.
- [x] Copy the update command: the button says Copied. **Reach:** Settings card of an Outdated Connection. **Needs:** Computers: Outdated.
- [x] Mismatched, Updating: the computer runs another Release and Connect Cloud wants this Code's (`Latest`): pill "Updating Connect…", relinks at once, linked once it runs this Code's Release. **Reach:** header pill, Settings card. **Needs:** Computers: runs another Release; Connect Cloud's wanted Release = this Code's.
- [ ] Mismatched, Connect Cloud behind (`Unknown`): pill "Updating Connect…", relinks every 30 s. **Reach:** header pill. **Needs:** Computers: runs another Release; Connect Cloud's wanted Release unknown to it.
- [ ] Mismatched, Code Stale (`Older`): pill "Updating Code…", the Link waits for good, and Code moves to its newest build, once. **Reach:** header pill, then the reload. **Needs:** Computers: runs another Release; Connect Cloud's wanted Release another; New build: newest build.
- [ ] Mismatched while Connect Cloud is out of reach: decides nothing, relinks slowly. **Reach:** header pill. **Needs:** Computers: runs another Release, Connect Cloud out of reach.
- [ ] Restart: a computer's code Plugin restarts; the Link relinks, the running Turn ends interrupted, the next start Resumes it. **Reach:** a running Session. **Needs:** Computers: restart.

### Settings → Connections

- [x] One card per Connection, as the sidebar says it: name, dot, Link and Last Seen; on wide, its tunnel and Connect version. **Reach:** Settings → Connections. **Needs:** Computers: one or more computers.
- [x] Rename: pencil, type, Enter; the name changes everywhere at once and is kept; works while out of reach. **Reach:** Settings card. **Needs:** Computers (Connect Cloud's `Rename`).
- [ ] Rename to empty goes back to the Computer Name; Escape leaves without saving. **Reach:** Settings card. **Needs:** Computers.
- [x] Rename refused: says why, keeps what was typed. **Reach:** Settings card. **Needs:** Computers: Connect Cloud out of reach.
- [ ] Two of one Display Name are told apart by the Computer Name under it. **Reach:** Settings. **Needs:** Computers: two computers, one renamed as the other.
- [ ] A Computer Name `<host> (<name>)` is shown as its short name everywhere. **Reach:** sidebar. **Needs:** Computers: add a computer named so.
- [x] Forget: the bin asks first, saying when it was last seen and how its tunnel stands; confirmed, Connect Cloud forgets it, it leaves the list, its database goes; the computer's next Heartbeat is told it was forgotten. **Reach:** Settings card bin. **Needs:** Computers: add a computer (the Fake must stop it on `ConnectionForgotten`).
- [x] Forget dismissed: nothing changes. **Reach:** Settings card bin → Cancel. **Needs:** Computers.
- [ ] Forget refused: says why. **Reach:** Settings card bin. **Needs:** Computers: Connect Cloud out of reach.

## 3. Project Picker and folders

- [x] Open the Project Picker: `o` (Vim), Ctrl+P anywhere; wide: "Open project" atop the sidebar, centred by keys, beside its button by mouse; touch: the sidebar foot's New project, a tall Drawer. **Reach:** those. **Needs:** Computers: one online.
- [ ] Connection Step: shown only while the Connection Filter shows every Connection and there are two or more; skipped otherwise. **Reach:** Project Picker. **Needs:** Computers: two computers.
- [ ] Recent Projects, most recently active first, followed live while open. **Reach:** Project Picker. **Needs:** File System: add sample project; Computers.
- [ ] A Project whose folder is missing shows so and cannot be chosen. **Reach:** Project Picker. **Needs:** File System: remove (or move) a Project's folder.
- [ ] Pick a Project: its new Session's page opens, keyboard in the Draft. **Reach:** Project Picker. **Needs:** File System: a Project.
- [x] "Open folder…": the folder Steps from home; text that names no Project, then Enter, searches home for it. **Reach:** Project Picker. **Needs:** File System: add folder.
- [ ] Go into a folder (Enter, Ctrl+L, a row's arrow) and back out (Ctrl+H, Backspace, Back). **Reach:** folder Step. **Needs:** File System: nested folders.
- [ ] Type a path (`~/code/fo`): goes to its folder and searches for what follows the last `/`. **Reach:** folder Step. **Needs:** File System: nested folders.
- [x] Hidden folders listed only for a search starting with `.`. **Reach:** folder Step. **Needs:** File System: add a folder named `.something`.
- [ ] A folder of more than 100 folders is listed cut short, then asked again with the search. **Reach:** folder Step, type. **Needs:** File System: add many folders (over 100).
- [ ] A symlink to a folder inside home is listed and goes in. **Reach:** folder Step. **Needs:** File System: add a symlink inside home.
- [x] Choose a folder (Mod+Enter on the row; "Open this folder" on touch): it becomes a Project while the Picker waits, then opens. **Reach:** folder Step. **Needs:** File System: add folder.
- [ ] Choose a folder already a Project, or a symlink to one: opens that Project, no second one. **Reach:** folder Step. **Needs:** File System: a Project and a symlink to it.
- [x] Create a folder: a search naming no folder offers to create it there (touch: New folder, then goes in); made, it becomes a Project. **Reach:** folder Step. **Needs:** File System (the fake makes it).
- [ ] Create refused: a name taken ("Something is already at"), a bad name ("cannot be a folder's name"). **Reach:** folder Step. **Needs:** File System: a folder of that name; real middle for the name rules.
- [ ] Folder errors said in the Step: no folder at a typed path; not allowed to open (unreadable); outside home (`/etc`, `..`, a symlink out of home); could not read (I/O error or slow). **Reach:** folder Step. **Needs:** File System: make a folder unreadable; add a symlink pointing outside home; make a folder fail to list.
- [ ] Remove a Project: only on its own page; asks first; it goes from the sidebar, home and Picker, with its Saved Draft; its folder untouched. **Reach:** a Project's page whose folder is missing → Remove. **Needs:** File System: remove a Project's folder.
- [ ] Missing folder, back again: the Project is choosable again and its page starts Sessions. **Reach:** Project Picker. **Needs:** File System: put the folder back.
- [ ] Project Picker on an out-of-reach Connection: its Projects as kept; folder Steps wait or say why. **Reach:** Project Picker. **Needs:** Computers: offline.

## 4. Projects and branches (a new Session's page)

- [ ] Home lists every Connection's Projects by name, with path and Connection; "Open a folder to start a project" while there are none. **Reach:** home. **Needs:** File System: projects; Computers.
- [x] A Project's page `…/m/:connectionId/p/:projectId`: name and folder, the Draft for a new Session. **Reach:** Picker, home, sidebar heading or its +. **Needs:** File System: a Project.
- [ ] A Project of a Connection no longer listed says so in place of the page. **Reach:** an old link. **Needs:** Computers: forget a computer.
- [ ] A Project's page while its Connection is out of reach: shows what is kept; sends wait. **Reach:** Project page. **Needs:** Computers: offline.
- [x] Not a git repository: one line says so, no Branch row or New Worktree. **Reach:** Project page. **Needs:** File System: add folder (plain).
- [ ] git missing on the computer: same as not a git repository. **Reach:** Project page. **Needs:** File System: git missing.
- [x] Branch row: the branch in full, the Origin branch it tracks; New Worktree switch, off by default, with a line on what send will do. **Reach:** Project page of a git Project. **Needs:** File System: add sample project.
- [x] Branch Picker: Local and Origin sections; a tracked Origin branch is not listed twice; a branch checked out in another Worktree says where; the current one checked. **Reach:** Branch row; `shift+b` (Vim); touch, a Sheet. **Needs:** Git: local branches, Origin branches, a Worktree.
- [ ] Each Branch Picker open fetches Origin behind; the next open lists what Origin has. **Reach:** open it twice. **Needs:** Git: add an Origin branch.
- [ ] Branches not read while the link is down are read once it is back; the picks stand as saved meanwhile. **Reach:** Project page. **Needs:** Computers: offline, then online.
- [x] Start on a local branch, New Worktree off: the main Worktree switches to it (step "switching branch"). **Reach:** pick a branch, send. **Needs:** Git; Agent.
- [x] Start on an Origin branch: checked out locally first, tracking it. **Reach:** pick under Origin, send. **Needs:** Git: an Origin branch.
- [x] Start with New Worktree on: a Worktree made on `ke-code/<id>`, renamed `ke-code/<slug>` once the first Title is written; a name taken gets `-2`; the sidebar shows the Worktree mark and branch without `ke-code/`. **Reach:** switch on, send. **Needs:** Git; Agent: a Title.
- [ ] A Worktree branch pushed before its Title keeps its id name. **Reach:** as above. **Needs:** Git: push a branch.
- [ ] Starting: each step (switching branch, making Worktree, starting agent) shown running then done where the transcript will be; then the Session's page. **Reach:** send a new Session's Draft. **Needs:** Agent; Git.
- [ ] A git step fails: no Session, no Worktree, the Draft back as it was and the failure said. **Reach:** send. **Needs:** Git: make the next git step fail.
- [ ] The agent fails to open: no Session, the Draft back, why said. **Reach:** send. **Needs:** Agent: fails to open.
- [ ] Start refused for an agent account no longer there ("That agent account is no longer on this Connection"). **Reach:** pick an added account, remove it in Settings, send. **Needs:** Agent: accounts.
- [ ] Start answer lost (link drops mid-start): the app moves once the Session shows among the Connection's sessions; never there, the Draft says why and keeps the text. **Reach:** send, then drop the link. **Needs:** Computers: offline during a start (or restart).
- [ ] The branch a Project's folder is on changes outside Code: the sidebar heading and Branch row follow (the Folder Check). **Reach:** sidebar heading. **Needs:** Git: switch a repo's branch outside Code.

## 5. Sessions and turns

### The Draft

- [x] Type and send (wide, Vim off: Enter or the send button): a Turn starts; the Draft empties. **Reach:** a Session's page. **Needs:** Agent: a Script.
- [ ] Send while a Turn runs: steers it, the bubble says it was sent while the agent worked. **Reach:** a running Session. **Needs:** Agent: a long Script.
- [ ] Send refused: text and files come back into the Draft. **Reach:** a Session. **Needs:** Computers: restart or forget, so the call fails (or the Session gone).
- [ ] Saved Draft: text, cursor, selection, mode, files and picks come back after leaving and coming back, and after a reload; a new Session's goes once it starts. **Reach:** type, go elsewhere, return. **Needs:** real middle.
- [ ] Model Picker: agent, model, then each setting (effort, permissions); Mod+Enter finishes; `m`, `p`, `e` open it at model, permissions, effort; a started Session keeps its agent. **Reach:** Status Line triggers. **Needs:** Agent: harnesses, models from the real catalog, settings.
- [ ] Model or settings changed mid-session hold from the next Turn. **Reach:** model Picker in a Session, send. **Needs:** Agent.
- [ ] Two Claude logins: an added account named beside the logo ("Work · Opus 5.5"); the Default Account not named. **Reach:** model Picker, Status Line, header. **Needs:** Agent: accounts.
- [ ] Agent not installed: shown, unpickable, with why; a new Session's Draft says so with a link to Settings → Connections. **Reach:** model Picker. **Needs:** Agent: not installed (with a reason).
- [ ] Models the login cannot be asked for: the models.dev list its harness accepts. **Reach:** model Picker. **Needs:** Agent: not signed in / login cannot be asked.
- [ ] Models refused: "Could not load the models", what showed kept; Retry. **Reach:** model Picker. **Needs:** Agent: models fail.
- [ ] Skills Picker: a `/name` put in at the cursor as one atom; Skills per Project and account. **Reach:** Status Line Skills, `/` (Vim). **Needs:** Agent: Skills in a folder.
- [ ] Skills fail to load: the Picker says why; Retry. **Reach:** Skills Picker. **Needs:** Agent: Skills fail.
- [ ] Undo the last thing put in the Draft. **Reach:** `u` (Vim). **Needs:** real middle.
- [ ] Vim Mode: the Draft read-only until `i`; Escape leaves the Composer. **Reach:** Mod+Alt+V. **Needs:** real middle.

### Attachments

- [x] Paste a file or image anywhere on the page; drop a file; the paperclip picks one: each a chip under the Draft. **Reach:** Draft. **Needs:** real middle (the browser's files).
- [ ] An image over 5 MB or another file over 50 MB is left out with a line saying why. **Reach:** Draft. **Needs:** real middle.
- [ ] Remove a chip. **Reach:** chip's ×. **Needs:** real middle.
- [x] Sent: images go to the agent; another file is saved on the computer and its path given; the bubble shows the files. **Reach:** send with files. **Needs:** File System (the saved file); Agent.

### Words and work in the transcript

- [x] Words stream in, a few sentences at a time; Markdown, code, links. **Reach:** a running Turn. **Needs:** Agent: a Script with text.
- [x] Reasoning shown folded, opened on a click. **Reach:** transcript. **Needs:** Agent: a Script with reasoning.
- [x] Work line: while it runs, what the agent does now; done, the count by tool kind, failed and stopped steps; opened, every step, its head sticking. **Reach:** transcript. **Needs:** Agent: a Script with tools.
- [ ] Each tool kind drawn and opened with its output: read, write, edit (a diff), delete, bash, search, web, todo (a checklist), question, mcp, other. **Reach:** transcript, open each step. **Needs:** Agent: a Script per tool kind.
- [ ] A tool's output cut short shows its start until asked for all. **Reach:** a long output. **Needs:** Agent: a Script with long (truncated) output.
- [x] A tool that failed shows why, in red. **Reach:** transcript. **Needs:** Agent: a Script with an error result.
- [ ] Images a tool gave back: thumbnails, "+3", opened whole in the image viewer, moved through. **Reach:** a read of an image, a screenshot. **Needs:** Agent: a Script with images.
- [ ] A tool call with no result once its Turn ended reads as stopped. **Reach:** a cancelled Turn. **Needs:** Agent: hang, then stop.
- [ ] Claude's plan (todo) and Codex's plan (`codex.plan`) as checklists. **Reach:** transcript. **Needs:** Agent: Scripts for each.
- [ ] Claude's compaction row; an `other` part as one plain row; an `error` part. **Reach:** transcript. **Needs:** Agent: Scripts with each.
- [ ] Long bubbles fold with Show more; Copy on a bubble and an answer. **Reach:** transcript. **Needs:** Agent; real middle.
- [ ] Following the bottom while words stream; scrolling up stops following; `shift+g` follows again; `g g` to the top. **Reach:** transcript. **Needs:** Agent: a long Script.
- [ ] A long Session: earlier Turns drawn as scrolled to. **Reach:** transcript. **Needs:** Agent: many Turns (a Script played many times).

### Turn endings and status

- [x] Done: the footer's time; status word in the sidebar ("how long ago"). **Reach:** transcript, sidebar. **Needs:** Agent: a Script ending done.
- [x] Failed: red mark, why above the footer; sidebar says failed. **Reach:** transcript. **Needs:** Agent: a Script ending failed.
- [x] Not signed in: the Turn fails with the harness's login error. **Reach:** send. **Needs:** Agent: not signed in.
- [ ] An added account removed: its Sessions fail their next Turn. **Reach:** Settings → remove, then send. **Needs:** Agent: accounts.
- [x] Stopped by you: Stop (Status Line, `mod+.`, Actions, the Question Panel's head), square mark, "stopped". **Reach:** a running Turn. **Needs:** Agent: a long or hanging Script.
- [ ] Stop refused: says why. **Reach:** Stop. **Needs:** Computers: offline (the call waits) — a refusal needs the Session gone.
- [x] Interrupted (cut off): amber mark; the Turn after says what the restart stopped (the Turn, subagents, commands). **Reach:** restart a computer during a Turn. **Needs:** Computers: restart. _(Task 20: walked by a reload mid-Turn, which restarts every computer in the tab; a Restart Control mid-Turn not yet.)_
- [x] Resumed Turn: after a restart, Connect continues a cut-off Turn; a quiet rule says so in place of the prompt. **Reach:** as above. **Needs:** Computers: restart; Agent: a Script for the resume. _(Task 20: "Resumed after Connect restarted", after a reload.)_
- [x] An Agent-started Turn (no words of yours): a rule says why it carried on. **Reach:** transcript. **Needs:** Agent: starts a Turn on its own (as when a background job ends).
- [ ] Usage: tokens and cost per Turn (cost only where the agent says; none for Codex). **Reach:** footer → details. **Needs:** Agent: usage in Scripts.

### Subagents

- [x] A subagent: two lines, what it was asked and where it stands; running, done (steps), stopped, failed. **Reach:** transcript. **Needs:** Agent: a Script with a subagent.
- [x] Open a subagent: wide, a dialog showing the deepest with a way back; touch, a Drawer over the one before. **Reach:** tap the subagent. **Needs:** Agent: nested subagents.
- [x] Nested subagents. **Reach:** inside a subagent. **Needs:** Agent: a Script with a subagent's subagent.
- [ ] A Codex subagent's prompt and report (Codex sends both). **Reach:** transcript. **Needs:** Agent: a Codex Script with a subagent.

### Background Jobs

- [x] A background command (shell): the Session shows working while only its jobs run; the Running button counts it. **Reach:** transcript, sidebar status. **Needs:** Agent: a Script with a background shell job.
- [x] A background subagent; ended, its report is its last words. **Reach:** transcript. **Needs:** Agent: a Script with a background subagent.
- [ ] A subagent resumed by SendMessage runs again under that call, in the same row. **Reach:** transcript. **Needs:** Agent: a Claude Script with SendMessage.
- [x] Running Picker: `r`, the floating button (in place), touch a Drawer; lists running subagents (nested one step in) and commands; choosing opens; the last row stops all. **Reach:** a Session with running work. **Needs:** Agent: jobs.
- [x] A background command open over the page: its output live, as a terminal shows it (ANSI colours); how long it ran, who started it; Stop; stays as it ended until closed. **Reach:** Running Picker → a command. **Needs:** Agent: a job writing output.
- [ ] Stop one job; stop all. **Reach:** command dialog Stop; Running Picker's last row. **Needs:** Agent: jobs.
- [ ] Stop of a job refused (HarnessFailed). **Reach:** command dialog Stop. **Needs:** Agent: stop fails.
- [x] A job ends done, failed or stopped (`jobEnded`). **Reach:** transcript. **Needs:** Agent: a job ending each way.
- [ ] Jobs cut off by a restart are named in the next Turn. **Reach:** restart while a job runs, then send. **Needs:** Computers: restart; Agent: a job.
- [ ] A message sent after the agent stopped with work still running says what was stopped. **Reach:** stop, then send. **Needs:** Agent: jobs.

### Agent Questions (Question Panel)

- [x] The agent asks: the Question Panel takes the Draft's place, expanded over the dimmed transcript; "Question" pill in the sidebar. **Reach:** a running Turn. **Needs:** Agent: a Script with a question (Claude's AskUserQuestion; Codex's request_user_input).
- [ ] One choice (round), several (square), "Other" edited as one's own answer, a secret hidden as typed. **Reach:** Question Panel. **Needs:** Agent: questions of each kind.
- [x] Several Items, one a step; Next, Back, Send on the last; Send with an Item left goes to it and marks it. **Reach:** Question Panel. **Needs:** Agent: a question of several Items.
- [ ] Keys: `j`/`k`, arrows, Tab, 1–9, Space/`x`, `i` to type, Enter, Mod+Enter, `q` then `q` to skip, `m`/Escape to minimise, Ctrl+Y. **Reach:** Question Panel. **Needs:** Agent: a question.
- [ ] Minimise to a bar ("Claude asks · 1 of 2 answered" with Stop, Skip, Open); expand again. **Reach:** Question Panel. **Needs:** Agent: a question.
- [ ] Leave the Session or page and come back: answers so far, minimised or not, as left. **Reach:** sidebar to another Session, back. **Needs:** Agent: a question.
- [x] Answer: the Turn carries on, the answer shown in the transcript (a secret as `(hidden)`). **Reach:** Send. **Needs:** Agent: a Script that reads the answer.
- [ ] Skip ("Skip question", asked again): the agent carries on without an answer. **Reach:** Question Panel. **Needs:** Agent.
- [ ] Answered on another device, or its Turn ended: the panel goes, the Draft comes back as it was; a send then is "no longer asked". **Reach:** Question Panel open. **Needs:** Agent: question answered elsewhere; Agent: Turn ends while asking.
- [ ] Answer refused: says why, kept as it was. **Reach:** Send. **Needs:** Agent: answer fails.
- [ ] Dictate one's own answer (not a secret's). **Reach:** Space on "Other". **Needs:** Microphone; Speech.
- [ ] Touch: a sheet from the column's foot, swipe down minimises. **Reach:** touch. **Needs:** Agent: a question.

### Btw

- [ ] Btw mode: the toggle, Ctrl+Q, `q` (Vim); the Draft turns blue with its `btw` mark; send says Ask. **Reach:** a Session's Draft. **Needs:** real middle.
- [ ] Ask: the Btw Drawer expands, being answered, then answered with Copy; the Session untouched. **Reach:** Btw mode, Ask. **Needs:** Agent: a Btw answer.
- [ ] Btw fails: said in the drawer. **Reach:** Ask. **Needs:** Agent: Btw fails.
- [ ] Minimise, open again, close; a new Btw replaces the last. **Reach:** Btw Drawer. **Needs:** Agent.
- [ ] Touch: a sheet, swipe down its head minimises. **Reach:** touch. **Needs:** Agent.

### Forks, titles, details

- [ ] Fork from the latest Turn (Actions): a new Session, the app moves to it; the Fork shows its original's history first; a fork glyph in the sidebar. **Reach:** Actions → Fork. **Needs:** Agent.
- [ ] Fork after a given Turn, from its details. **Reach:** a Turn's footer → details → Fork. **Needs:** Agent.
- [ ] A Fork of a Fork reads its history up the chain. **Reach:** fork twice. **Needs:** Agent.
- [ ] Go to the original, for a Fork. **Reach:** Actions. **Needs:** Agent.
- [ ] Fork refused ("It cannot be forked there"). **Reach:** fork a Turn not finished. **Needs:** Agent: a running Turn (the real middle refuses).
- [ ] Title written after the first Turn; "Untitled session" until then. **Reach:** sidebar, header. **Needs:** Agent: a Title.
- [ ] Regenerate the title: Actions closes, the header's title pulses until the new one; refused, a toast. **Reach:** Actions → Regenerate. **Needs:** Agent: a Title; Agent: title fails.
- [ ] Session details (Ctrl+G, Actions, a Turn's footer, the context ring): Context, Cost, Turns, Tokens; a Turn bar shows it in the transcript. **Reach:** those. **Needs:** Agent: usage, context usage and plan limits.
- [ ] Context ring by Send: grey, amber, red; "124K / 200K"; when it shows is a Preference. **Reach:** Draft. **Needs:** Agent: context usage.
- [ ] No context while the agent is not open to ask. **Reach:** a Session after a restart. **Needs:** Computers: restart.
- [ ] Unseen: a Session whose Turn ended since last opened here is bold; opening clears it. **Reach:** sidebar. **Needs:** Agent: a Turn ending while elsewhere.
- [ ] A Session started on another device appears in the sidebar live. **Reach:** sidebar. **Needs:** Computers: another device acts (start a Session).

## 6. Pickers and commands

- [ ] Every Picker drawn as opened: by keys a fuzzy list in the middle; by mouse beside its button; by touch a Drawer, tall Drawer or Sheet; the screen dims; swipe down or tap away closes. **Reach:** each Picker. **Needs:** real middle; touch.
- [ ] Session Switcher: every Session, unsettled most recently active first, then the Settled quieter; Project and Connection named; the open one checked. **Reach:** `s` (Vim), Ctrl+J. **Needs:** Agent: Sessions.
- [ ] Actions: `a`, Ctrl+K, `?` (Vim), Ctrl+?, the header's button: the Session's (Settle/Un-settle, Fork, Go to original, Regenerate title, Session details, Stop while running), then every key Action with its keys in either Mode; on touch the Session's alone. **Reach:** a Session. **Needs:** Agent.
- [ ] Actions refusal said in the Picker, which stays. **Reach:** Fork in Actions. **Needs:** Agent: fork refused.
- [ ] A key Action chosen in Actions runs as its keys would, once the Picker closes. **Reach:** Actions. **Needs:** real middle.
- [ ] Keys anywhere: sidebar/page (`h`/`l`), previous/next Session (`[`/`]`), Back/Forward, new Session in this Project (`n`, Ctrl+N), show/hide the sidebar (`b`, Ctrl+B), Settings (Ctrl+,), theme (`t`), microphone (`d`), Dictation (Space, Ctrl+Space), each "even while typing" variant. **Reach:** keyboard. **Needs:** real middle (some need Agent: Sessions).
- [ ] Sidebar keys (Vim): `j`/`k`, `g g`, `shift+g`, Enter, back to the page. **Reach:** `h`. **Needs:** Agent: Sessions.
- [ ] Page keys (Vim): scroll `j`/`k`, Ctrl+D/U, a page, top/bottom. **Reach:** a Session. **Needs:** Agent: a long Session.
- [ ] Vim Mode's status line at the app's foot. **Reach:** Vim on. **Needs:** real middle.

## 7. Sidebar

- [ ] Projects with their Sessions, most recently active first; the heading's branch; `+` or the heading opens the new Session's page. **Reach:** sidebar. **Needs:** Agent: Sessions in two Projects.
- [x] A row: title, Unseen bold, fork glyph, Worktree mark and branch, status (mark, time ago, "Question" pill). **Reach:** sidebar. **Needs:** Agent; Git: a Worktree.
- [ ] A Session shows only once started; a new Session's page puts nothing there. **Reach:** sidebar. **Needs:** Agent.
- [ ] Connection Filter: the title opens the Connections Drawer (state, sessions and how many run, projects, notices, Computer Name, tunnel, Connect version), All Connections or one; kept per Account. **Reach:** sidebar header. **Needs:** Computers: two computers.
- [ ] A Connection no longer listed in the Filter shows every Connection. **Reach:** sidebar. **Needs:** Computers: forget the chosen one.
- [ ] Collapse a Connection's Projects (click, tap, Enter on its name): "(3 projects)", kept; `[`/`]` skip what is hidden. **Reach:** sidebar Connection name. **Needs:** Computers: two computers.
- [ ] Order by Connection, those out of reach last, moving as one goes down or comes back. **Reach:** sidebar. **Needs:** Computers: two computers, one offline.
- [ ] A Connection never synced here: listed saying how far it got (downloading cloudflared, opening its tunnel, linking). **Reach:** sidebar after Start fresh. **Needs:** Computers: tunnel state.
- [ ] Swipe a row to Settle (touch: left to right): "Settled" toast with Undo; Undo brings it back. **Reach:** sidebar row. **Needs:** Agent: a Session; touch.
- [ ] Settle and Un-settle from Actions. **Reach:** Actions. **Needs:** Agent.
- [ ] Settled List: "Settled" with how many opens it, most recently Settled first, Un-settle on each; empty, it says how to Settle. **Reach:** sidebar foot of the list. **Needs:** Agent.
- [ ] A Move shows at once and stays until synced; refused, it goes back and says why ("Not Settled", "Still Settled"). **Reach:** swipe. **Needs:** Computers: offline (a refusal needs the Session gone, see Limits).
- [ ] Sending to a Settled Session un-settles it. **Reach:** open from the Settled List, send. **Needs:** Agent.
- [ ] Width dragged on wide, kept. **Reach:** sidebar edge. **Needs:** real middle.
- [ ] Phone: the sidebar is the home page; its foot's You (who is signed in, theme, Settings) and New project. **Reach:** touch. **Needs:** real middle.
- [ ] Prefetch: a Session shown opens with its messages drawn at once, even offline. **Reach:** open a Session after its computer went offline. **Needs:** Agent; Computers: offline.

## 8. Settings

- [ ] Open Settings (key, avatar menu, phone's You), and back with the same key to where it was opened. **Reach:** those. **Needs:** real middle.
- [ ] Four tabs, General, Shortcuts, Connections, About; on touch a sideways swipe; a link may ask for a tab (the Draft's for an agent that cannot run asks for Connections). **Reach:** Settings. **Needs:** real middle; Agent: not installed.

### General

- [ ] Window (float over a backdrop on a wide screen), on and off, kept. **Reach:** General. **Needs:** real middle.
- [ ] Text Size: small, medium, large. **Reach:** General. **Needs:** real middle.
- [ ] Smart Input, Smart Displacement for the Touch Draft. **Reach:** General. **Needs:** real middle; touch to see them work.
- [ ] When the Draft shows the context. **Reach:** General. **Needs:** Agent: context usage.
- [ ] Keep Screen On; refused by the browser, asked again at the next tap. **Reach:** General. **Needs:** real middle (the browser's Wake Lock).
- [ ] A change in another tab shows here. **Reach:** two tabs. **Needs:** real middle (see Limits on two tabs).

### Shortcuts

- [ ] Every Action and its keys, searched. **Reach:** Shortcuts. **Needs:** real middle.
- [ ] Record a key for an Action; Escape or a click away stops. **Reach:** a row. **Needs:** real middle.
- [ ] A key another Action on the same Surface has: the row names it and offers Swap. **Reach:** record. **Needs:** real middle.
- [ ] A typing key for an Action that works while typing: the row says to hold Ctrl, Alt or Cmd. **Reach:** record. **Needs:** real middle.
- [ ] Reset one (with those that went with it), Reset all. **Reach:** Shortcuts. **Needs:** real middle.

### Connections

- [ ] (See [2. Settings → Connections](#settings--connections) for the card, Rename and Forget.)
- [x] Agents: each agent's Harness Accounts, Default first: name, the config folder it really runs with (marked when Connect's environment chose it), the version that runs, or why it does not run (how to install). **Reach:** a Connection's card. **Needs:** Agent: installed / not, accounts, environment config folder.
- [x] Open an account's card (one at a time); edit name, config folder, binary; hints say what empty means. **Reach:** a row. **Needs:** Agent.
- [x] Add another login (`+`): a new card, with how to sign in with its folder; Save makes it. **Reach:** agent's `+`. **Needs:** Agent; File System: the config folder.
- [ ] Save refused: binary missing or not runnable; config folder not a folder; no name. The card keeps what was typed. **Reach:** Save. **Needs:** Agent: which binary paths run; File System.
- [x] Remove an added account, asked again; the Default Account has no Remove. **Reach:** card. **Needs:** Agent.
- [ ] Accounts could not be asked: a line says so, Retry. **Reach:** card. **Needs:** Computers: offline before anything was kept.
- [x] Speech to Text switch: Off (what it does), on → Downloading with a bar, Ready (how to dictate), Failed (why, retry); off deletes the model; refused, why. **Reach:** a Connection's card. **Needs:** Speech: download progress, download fails. _(Task 17: on, Downloading, Failed and Try again, Ready walked; off not yet.)_
- [ ] Speech's and agents' rows show as kept, and take nothing, while the Link is not linked. **Reach:** card. **Needs:** Computers: offline.

### About

- [ ] Version: build date and commit, or "Development build". **Reach:** About. **Needs:** New build.
- [ ] Check for updates: "Up to date", or a new version ready, "Update now", which reloads every open page into it. **Reach:** About. **Needs:** New build: none newer / a newer build out.
- [ ] Update Prompt: a new version waiting shows its prompt; Reload takes it. **Reach:** any page. **Needs:** New build: a newer build out.
- [ ] Storage: how much this browser holds; Clear all data asks, then deletes every database, storage, cache and service worker, and reloads; the sign-in stays. **Reach:** About. **Needs:** real middle (in fake mode it also clears the Fakes' world; see the plan's Start fresh).

## 9. Voice, Dictation and Microphone

- [ ] Start a Dictation: Space (Vim) / Ctrl+Space, or a field's mic: Waiting while the Microphone opens, then Recording with a level meter. **Reach:** a Draft. **Needs:** Microphone: an input, permission allowed; Speech: Ready.
- [ ] First use asks for the microphone; allowed, it records. **Reach:** mic. **Needs:** Microphone: permission prompt → allow.
- [ ] Denied: says why, nothing records. **Reach:** mic. **Needs:** Microphone: permission denied.
- [ ] No microphone, or it fails to open: says why for a few seconds. **Reach:** mic. **Needs:** Microphone: no inputs / broken.
- [ ] Blocked (as iOS Safari does): a dialog asks to load the page again. **Reach:** mic. **Needs:** Microphone: blocked.
- [ ] Asked again while Waiting: it lets go. **Reach:** mic twice. **Needs:** Microphone: slow to open.
- [ ] Words as they are heard: in the field, or a peek where the field does not show them. **Reach:** record. **Needs:** Speech: heard as it goes.
- [ ] Stop (same keys, the Owner's mic, from anywhere): text goes in at the Owner's cursor, replacing a selection. **Reach:** stop. **Needs:** Speech: what a Take turns into.
- [ ] Carries on across pages, Pickers and Settings; its text waits for its Owner to be drawn again. **Reach:** start in a Session, go elsewhere, stop, go back. **Needs:** Speech.
- [ ] One at a time: another field's mic waits. **Reach:** a second field. **Needs:** Microphone.
- [ ] No Owner (Space in Settings): does not start, says why. **Reach:** Settings. **Needs:** real middle.
- [ ] Header cancel throws it away; nothing goes in, even once transcribing. **Reach:** header. **Needs:** Speech.
- [ ] Nothing heard: says so. **Reach:** stop. **Needs:** Speech: nothing heard.
- [ ] Transcription fails: the Owner offers Retry (a new Take from the same clip) or throw away. **Reach:** stop. **Needs:** Speech: transcription fails.
- [ ] Connection out of reach 30 s after stopping, or silent a minute (five while downloading): the Take fails, Retry offered. **Reach:** stop. **Needs:** Computers: offline; Speech: stops answering.
- [ ] Socket back mid-Take: the recording is sent again from the start. **Reach:** record, drop and restore the link. **Needs:** Computers: restart (the Take is lost there).
- [ ] Speech to Text off: a Dictation switches it on, the download shows ("only happens once"), the audio waits. **Reach:** record on a computer with Speech off. **Needs:** Speech: Off, download progress.
- [ ] Five minutes: it stops itself. **Reach:** record. **Needs:** Microphone (time; the bubble may skip it).
- [ ] Microphone Picker: system default first, the chosen one checked; plugged in or out shows at once; names need permission first. **Reach:** `d` (Vim), the mic's menu. **Needs:** Microphone: inputs, add/remove, permission.
- [ ] Choose another microphone while recording: the rest records from it, in one clip. **Reach:** Microphone Picker. **Needs:** Microphone: two inputs.
- [ ] The chosen one unplugged: the default records, and it says so. **Reach:** record. **Needs:** Microphone: remove an input.
- [ ] Touch Draft voice: tap to talk, Waiting, tap to take, Send to take and send, Cancel, retry; Text | Voice switch kept; voice unchoosable while no Connection can transcribe. **Reach:** touch. **Needs:** Microphone; Speech: Ready / Off.

## 10. Touch Draft

- [ ] The sheet at the foot: model chip, Text | Voice, a few lines read only, Skills and Quick actions, the talk bar, Send. **Reach:** touch, a Session. **Needs:** real middle; touch.
- [ ] Model chip Drawer: agent and model open the Picker in a Sheet; settings changed in place; context ring first. **Reach:** chip. **Needs:** Agent.
- [ ] Text: tapping the words makes it the Composer; Smart Input and Smart Displacement (caret, word swipe, select). **Reach:** touch. **Needs:** real middle.
- [ ] An open Session's collapses to one line; a new Session's never does. **Reach:** touch. **Needs:** real middle.
- [ ] Add (touch): the first row switches to Btw; attach files. **Reach:** touch. **Needs:** real middle.

## 11. Updates and new builds

- [ ] A newer build waiting: Update Prompt; About's Update now. **Reach:** any page. **Needs:** New build: a newer build out.
- [ ] Code Stale (an Entity or answer newer than it knows, or Connect Cloud says its Release is Older): it moves to its newest build once per load, every page reloads into it. **Reach:** automatic. **Needs:** Computers: runs another Release + wanted another; New build: newest build (must clear Stale after the reload, or it reloads again).
- [ ] Install offer, once. **Reach:** first visit. **Needs:** see Limits.

## 12. Offline, reconnect and reload

- [ ] Reload shows what this device last saw at once (Replicas in IndexedDB), then catches up. **Reach:** reload. **Needs:** real middle.
- [ ] Every Connection offline: everything synced readable, sends wait, Settings locked. **Reach:** any page. **Needs:** Computers: all offline.
- [ ] A call made while the socket is down waits and goes once it is back. **Reach:** send while offline, then online. **Needs:** Computers: offline, then online.
- [ ] A Turn running while its page is closed keeps going; reopened, it shows what came. **Reach:** leave and return. **Needs:** Agent: a long Script.
- [x] A reload in fake mode keeps the world; a reply running at reload ends interrupted. **Reach:** reload mid-Turn. **Needs:** every Fake's Snapshot; Computers. _(Task 20: walked, `reload` scenario.)_
- [x] Start fresh (bubble) deletes everything and starts blank. **Reach:** bubble. **Needs:** Fake World. _(Task 20: walked, `start-fresh` scenario; the page's address is kept.)_

## 13. Everything else

- [ ] First draw: the mark until the sidebar, header and page are read from this device, then the frame whole in one step. **Reach:** reload. **Needs:** real middle.
- [ ] Theme: light, dark, system (`t`, the phone's You). **Reach:** those. **Needs:** real middle.
- [ ] Back and Forward between pages. **Reach:** keys, the browser's. **Needs:** real middle.
- [x] Kabuki DevTools: History, Seek, Fork on Code's Runtime. **Reach:** DevTools. **Needs:** Fake World (plan task 21). _(Task 21: walked, `devtools` scenario: the dock's Inspector, Seek and Go to Head, Fork and its new Branch, a card's Model, the Blueprint; the DevTools Server's Kabuki Session checked by hand.)_
- [ ] Development samples of Agent Questions (`?question=single`, `mixed`, `secret`, `long`). **Reach:** a Session's address. **Needs:** real middle (superseded by Agent: a question).

## Limits

What a browser cannot do in fake mode, or what fake mode cannot reach as
planned:

- **Two tabs.** Each tab would run its own middle (Connect Cloud, a code
  Plugin per computer, the Fakes) over the same IndexedDB, two Engines on
  one store. Cross-tab flows (Preferences, Unseen marks and Accounts changed
  in another tab; a Saved Draft's last save wins) are shown with one tab and
  the Sign-in Controls "from another tab", unless a later task makes one tab
  the middle's owner.
- **Another device.** Answering a question, settling or starting a Session
  from another device needs a Control that calls the in-tab code Plugin as
  another client (Computers: another device acts); without it, these are
  limits.
- **Install the app, and its offline App Shell.** The browser's own install
  offer and the service worker are not in a dev build; the New build Fake
  stands in for the update flow only.
- **Version gaps inside one Release.** A call one side cannot read
  (`VersionGap`: "Needs a newer Connect" or "Updating Code…"), an Entity
  newer than Code knows, a Shelf kept at another version: they need two
  builds of the code. A Mismatched Release is covered by Computers; these
  are not.
- **Refusals the real middle never gives a live Session.** A Move, a Stop or
  a send refused with `SessionNotFound`: no Session goes away in production,
  so only a Session removed by hand (or a forgotten computer) shows them.
- **Keep Screen On, touch gestures, files and the clipboard** are the
  browser's own and run for real; touch needs the browser's emulation or a
  phone on the tunnel.
- **A Plugin stopped, with its last lines to copy.** The README and the
  header's comments speak of it, but Connection v3 dropped each Plugin's
  state, so Code no longer gets it: there is no such flow today.
