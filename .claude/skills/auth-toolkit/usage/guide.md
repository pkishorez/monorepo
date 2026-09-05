# Usage

## Resolve access

Inspect the requested endpoints, group annotations, handlers, server layers, and installed toolkit RPC examples.

Follow [application setup](../setup/guide.md) first if authentication wiring is missing.

Use authentication to require a valid session and authorization to add permission rules.

Clarify whether a restriction controls sign-in or endpoint access; service-wide sign-in restrictions belong in [infrastructure](../infrastructure/guide.md).

## Add guards

Import `Authz` from `auth-toolkit/rpc` in RPC definitions safe for browser imports.

Require a session with `Authz.guard()` or a permission with `Authz.guard(Authz.policy(invariant, reason))`.

Use the toolkit’s Effect rule form when an invariant cannot express the policy.

For existing `GetProfile` and `ExportReport` definitions, require login for one and a company email for the other:

```ts
import { Authz } from 'auth-toolkit/rpc';

const companyAccount = Authz.policy(
  ({ user }) => user.email.endsWith('@example.com'),
  'An example.com account is required',
);

const ProtectedGetProfile = GetProfile.pipe(Authz.guard());
const ProtectedExportReport = ExportReport.pipe(Authz.guard(companyAccount));
```

Compose guarded definitions into the RPC group using a form supported by the installed Effect runtime.

Keep the example’s email restriction scoped to the call; other accounts may still sign in.

Inspect inherited policies before applying endpoint or group guards.

An endpoint policy overrides the group policy; an empty `Authz.guard()` preserves inherited authorization.

Combine rules explicitly when both must hold.

## Supply services

Keep policy declarations and service contracts safe for browser imports, supplying implementations with server authentication layers.

Read the verified user and session through `Authz.CurrentAuth` in handlers.

Keep business workflows in operations and follow [RPC boundaries](../../software-factory/core/rpc/guide.md).

## Verify

Check affected calls with an invalid session, a permitted session, and a denied policy where applicable.

Expect `Authz.VerificationUnavailable` when verification is unavailable, `Authz.Unauthenticated` for invalid sessions, and `Authz.Forbidden` for denied policies.

Check inheritance when changing group guards.

For focused tests, replace `Authz.Resolver` while keeping real guards and policies active.

Check affected types and Laymos rules, then report changed endpoints and their access requirements.
