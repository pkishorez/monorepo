# All tabs run one version

When an update is accepted in one tab, the new version activates and every open tab reloads into it. Letting tabs run different builds side by side would force every piece of shared state (Precache, Runtime Cache, Worker RPC contracts, lazy chunks) to tolerate mixed versions; one version everywhere removes that whole class of bugs.

## Consequences

Version Skew can still happen for a moment during the switch-over, so Worker RPC keeps its build-ID handshake as a safety net rather than a normal path.

Other tabs reload unconditionally, even with unsaved work. That loss is accepted for now to keep the first version simple; a Reload Guard that lets a tab hold off activation is the planned improvement.
