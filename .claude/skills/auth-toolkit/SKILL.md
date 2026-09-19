---
name: auth-toolkit
description: Everything related to auth and authorisation
---

## The one idea

Every program that asks the Auth Worker "who is this" is either First-Party or Third-Party, and that split decides everything else.

- First-Party: a program the user owns, where the User signs in to the product. A web app or their own CLI. The Identity Role handles it, the credential is a Session, backends see a Session Principal. Nothing to register, nothing to consent to.
- Third-Party: a program they did not write that wants to act as the User against their server, such as an MCP client. The Authorization Server Role handles it: the program is a Client Application, the User consents to Scopes, the credential is an Access Token bound to one Resource Server, backends see a Token Principal.

Say which one the request is before picking a phase. Never bring Scopes, resources, or client registration into a First-Party story.

## Phases

Pick one phase from the request. Each phase has a primitive in `primitives/`. Follow its README.

- Creating or updating the auth infrastructure: use `auth-worker`.
- Adding login to a web app: use `client`.
- Requiring login or a permission on an API: use `server-rpc`.
- Signing a CLI in (Device Login): use `cli`.
- Offering tools to MCP clients behind login: use `mcp-server`.

If a phase needs an earlier one, do that one first and say so.

## Infrastructure

Auth has two instances: production, and a local one for local dev. Nothing else. Both come from the same package: an Auth Worker with its D1 database, set up by the primitive. The same handler serves the Home Page, login, and device pages on every deployment, and the consent page with the Authorization Server Role on; all ship prebuilt inside auth-toolkit.

Ask for the production URL and the local URL. Suggest the local URL as the production host with its last label replaced by `computer`. From each host, suggest the defaults: the cookie domain is the host minus its first label, and every origin under it is trusted. Suggest a cookie cache of 5 minutes. Ask if the user wants any changes. Confirm before creating files.

Never deploy locally.

## Login

Login is a `<SignIn />` component with KUI's `GoogleButton`, wired to `authClient`. Place it on the page the user names. Local dev talks to the local instance, deployed stages to production.

## Server

To guard a group or a request with login, pipe it through `Authz.guard()`. To guard it with a policy, pass the policy to `Authz.guard(...)`. Write the policy inline, or build it once with `Authz.policy(invariant, reason)` and reuse it. Guards live in the RPC group definition, next to the RPCs they protect.

If the RPC host does not provide `authzLayer` yet, set that up first.

Who may sign in is decided in the Auth Worker. Who may call an RPC is decided in the app. A CLI's Device Login token is a Session and is accepted by every guard with no opt-in. Whether an app accepts Access Tokens from MCP clients is the `resource` on its `resolverLive`; the Auth Worker lists that same URL in `authorizationServer.resources`.

## CLI

A CLI is First-Party. `CliAuth` from `auth-toolkit/cli` is an Effect service: `CliAuth.layer({ authWorkerUrl, app, version })` needs `HttpClient`, `FileSystem`, and `Path` (`FetchHttpClient.layer` and `NodeServices.layer`). `login` runs Device Login and stores the Session in `$XDG_STATE_HOME/<app>/auth.json` (`~/.local/state/<app>/auth.json` by default); `logout`, `whoami`, and `token` do what they say. Provide `CliAuth.rpcSession` next to an RPC client and every call carries the Session. A missing or dead Session fails with `SignedOut`; the remedy is `login`. Connection, 5xx, rejected-request, and incompatible-response failures have their own `AuthWorker*` errors; print their `message`. The Auth Worker needs nothing new. The `cli` primitive is the template: a CLI plus the small guarded RPC server it calls.

## MCP Server

An MCP Server is a Resource Server that accepts only Access Tokens. `createMcpResourceServer` from `auth-toolkit/server/mcp` wraps the protocol handler: it publishes the Protected Resource Metadata MCP clients follow to the Auth Worker, refuses every request without a valid token for this exact `resource`, and hands the Token Principal to the tools. The Auth Worker lists the resource, the Scopes, and sets `clientRegistration: 'dynamic+cimd'` so clients can register themselves. The `mcp-server` primitive is the template; keep deployed instances identical to it.

## Verification

Run `pnpm install` at the root. From the package, all of these must pass:

```sh
pnpm build # apps only. This generates routeTree.gen.ts.
pnpm lint
pnpm test
```

`grep -r "__" <folder>` must find no placeholder.

Finish by listing what changed and which secrets or Google settings the user still has to add by hand.
