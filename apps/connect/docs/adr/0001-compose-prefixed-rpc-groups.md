Moved from toolkits/ai-toolkit/docs/adr/0004

# The API is one RpcGroup merged from groups by area

Status: accepted.

`CodeApi` is one Effect RpcGroup merged from six, each in its own file under `src/machine/code/api/contract/`: `harnesses` (what each Coding Harness offers, and its Harness Binary), `projects`, `sessions` (started, forked, Settled, asked, and how they stand), `turns` (messages sent and the Messages they emit), `jobs` (Background Jobs) and `folders` (the home folder's sub-folders, listed and made). Procedures keep plain verb-first names (`listFolder`, `settleSession`), unique across the groups, so the client stays one flat object (`api.listFolder`) and one handler Layer serves them all.

## Considered options

- **One RpcGroup in one file.** Rejected: at two dozen procedures the contract is hard to read, and every change touches the same file.
- **Separate RpcGroups served and joined apart.** Rejected: an app would hold one client per group over one WebSocket, and a handler Layer per group buys nothing while the Engine serves them all.
- **Prefixed or dotted names (`claudeStart`, `folders.list`).** Rejected: a dotted tag makes Effect's client use bracket access, and a prefix repeats the group. This ADR first chose camel-cased harness prefixes (`claudeStart`, `codexRespond`) for harness-specific procedures; those went when every harness came to share one set of commands.

## Consequences

- A procedure name is unique across all six groups; the merge would let a later one replace an earlier one.
- Adding a group is a file and one line in `contract.ts`; clients see its procedures beside the rest.
