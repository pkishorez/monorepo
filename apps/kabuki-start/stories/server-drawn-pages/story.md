# Server-drawn pages

A page for one person is drawn by the server for each request, from the cookies it carries.

An account page must show who is signed in, from the first byte, and must never be cached. Mark the place `render: 'dynamic'`, and its Loader is handed the request too: it reads the session and fails with `Route.redirect(Routes.SignIn())` when there is none.

[A signed-out visitor asking for the account is sent to sign in](kabuki-start/server-drawn-pages/a-signed-out-visitor-is-sent-to-sign-in), and [each signed-in person gets an account page drawn for them](kabuki-start/server-drawn-pages/each-person-gets-their-own-account). In the browser the same Loader runs behind each click, with the same cookie: [signing in opens your account, and signing out closes it](kabuki-start/server-drawn-pages/sign-in-then-sign-out).
