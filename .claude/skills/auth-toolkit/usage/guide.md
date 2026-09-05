# Usage

Protect the requested RPC endpoints. Inspect their definitions, group annotations, handlers, and server layers. Read the installed toolkit's RPC documentation and examples. If application authentication wiring is missing, follow [Application setup](../setup/guide.md) first.

Distinguish authentication from authorization. Authentication requires a valid session. Authorization adds the requested permission rule. If a restriction could mean either who may sign in or who may call an endpoint, resolve that scope before implementing; service-wide sign-in restrictions belong in [Infrastructure](../infrastructure/guide.md).

Import `Authz` from `auth-toolkit/rpc` in browser-safe RPC definitions. Attach `Authz.guard()` for authentication. Build permission rules with `Authz.policy(invariant, reason)` and attach them with `Authz.guard(policy)`. Use the toolkit's Effect rule form when an invariant cannot express the requested policy.

For example, given existing `GetProfile` and `ExportReport` RPC definitions:

```ts
import { Authz } from 'auth-toolkit/rpc';

const companyAccount = Authz.policy(
  ({ user }) => user.email.endsWith('@example.com'),
  'An example.com account is required',
);

const ProtectedGetProfile = GetProfile.pipe(Authz.guard());
const ProtectedExportReport = ExportReport.pipe(Authz.guard(companyAccount));
```

Compose the guarded definitions into the application's RPC group. `GetProfile` requires login; `ExportReport` also requires a company email. The email rule applies to that call, so other accounts may still sign in.

Apply guards to the requested endpoint or group. Inspect inherited policies before changing them: an endpoint policy overrides a group policy, and an empty `Authz.guard()` preserves inherited authorization. Combine rules explicitly when both must hold. Use a group composition form supported at runtime by the installed Effect version.

Keep policy declarations and service contracts safe for browser imports. Supply policy service implementations on the server with the authentication layers. Handlers can read the verified user and session through `Authz.CurrentAuth`; keep business workflows in operations. Follow [software-factory's RPC boundaries](../../software-factory/rpc/guide.md).

Verify the affected calls with no valid session, a permitted session, and a rejected policy where applicable. Check that unavailable verification returns `Authz.VerificationUnavailable`, missing or invalid sessions return `Authz.Unauthenticated`, and denied policies return `Authz.Forbidden`. Exercise group inheritance when changing group guards. For focused tests, replace `Authz.Resolver` while keeping real guards and policies active.

Check affected types and Laymos rules. Report which endpoints changed and what access each now requires.
