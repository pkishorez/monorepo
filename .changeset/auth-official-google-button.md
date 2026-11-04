---
'@kestack/auth-toolkit': patch
---

Google's own sign-in button is one component, at the new `@kestack/auth-toolkit/google-button` door, and the Auth Worker's Login Screen and Device Screen draw it.

**Added**

- `GoogleButton` (`@kestack/auth-toolkit/google-button`): the GSI material button as Google's branding guidelines draw it, with only Google's words ("Sign in with Google", "Continue with Google", "Sign up with Google") and a `light`, `dark` or `auto` theme; `auto` is dark under `.dark` or `data-theme="dark"`. It brings Google Sans Medium, the guidelines' font, from `@fontsource/google-sans` (its Latin file, 23 KB), declared in the button's own style, so a browser fetches it only on a page that draws the button, and uses one installed on the computer first. The app's bundler ships the file, imported `?url`. It sets no margin or width: place it with `className`.

**Changed**

- The Login Screen and the Device Screen draw that button in place of their own, 40px tall as Google's is. It says only Google's words: where it said "Sign in as {email}", it says "Sign in with Google" and the line above it names the account. It has no spinner: while the page leaves for Google it disables, and "Opening Google…" shows under it.
