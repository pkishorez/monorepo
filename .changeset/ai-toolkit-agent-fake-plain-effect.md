---
'@kestack/ai-toolkit': patch
---

`@kestack/ai-toolkit/harness/fake`: `agent({ home, paceMs })` returns a Fake made with `@kestack/kabuki/fake`, no Kabuki Actor. Its state is the recording replies replay, the Agents open on their models and settings, the replies running and the Context Usage; its control `ReplyWith` pins the recording; its Layer gives `Harnesses`, `OneShotPrompt`, `HarnessHost` and `Models` as before. Breaking: `agent` is a function now, with no `actor`, `controls`, `serve` or `kept`; `agentOver`, `AgentFake`, `AGENT_CONTROLS`, `blank`, `RECORDINGS` and `RECORDING_NAMES` are gone; `makeFakeHarness` and `FAKE_SKILLS` stay.
