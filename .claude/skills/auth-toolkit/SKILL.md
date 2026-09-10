---
name: auth-toolkit
description: Everything related to auth and authorisation
---

## Phases

Pick one phase from the request. Each phase has a primitive in `primitives/`. Follow its README.

- Creating or updating the auth infrastructure: use `auth-worker`.
- Adding login to an app: use `client`.
- Requiring login or a permission on an API: use `server-rpc`.

If a phase needs an earlier one, do that one first and say so.

## Infrastructure

Auth has two instances: production, and a local one for local dev. Nothing else. Both come from the same package: an Auth Worker with its D1 database, set up by the primitive.

Ask for the production URL and the local URL. Suggest the local URL as the production host with its last label replaced by `computer`. From each host, suggest the defaults: the cookie domain is the host minus its first label, and every origin under it is trusted. Suggest a cookie cache of 5 minutes. Ask if the user wants any changes. Confirm before creating files.

Never deploy locally.

## Login

Login is a `<SignIn />` component with KUI's `GoogleButton`, wired to `authClient`. Place it on the page the user names. Local dev talks to the local instance, deployed stages to production.

## Server

To guard a group or a request with login, pipe it through `Authz.guard()`. To guard it with a policy, pass the policy to `Authz.guard(...)`. Write the policy inline, or build it once with `Authz.policy(invariant, reason)` and reuse it. Guards live in the RPC group definition, next to the RPCs they protect.

If the RPC host does not provide `authzLayer` yet, set that up first.

Who may sign in is decided in the Auth Worker. Who may call an RPC is decided in the app.

## Verification

Run `pnpm install` at the root. From the package, all of these must pass:

```sh
pnpm build # apps only. This generates routeTree.gen.ts.
pnpm lint
pnpm test
```

`grep -r "__" <folder>` must find no placeholder.

Finish by listing what changed and which secrets or Google settings the user still has to add by hand.
