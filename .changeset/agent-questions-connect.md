---
'@kestack/connect': patch
---

A Session's Agent Questions reach the code App Group: `agentQuestions` streams every Session's questions whole, again on each change, and `answerQuestion` answers one, or declines it with null. They live only while their Turn runs, are never stored, and go when it ends, cancelled or not; answering one no longer asked fails with `HarnessFailed`.
