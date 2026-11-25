---
'@kestack/auth-toolkit': patch
---

`@kestack/auth-toolkit/fake`: the Sign-in fake is a Fake made with `@kestack/kabuki/fake`, no Kabuki Actor. Breaking: `signIn` is now `signIn({ cache })`, a Fake for `FakeWorld.make` whose state is who is signed in and the sign-in asking who, whose controls are `SignInAs` and `Cancel` (was `CancelSignIn`), and whose Layer gives the browser's `Accounts` and signing. A sign-in finishes on the page that asked: it never leaves for `returnTo`. An email outside kestack.test is refused by `SignInAs`, saying why, and the sign-in keeps asking. `browserOver`, `SignInFake`, `SIGN_IN_CONTROLS`, `blank`, `kept`, `SIGNED_IN_AS`, `FAKE_DOMAIN`, `FAKE_AUTH_WORKER` and `FAKE_MARK` are gone, and `fakeAccounts` takes no `returnTo`; a choice outside kestack.test signs nobody in.
