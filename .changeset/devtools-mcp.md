---
'@kestack/devtools': patch
---

The DevTools Server serves MCP at `/mcp`, on its own port: `lotel_*` tools read the traces and logs Lotel holds, and `kabuki_*` tools read and move the Kabuki apps connected to DevTools. Add it with `claude mcp add --transport http devtools http://127.0.0.1:14400/mcp`.

An Instance is named by its Actor, or its key or parent when the Actor has more than one, and `kabuki_look` lists only the Messages a person sends, those with a description. `kabuki_send` and `kabuki_control` answer with what the app changed once it settles.
