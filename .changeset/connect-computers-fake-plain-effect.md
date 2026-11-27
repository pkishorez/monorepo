---
'@kestack/connect': patch
---

`@kestack/connect/fake`: `computers` is a Fake made with `@kestack/kabuki/fake`, no Kabuki Actor. Its state is each computer as it is now, its disk (the File System fake's tree) included; its controls are `AddComputer`, `GoOffline`, `ComeOnline`, `Remove`, `AddSampleProject`, `AddFolder` and `AddFile`, each on a computer named by its id; its Layer gives `Computers` as before. Nothing is kept across a reload. Breaking: `ComputersFake`, `ComputerFake`, `ComputerFakeLive`, `serveComputers`, `ROOT_CONTROLS`, `COMPUTER_CONTROLS` and `blank` are gone. Its state also counts the computers ever added, so a removed computer's id is never given again.
