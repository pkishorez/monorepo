---
'@kstackz/auth-toolkit': patch
---

`authExpo` refreshes a User's Access Token from what secure storage holds at that moment, and shares the refresh in flight with every `authExpo` on the device, so it never spends a refresh token another one already rotated (which would revoke the User's chain). The Test Sign-In on the Login Screen goes back with the reason when it fails, instead of continuing as if signed in.
