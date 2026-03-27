export const denyAllPermissionRequests = async () => ({
  hookSpecificOutput: {
    hookEventName: "PermissionRequest" as const,
    decision: {
      behavior: "deny" as const,
      message:
        "Planning mode does not allow operations that require permission.",
    },
  },
});
