# Explainers are finished once generated; the Foundation may break them

An Explainer is done the moment its video is generated. From then on it is
kept for record only, and the Foundation is free to make breaking changes to
it. We keep the build passing by fixing type and syntax errors in old
Explainers, but we never repair how an old Explainer looks, times, or sounds
unless someone deliberately reopens it. The rejected alternatives were
pinning each Explainer to a frozen Foundation (old videos never improve,
several Foundations to maintain) and versioning every behavior change beside
the old one with a before/after impact check (safe, but too much ceremony for
videos that are already out).

## Consequences

- Everything that produces a video is committed. The rendered MP4 is not: it
  goes to a git-ignored `generated/` folder and can be rebuilt at any time,
  though not always identically once the Foundation has moved on.
- Old Explainers are reviewed in Remotion Studio, not by keeping their
  renders.
