---
'@kestack/ai-toolkit': patch
---

Speech to Text fetches the Parakeet model's files one by one from its Hugging Face copy, pinned to one revision, several times faster than GitHub; each file is named only once whole, and a restart carries on its part. When Hugging Face fails, it falls back to the GitHub release's tarball.
