---
'@kestack/auth-toolkit': patch
---

`@kestack/auth-toolkit/fake`: `fakeSigning(signIn)`, the Guard's client half for a device on a Sign-in of its own (`fakeSignIn`): every call signed as that device, whatever other `Signing` is around, so a device's client built in a browser tab no longer signs as the tab's Active Account, or fails once nobody is signed in there.
