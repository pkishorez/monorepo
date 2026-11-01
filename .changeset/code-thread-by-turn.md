---
'code': patch
---

Streaming into a long session is quicker. Only the turns whose messages changed are rebuilt, so new words in the last turn rebuild just that turn, however long the session. In a 150-turn session on a CPU slowed 4x, a streamed chunk takes 7.1 ms instead of 18.3 ms.
