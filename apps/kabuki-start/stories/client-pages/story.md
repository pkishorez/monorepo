# Client pages

A page that only makes sense in the browser is loaded and drawn there, with its title already in the HTML.

A live dashboard or a playground has nothing worth drawing on the server, and its code can be heavy. Mark the place `render: 'client'` and give it a lazy View: the server sends the page around it, and the browser does the rest.

[A client page arrives with its title and description, and the browser draws the rest](kabuki-start/client-pages/a-client-page-arrives-with-its-metadata-but-not-its-content). Then [the dashboard is loaded and drawn in the browser, and keeps ticking](kabuki-start/client-pages/the-dashboard-comes-alive-in-the-browser), its data and its code fetched side by side. Under a page the server drew, [a client place fills in after the page around it arrives](kabuki-start/client-pages/a-client-place-fills-in-under-a-server-drawn-one).
