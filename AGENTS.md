# Agent instructions

- README files follow [docs/readme-conventions.md](docs/readme-conventions.md).
  Read it before creating or changing any `README.md` in this monorepo.
- Every changeset bumps `patch`, breaking changes included: the packages are
  still on `0.x`.
- Merge PRs with `gh pr merge --rebase`, never squash, so every commit lands
  on `main` as it is. Push `main` before branching from it, so a PR carries
  only its own commits.
