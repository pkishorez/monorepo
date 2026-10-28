---
'@kestack/connect': patch
---

The code Plugin streams each Session's Agent Questions (`agentQuestions`) and answers them (`answerQuestion`, null to decline). Questions live only while their Turn runs. Answering one no longer asked fails with `QuestionNotAsked`.
