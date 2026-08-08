# Run harnesses through a local-process sandbox without isolation

TanStack AI harness adapters only execute through a sandbox. Rather than
requiring Docker or OS-level confinement, runs use TanStack's official
`@tanstack/ai-sandbox-local-process` provider pointed at the Thread Working
Directory: harness CLIs spawn directly on the Machine with no isolation. The
server already runs on the user's own Machine against their own repositories,
so isolation adds setup cost without a trust boundary to protect; safety is
governed by the harness permission options carried in the Run configuration,
not by the sandbox. An isolating provider (e.g. Docker) can replace it later
without touching orchestrators.
