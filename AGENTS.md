# Agent instructions

- README files follow [docs/readme-conventions.md](docs/readme-conventions.md).
  Read it before creating or changing any `README.md` in this monorepo.
- Every changeset bumps `patch`, breaking changes included: the packages are
  still on `0.x`.
- Never name `code` (`apps/code`) in a changeset. It is private, deployed
  rather than released, and ignored by changesets: a changeset naming it
  beside another package fails the release. A change only to `code` needs no
  changeset.
- Merge PRs with `gh pr merge --rebase`, never squash, so every commit lands
  on `main` as it is. Push `main` before branching from it, so a PR carries
  only its own commits.
