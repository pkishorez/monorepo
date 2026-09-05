# Set up a web application

## 1. Ask for the settings

Ask related questions together; keep them short.

“Where should the app live, and what is its production URL?”

“What storage do you want: IndexedDB, DynamoDB, SQLite, or an existing database?”

“For the backend, do you want a normal Worker or a Durable Object?”

“Would you like GitHub Actions?”

Infer the app name from its folder; skip backend questions for client-only apps.

For SQLite or combined stores, ask only what is needed to identify the host and each store's role.

## 2. Generate the application

Summarize the choices, then apply the selected [template overlays](templates/README.md) using [setup rules](rules.md). Reuse their wiring and architecture configuration; consult architecture references only when the selected setup needs a boundary the templates do not cover.

Generate the homepage, hello-world connection, selected storage, and optional workflows together.

Install selected dependencies and update workspace links and the lockfile; leave verification to the checkpoints below.

Leave business entities and modeling for after setup.

## 3. Checkpoint: local review

Run preliminary lint and TypeScript checks. TanStack Start owns route generation through `pnpm dev` and the normal build. Never write, copy, or invoke a standalone generator for `routeTree.gen.ts`; never add a stub or suppress its type errors.

If TypeScript is blocked only by missing generated route metadata before the first dev run, report that check as pending and continue to local review. After the user's dev run creates it, rerun TypeScript. Fix unrelated errors before review.

When preliminary checks pass, or only framework route generation is pending:
Say: “Code generation is complete. Run `pnpm dev` from `<app-path>` and open `<local-url>`. Please test and let me know if it works.”

Describe the greeting and connection result the user should see, and any missing local prerequisites. Include the toolkit styling in local review: the page should use the configured font and theme colors, and backend overlays should render a styled Refresh button. After route generation, verify the normal production build processes both client and SSR imports and includes the toolkit CSS.

Fix reported problems, then return to this checkpoint.

## 4. Checkpoint: GitHub Actions

After local acceptance and the user's go-ahead to push, commit the app changes, push the current branch, and create or update its PR.

When GitHub Actions is selected, follow the run until deployment finishes; fix failures within the agreed setup scope.

After successful deployment, use agent-browser to check the preview greeting and selected RPC connection.

Report the workflow and browser results with the preview URL, then ask the user to verify the preview.

A skipped deployment is not a verified preview; explain the reason and resolve it when a preview is expected.

Finish setup after preview acceptance, or after local acceptance when GitHub Actions was declined.

Continue with [modeling and features](../../../core/feature.md) when requested.

Resume from existing code and the conversation in later sessions; use no separate setup tracking file.
