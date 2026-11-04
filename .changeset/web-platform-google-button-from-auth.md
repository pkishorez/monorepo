---
'@kestack/web-platform': patch
---

`GoogleButton` (`ui/components/google-button`) is now auth-toolkit's (`@kestack/auth-toolkit/google-button`), re-exported, so an app and the Auth Worker draw the same button.

- It takes a `label`, one of the words Google's branding guidelines allow ("Sign in with Google", "Continue with Google", "Sign up with Google"), and a `theme` of `light`, `dark` or `auto`, which follows the page's dark mode.
- It loads its font, Google Sans Medium as Google's guidelines say, only on a page that draws it, where before it named Roboto and fell back to Arial.
- Its width grows with its label, from Google's 183px up to 400px. It no longer centers itself: pass `className="mx-auto"` for that. A `className` given to it is added to its own instead of replacing them.
- Its prop types are exported as `GoogleButtonProps`, `GoogleButtonLabel` and `GoogleButtonTheme`.
