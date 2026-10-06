---
'@kstackz/auth-toolkit': patch
---

On a phone, `manageAccounts` opens the Auth Worker's Home Page in the system sign-in sheet (expo-web-browser's auth session) instead of Safari, so the User is still signed in there: on iOS the sheet keeps its own cookies. iOS asks first, as for a sign-in. `expo-web-browser` is a new optional peer, used only by the expo entry.
