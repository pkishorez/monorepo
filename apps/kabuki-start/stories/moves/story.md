# Moves

After the first page, a click loads only the data that changed, and Back and Forward load nothing.

A site that reloads the whole page on every click is slow, and one that refetches on Back is slower. Your links are `Router.Link`s to Routes; the browser takes over from there.

[A click loads only the places that changed, in one request](kabuki-start/moves/a-click-loads-only-what-changed): the list of posts stays, only the post is fetched. [While a move waits on its Input, the page stays and a bar says where it is going](kabuki-start/moves/the-page-stays-while-a-move-waits), read with `usePending()`. Each history entry keeps what it was drawn from, so [Back and Forward draw what was loaded before, asking the server nothing](kabuki-start/moves/back-and-forward-ask-the-server-nothing).
