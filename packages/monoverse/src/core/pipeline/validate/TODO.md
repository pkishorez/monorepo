# Validation Rules TODO

## Rules to Implement

### duplicateDependencyTypes

Detect when a package appears in multiple dependency types within the same workspace (e.g., both `dependencies` and `devDependencies`).

### missingWorkspaceProtocol

Ensure internal workspace dependencies use the `workspace:*` protocol instead of version ranges.
