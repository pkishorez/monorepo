# Nested pages

A URL names a place and the places around it, and all of their data arrives together.

A docs page sits inside the docs, a cart inside the shop. Each place has its own Loader, and none waits on another: you never thread a parent's data down to a child.

On the server, [a nested page arrives with the Input of every place it names](kabuki-start/nested-pages/nested-places-load-together), static or dynamic. Modes mix: [your cart is drawn from your cookie, inside a shop that is the same for everyone](kabuki-start/nested-pages/your-cart-inside-a-shop-for-everyone). In the browser, [a report and its dashboard are loaded in one request](kabuki-start/nested-pages/a-report-loads-with-its-dashboard-in-one-request).
