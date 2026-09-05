# GitHub Actions

Use [deploy.yml](deploy.yml) and [cleanup.yml](cleanup.yml) as workflow outlines in `.github/workflows/`.

Fill in app path, package name, production branch, hostname, and stable stack name.

Replace command placeholders with the monorepo's install, dependency build, app build, and lint commands.

Use the repository's action versions, pinned pnpm version, and supported Node version.

Add provider credentials from GitHub secrets only for selected infrastructure.

Use the same app-and-stage concurrency group for deployment and cleanup.

Keep PR credentials restricted to trusted repository branches.

Report deployed, skipped, or failed accurately, with the preview URL only after successful deployment.

If preview state is absent, skip cleanup; report state lookup failures instead of treating them as absence.

Destroy only the matching PR stage and preserve production and shared resources.

Keep workflows direct; add no change detectors or deployment-history helpers.
